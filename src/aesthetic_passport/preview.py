"""AI preview ("AI 试看"): a local edit of the user's front photo with a deterministic identity guarantee.

    target (hair tier / rec id) → spec → masks (edit, core, edge) → deterministic prompt → crop + pad → provider
    → un-pad, resize back → landmark registration of the generated head onto the original face (or reject)
    → original/result hair union with a narrow integration band
    → core (eyes, nose, mouth + pad, at the original and the generated positions) is always original;
      hairline, temples and revealed ears can integrate
    → stable-skin Lab lighting correction → edge-guided feather → core forced to original pixels
    → quality gates (enough change in the edit region; one face whose features sit where the original's do)
    → visible "AI 试看" label + AIGC metadata

So whatever the model returns, the eyes, nose and mouth are the user's own pixels, and no displaced copy of a
feature from the generated image is let in around them (Issue #56).
"""
from __future__ import annotations

import copy
import json
import math
import re
import time
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .cv import (
    LEFT_BROW,
    LEFT_EYE,
    LIPS_OUTER,
    MODELS,
    RIGHT_BROW,
    RIGHT_EYE,
    SEG_FACE_SKIN,
    SEG_HAIR,
    CVUnavailable,
    Face,
    hull_mask,
)
from .imaging import open_rgb, save_jpeg
from .masks import NOSE_HULL, _dilate, edit_mask, feathered_alpha, head_crop_box, overlay, protected_region
from .providers.image import ImageEditError, ImageEditProvider
from .qc import load_qc_config

ROOT = Path(__file__).resolve().parents[2]
PROMPT_PATH = ROOT / "prompts" / "image_edit.md"
PROFESSIONAL = {"hair": "barber or hairstylist", "facial_hair": "barber or hairstylist", "brows": "brow artist",
                "glasses": "optician", "clothing_top": "stylist"}
REGION_EN = {"hair": "hair", "brows": "eyebrows", "glasses": "eyeglasses", "facial_hair": "facial hair",
             "clothing_top": "top (shirt, collar and neckline)"}
PAD_MULTIPLE = 16


KIND_REGION = {"hair": "hair", "glasses": "glasses", "neckline": "clothing_top"}
REGION_KIND = {v: k for k, v in KIND_REGION.items()}
TIERS = ("safe", "bold", "easy")
# Look Studio (D30): a hair target is a direction or "current" (keep the haircut), optionally with a hair colour from
# analysis.color_profile.hair_color_directions — one edit, always from the original photo. e.g. bold, bold_hc1, current_hc2.
HAIR_TARGET = re.compile(r"^(safe|bold|easy|current)(?:_hc([0-9]))?$")
KEEP_CUT = ("the same haircut as now: keep the current length, layers, fringe, parting, volume and styling exactly "
            "as they are")


class QualityGateFailed(RuntimeError):
    """The model answered, but the result is not a usable preview. Another generation may be: retried, then
    `fallback`. `detail` is safe to show."""

    detail = "试看生成失败"


class LowChange(QualityGateFailed):
    """The quality gate failed: the result barely differs from the original in the edit region."""

    detail = "这次的试看与原图差别太小"


class MisalignedEdit(QualityGateFailed):
    """The generated face is missing, duplicated, moved too far or reshaped, or the composite does not show one face
    whose features sit where the original's do (Issue #56). Never shown as a successful preview."""

    detail = "这次的试看五官位置有偏差，已舍弃"


# Rigid, hair-independent landmarks for registration: eye corners, nose bridge/tip/base, mouth corners and midline,
# chin and cheekbones. Brows are left out (a fringe can hide them); the forehead/hairline points move with the cut.
REGISTRATION_POINTS = [33, 133, 362, 263, 168, 6, 1, 2, 61, 291, 0, 17, 152, 234, 454]
FEATURE_GROUPS = (LEFT_EYE, RIGHT_EYE, LEFT_BROW, RIGHT_BROW, LIPS_OUTER, NOSE_HULL)


class PreviewError(RuntimeError):
    """User-facing failure; `detail` is safe to show. The report falls back to the text recommendation."""

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


@dataclass(frozen=True)
class EditPrompt:
    version: str
    template: str
    negative: str
    hair_integration: str = ""


@lru_cache(maxsize=2)
def load_edit_prompt(path: str | None = None) -> EditPrompt:
    text = Path(path or PROMPT_PATH).read_text(encoding="utf-8")
    version = re.search(r"`prompt_version:\s*([^`]+)`", text)
    template = re.search(r"^## Template\s*\n+```\s*\n(.*?)```", text, re.DOTALL | re.MULTILINE)
    negative = re.search(r"^## Negative prompt\s*\n+```\s*\n(.*?)```", text, re.DOTALL | re.MULTILINE)
    if not (version and template and negative):
        raise ValueError(f"{PROMPT_PATH.name}: could not find version / Template / Negative prompt")
    hair = re.search(r"^## Hair integration\s*\n+```\s*\n(.*?)```", text, re.DOTALL | re.MULTILINE)
    return EditPrompt(version.group(1).strip(), template.group(1).strip(), negative.group(1).strip(),
                      hair.group(1).strip() if hair else "")


def build_prompt(spec: dict[str, Any]) -> str:
    """Deterministic: the same visual_edit_spec always yields the same prompt (no model free-writing)."""
    config = load_edit_prompt()
    tpl = config.template
    fixed = tpl.split("{preserve_joined}", 1)[1].lower()  # words the template already guarantees
    preserve = [p.strip() for p in spec["preserve"] if p.strip() and p.strip().lower() not in fixed]
    prompt = tpl.format(region_en=REGION_EN[spec["region"]], target_description=spec["target_description"].strip(),
                        preserve_joined=", ".join(dict.fromkeys(preserve)) or "the rest of the photo",
                        professional=PROFESSIONAL[spec["region"]],
                        hair_integration=config.hair_integration if spec["region"] == "hair" else "")
    return " ".join(prompt.split())  # one line, single spaces


def usable_preview_recs(passport: dict[str, Any]) -> list[str]:
    """Recs that may be previewed: have a spec whose region matches the category (C7 not raised)."""
    bad = {r for f in passport["derived"]["consistency_flags"] if f["code"] == "C7" for r in f["affected"]}
    excluded = {e["rec_id"] for e in passport["derived"]["excluded_recommendations"]
                if e["reason"] in ("violates_constraint", "dangling_evidence")}
    return [r["id"] for r in passport["analysis"]["recommendations"]
            if r.get("visual_edit_spec") and r["id"] not in bad and r["id"] not in excluded]


def display_box(box: tuple[int, int, int, int], shape: tuple[int, int], aspect: float = 4 / 5) -> tuple[int, int, int, int]:
    """Grow the head crop to a 4:5 (w:h) frame for the before/after slider, staying inside the image."""
    x0, y0, x1, y1 = box
    h, w = shape
    bw, bh = x1 - x0, y1 - y0
    if bw / bh > aspect:   # too wide → grow height (downward first: shoulders read better than empty sky)
        nh = min(h, round(bw / aspect))
        y1 = min(h, y0 + nh)
        y0 = max(0, y1 - nh)
    else:                  # too tall → grow width around the centre
        nw = min(w, round(bh * aspect))
        cx = (x0 + x1) // 2
        x0 = max(0, min(w - nw, cx - nw // 2))
        x1 = x0 + nw
    return x0, y0, x1, y1


def _pad(img: np.ndarray, m: int = PAD_MULTIPLE) -> tuple[np.ndarray, tuple[int, int]]:
    h, w = img.shape[:2]
    ph, pw = (-h) % m, (-w) % m
    return np.pad(img, ((0, ph), (0, pw), (0, 0)), mode="edge"), (h, w)


def _restore_crop(image: Image.Image, padded: np.ndarray) -> np.ndarray:
    """Undo model scaling, accepting size-grid rounding but never stretching a reframed face."""
    h, w = padded.shape[:2]
    ow, oh = image.size
    if abs(ow * h - oh * w) > PAD_MULTIPLE * (w + h):
        raise PreviewError("试看构图发生变化，请换一个发型方向重试")
    return np.asarray(image.convert("RGB").resize((w, h), Image.Resampling.LANCZOS))


@dataclass
class PreviewResult:
    rec_id: str
    image_model: str
    prompt: str
    after_path: Path
    before_path: Path
    latency_ms: int
    cost_usd_est: float | None
    protected_pixels: int
    composite: np.ndarray | None = None   # pre-encoding pixels (tests use it to prove the identity guarantee)


def render_preview(
    front: Path | Image.Image,
    passport: dict[str, Any],
    rec_id: str,
    *,
    provider: ImageEditProvider,
    out_path: Path,
    debug_dir: Path | None = None,
) -> PreviewResult:
    recs = {r["id"]: r for r in passport["analysis"]["recommendations"]}
    if rec_id not in usable_preview_recs(passport):
        raise PreviewError("这条建议不适合用照片预览")
    spec = recs[rec_id]["visual_edit_spec"]
    region = spec["region"]
    cfg = load_qc_config()

    rgb = np.asarray(front if isinstance(front, Image.Image) else open_rgb(front)).copy()
    try:
        faces = MODELS.faces(rgb)
        seg = MODELS.segment(rgb)
    except CVUnavailable as e:
        raise PreviewError("照片检测服务暂时不可用") from e
    if not faces:
        raise PreviewError("没有在正脸照里找到人脸")
    face = faces[0]
    shape = rgb.shape[:2]
    prot = protected_region(face, shape, region, cfg)
    (x0, y0, x1, y1), edited, window, result_face, res, prompt = generate_registered(
        rgb, face, seg, spec, cfg, provider)
    composite, core, mask = composite_edit(rgb, edited, face, seg, region, window, cfg, result_face=result_face)
    verify_composite(composite, face, window, cfg)
    prot = core if region == "hair" and cfg["preview_masks"].get("soft_protection", True) else prot

    # The slider shows a matched head crop of before and after (4:5), not the whole frame.
    dx0, dy0, dx1, dy1 = display_box((x0, y0, x1, y1), shape)
    save_jpeg(Image.fromarray(composite[dy0:dy1, dx0:dx1]), out_path, quality=95)
    before_path = out_path.with_name("before_" + out_path.name.removeprefix("preview_"))
    save_jpeg(Image.fromarray(rgb[dy0:dy1, dx0:dx1]), before_path, quality=95)
    if debug_dir is not None:
        debug_dir.mkdir(parents=True, exist_ok=True)
        Image.fromarray(overlay(rgb, {"edit": mask & ~prot, "protected": prot})).save(debug_dir / f"mask_{rec_id}.jpg")
        Image.fromarray(edited).save(debug_dir / f"raw_{rec_id}.jpg")
    return PreviewResult(rec_id, res.model, prompt, out_path, before_path, res.latency_ms, res.cost_usd_est,
                         int(prot.sum()), composite)


def preview_block(passport: dict[str, Any], rec_id: str, *, status: str, image_model: str | None = None,
                  after_ref: str | None = None, prompt: str | None = None) -> dict[str, Any]:
    """The schema `preview` object."""
    before = after_ref.replace("preview_", "before_") if after_ref else "front"
    return {"rec_id": rec_id, "status": status, "image_model": image_model, "before_ref": before,
            "after_ref": after_ref, "identity_check": "unchecked", "prompt_used": prompt}


def log_preview_call(run_dir: Path, rec_id: str, result: PreviewResult | None, error: str | None) -> None:
    rec = {"kind": "image_edit", "rec_id": rec_id, "ok": result is not None,
           "model": result.image_model if result else None, "latency_ms": result.latency_ms if result else None,
           "cost_usd_est": result.cost_usd_est if result else None, "error": error,
           "prompt_version": load_edit_prompt().version}
    run_dir.mkdir(parents=True, exist_ok=True)
    with (run_dir / "calls.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


# ---------------------------------------------------------------------------------------------------------------
# V2 engine (B1): targets, soft protection, colour transfer, quality gate, AI label
# ---------------------------------------------------------------------------------------------------------------
def _with_hair_color(spec: dict[str, Any], passport: dict[str, Any], index: int) -> dict[str, Any]:
    colors = passport["analysis"]["color_profile"].get("hair_color_directions", [])
    if index >= len(colors):
        raise PreviewError("没有这个发色方向")
    c = colors[index]
    desc = (f"{spec['target_description'].rstrip('. ')}. Hair color: {c['name']} ({c['hex']}) — recolor all of the "
            "hair evenly to this shade, a natural salon-dyed result with realistic depth and shine; this hair color "
            "replaces any color mentioned before.")
    return {**spec, "target_description": desc}


def target_spec(passport: dict[str, Any], kind: str, target_id: str) -> dict[str, Any]:
    """The visual_edit_spec for a preview target, or PreviewError when it cannot be previewed."""
    an = passport["analysis"]
    region = KIND_REGION.get(kind)
    if region is None:
        raise PreviewError("不支持的试看类型")
    spec = None
    hair = HAIR_TARGET.match(target_id) if kind == "hair" else None
    if hair:
        base, hc = hair.group(1), hair.group(2)
        if base == "current":
            if hc is None:
                raise PreviewError("保持现在的发型时需要选择一个发色")
            spec = {"region": "hair", "target_description": KEEP_CUT,
                    "preserve": ["hair length", "haircut shape", "fringe", "face shape", "eyes", "skin tone"]}
        else:
            opt = next((o for o in an.get("hair_options", []) if o["tier"] == base), None)
            excluded = {c["tier"] for c in passport["derived"].get("hair_option_checks", []) if c["status"] == "excluded"}
            if opt is None or base in excluded:
                raise PreviewError("这个发型方向与你的条件不符，暂不生成试看")
            spec = opt["visual_edit_spec"]
        if spec and hc is not None:
            spec = _with_hair_color(spec, passport, int(hc))
    elif target_id in usable_preview_recs(passport):
        spec = next(r for r in an["recommendations"] if r["id"] == target_id)["visual_edit_spec"]
    if not spec or spec["region"] != region:
        raise PreviewError("这条建议不适合用照片预览")
    return spec


def is_previewable(passport: dict[str, Any], kind: str, target_id: str) -> bool:
    try:
        target_spec(passport, kind, target_id)
    except PreviewError:
        return False
    return True


def preview_targets(passport: dict[str, Any]) -> dict[str, list[str]]:
    """Every previewable target per kind (for the API's validation and the UI)."""
    out: dict[str, list[str]] = {k: [] for k in KIND_REGION}
    for kind, targets in out.items():
        for t in (*TIERS, *[r["id"] for r in passport["analysis"]["recommendations"]]):
            try:
                target_spec(passport, kind, t)
            except PreviewError:
                continue
            targets.append(t)
    return out


def core_region(face: Any, shape: tuple[int, int], region: str, pad_px: int) -> np.ndarray:
    """Eyes, nose and mouth hulls (+ brows for non-hair/brow/glasses edits), padded and never edited.

    Hair can occlude eyebrows; visible eyebrow pixels are protected separately by composite_edit.
    """
    feats = [LEFT_EYE, RIGHT_EYE, LIPS_OUTER, NOSE_HULL]
    if region not in ("hair", "brows", "glasses"):
        feats += [LEFT_BROW, RIGHT_BROW]
    core = np.zeros(shape, bool)
    for f in feats:
        core |= hull_mask(shape, face.pts(f)) > 0
    return _dilate(core, pad_px)


def lab_transfer(edited: np.ndarray, original: np.ndarray, sample: np.ndarray, apply: np.ndarray) -> np.ndarray:
    """Remove the median Lab lighting cast over stable skin, preserving hair colour/strand contrast.

    Matching skin standard deviation to hair amplified noise and crushed highlights. A robust offset removes
    the common cast without fitting the target hair's distribution to the original haircut or colour.
    """
    if sample.sum() < 200 or apply.sum() == 0:
        return edited
    e = cv2.cvtColor(edited, cv2.COLOR_RGB2LAB).astype(np.float32)
    o = cv2.cvtColor(original, cv2.COLOR_RGB2LAB).astype(np.float32)
    delta = np.median(o[sample] - e[sample], axis=0)
    corrected = e.copy()
    corrected[apply] += delta
    converted = cv2.cvtColor(corrected.clip(0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB)
    out = edited.copy()
    out[apply] = converted[apply]
    return out


@lru_cache(maxsize=1)
def _label_font(px: int) -> tuple[Any, bool]:
    cfg = load_qc_config()["preview_label"]
    for path in cfg["font_candidates"]:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, px), True
            except OSError:
                continue
    return ImageFont.load_default(), False


def add_ai_label(img: Image.Image) -> Image.Image:
    """Visible label bottom-left (《人工智能生成合成内容标识办法》 explicit marking)."""
    cfg = load_qc_config()["preview_label"]
    out = img.convert("RGB").copy()
    h = out.height
    px = max(12, round(h * cfg["height_frac"]))
    font, cjk = _label_font(px)
    text = cfg["text"] if cjk else cfg["ascii_fallback"]
    draw = ImageDraw.Draw(out, "RGBA")
    x0, y0, x1, y1 = draw.textbbox((0, 0), text, font=font)
    pad = max(4, px // 3)
    bx, by = pad, h - (y1 - y0) - 3 * pad
    draw.rounded_rectangle((bx, by, bx + (x1 - x0) + 2 * pad, by + (y1 - y0) + 2 * pad), radius=pad,
                           fill=(20, 22, 24, 170))
    draw.text((bx + pad - x0, by + pad - y0), text, font=font, fill=(237, 235, 230, 255))
    return out


def aigc_metadata(produce_id: str) -> str:
    """Implicit marking (GB 45438-2025 field names), ASCII-safe JSON for JPEG COM / EXIF."""
    cfg = load_qc_config()["preview_label"]
    meta = {"Label": "1", "ContentProducer": cfg["producer"], "ProduceID": produce_id, "ReservedCode1": "",
            "ContentPropagator": "", "PropagateID": "", "ReservedCode2": ""}
    return json.dumps({"AIGC": meta}, ensure_ascii=True)


def save_labeled_jpeg(img: Image.Image, path: Path, produce_id: str, quality: int = 95) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    meta = aigc_metadata(produce_id)
    exif = Image.Exif()
    exif[0x010E] = meta          # ImageDescription
    add_ai_label(img).save(path, format="JPEG", quality=quality, exif=exif.tobytes(), comment=meta.encode("ascii"))
    return path


def read_aigc(path: Path) -> dict[str, Any] | None:
    with Image.open(path) as im:
        raw = im.info.get("comment") or im.getexif().get(0x010E)
    if not raw:
        return None
    text = raw.decode("ascii") if isinstance(raw, bytes) else raw
    return json.loads(text).get("AIGC")


@dataclass
class TargetResult:
    kind: str
    target_id: str
    image_model: str
    prompt: str
    after_path: Path
    before_path: Path
    latency_ms: int
    cost_usd_est: float | None
    change: float
    composite: np.ndarray | None = None
    core: np.ndarray | None = None


@dataclass
class PreviewTrace:
    """Operational milestones only: never include prompts, pixels, landmarks or measured quality values."""

    started_at: float = field(default_factory=time.perf_counter)
    stages: list[dict[str, Any]] = field(default_factory=list)
    model: str | None = None
    provider_latency_ms: int | None = None
    cost_usd_est: float | None = None

    @property
    def elapsed_ms(self) -> int:
        return int((time.perf_counter() - self.started_at) * 1000)

    def mark(self, stage: str) -> None:
        self.stages.append({"stage": stage, "elapsed_ms": self.elapsed_ms})


def crop_box_path(after: Path) -> Path:
    return after.with_suffix(".json")


def read_crop_box(after: Path) -> list[float] | None:
    try:
        box = json.loads(crop_box_path(after).read_text())["crop_box"]
    except (OSError, ValueError, KeyError, TypeError):
        return None
    return [float(x) for x in box] if isinstance(box, list) and len(box) == 4 else None


def _cheek_px(face: Any) -> float:
    return max(1.0, float(np.linalg.norm(face.pts(234) - face.pts(454))))


def _faces_in_window(img: np.ndarray, face: Any, window: np.ndarray, min_area_frac: float) -> list[Any]:
    """Faces detected in `img` whose centre lies in the edited window and that are not tiny next to the original."""
    try:
        found = MODELS.faces(img)
    except CVUnavailable as e:
        raise PreviewError("照片检测服务暂时不可用") from e
    h, w = window.shape
    out = []
    for f in found:
        x0, y0, x1, y1 = f.box
        cx, cy = min(w - 1, max(0, (x0 + x1) // 2)), min(h - 1, max(0, (y0 + y1) // 2))
        if window[cy, cx] and f.box_area >= min_area_frac * face.box_area:
            out.append(f)
    return out


def register_edit(rgb: np.ndarray, edited: np.ndarray, face: Any, window: np.ndarray, cfg: dict[str, Any],
                  ) -> tuple[np.ndarray, np.ndarray, Any]:
    """Put the generated head back onto the original face, or reject it (Issue #56).

    Image-edit models may move, zoom or tilt the head slightly. The composite admits generated pixels around the
    hair (hairline, temples, revealed ears), and those pixels carry the moved features: a second pair of brows
    under a fringe, stacked ears. The generated face's rigid landmarks give a similarity transform back onto the
    original; hair moves with its head, so the cut stays where the model put it relative to the face.
    Returns (aligned edited image, window limited to pixels the model produced, aligned generated Face).
    """
    rc = cfg["preview_masks"]["registration"]
    found = _faces_in_window(edited, face, window, rc["min_face_area_frac"])
    if not found:
        raise MisalignedEdit("no face found in the generated image")
    if len(found) > 1:
        raise MisalignedEdit(f"{len(found)} faces in the generated image")
    gen = found[0]
    src = gen.pts(REGISTRATION_POINTS).astype(np.float32)
    dst = face.pts(REGISTRATION_POINTS).astype(np.float32)
    cheek = _cheek_px(face)
    shift = float(np.linalg.norm(src - dst, axis=1).max())
    if shift <= rc["min_shift_frac"] * cheek:
        return edited, window, gen              # already registered: no resampling
    m, _ = cv2.estimateAffinePartial2D(src, dst, method=cv2.LMEDS)
    if m is None:
        raise MisalignedEdit("the generated face could not be registered")
    scale = math.hypot(m[0, 0], m[1, 0])
    rotation = math.degrees(math.atan2(m[1, 0], m[0, 0]))
    residual = float(np.linalg.norm(src @ m[:, :2].T + m[:, 2] - dst, axis=1).max()) / cheek
    if shift / cheek > rc["max_shift_frac"] or abs(scale - 1) > rc["max_scale_dev"] \
            or abs(rotation) > rc["max_rotation_deg"]:
        raise MisalignedEdit(f"generated head moved too far (shift {shift / cheek:.3f}, scale {scale:.3f}, "
                             f"rotation {rotation:.1f})")
    if residual > rc["max_residual_frac"]:      # not a rigid move: the model reshaped or rearranged the face
        raise MisalignedEdit(f"generated face reshaped (residual {residual:.3f})")
    h, w = window.shape
    aligned = cv2.warpAffine(edited, m, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    produced = cv2.warpAffine(window.astype(np.uint8), m, (w, h), flags=cv2.INTER_NEAREST, borderValue=0) > 0
    lm = gen.landmarks.copy()
    lm[:, :2] = lm[:, :2] @ m[:, :2].T.astype(np.float64) + m[:, 2]
    return aligned, window & produced, Face(lm, None)


def verify_composite(composite: np.ndarray, face: Any, window: np.ndarray, cfg: dict[str, Any]) -> None:
    """The final picture must show one face whose eyes, brows, nose and mouth sit where the original's do.

    A doubled feature pulls the detected landmarks off the original (or yields a second face); either way the
    result is rejected instead of being saved as a successful preview.
    """
    rc = cfg["preview_masks"]["registration"]
    found = _faces_in_window(composite, face, window, rc["min_face_area_frac"])
    if len(found) != 1:
        raise MisalignedEdit(f"{len(found)} faces in the composite")
    got, cheek = found[0], _cheek_px(face)
    drift = max(float(np.linalg.norm(got.pts(g) - face.pts(g), axis=1).mean()) for g in FEATURE_GROUPS) / cheek
    if drift > rc["max_composite_drift_frac"]:
        raise MisalignedEdit(f"composite features moved (drift {drift:.3f})")


def generate_registered(rgb: np.ndarray, face: Any, seg: np.ndarray, spec: dict[str, Any], cfg: dict[str, Any],
                        provider: ImageEditProvider, trace: PreviewTrace | None = None,
                        ) -> tuple[tuple[int, int, int, int], np.ndarray, np.ndarray, Any, Any, str]:
    """Crop the head (more pixels on the hair), pad to the model's size grid, edit, un-pad, paste back, register.

    Returns (crop box, edited full-size image, window of usable edited pixels, generated Face, provider result,
    prompt)."""
    shape = rgb.shape[:2]
    x0, y0, x1, y1 = head_crop_box(face, shape, spec["region"], cfg, seg=seg)
    padded, (ch, cw) = _pad(rgb[y0:y1, x0:x1])
    prompt = build_prompt(spec)
    if trace is not None:
        trace.mark("provider_request")
    try:
        res = provider.edit(Image.fromarray(padded), prompt, negative_prompt=load_edit_prompt().negative)
    except ImageEditError as e:
        raise PreviewError("图像模型这次没有返回可用的结果") from e
    if trace is not None:
        trace.model, trace.provider_latency_ms, trace.cost_usd_est = res.model, res.latency_ms, res.cost_usd_est
        trace.mark("provider_completed")
    out_pad = _restore_crop(res.image, padded)
    edited = rgb.copy()
    edited[y0:y1, x0:x1] = out_pad[:ch, :cw]
    window = np.zeros(shape, bool)
    window[y0:y1, x0:x1] = True
    edited, window, result_face = register_edit(rgb, edited, face, window, cfg)
    if trace is not None:
        trace.mark("registration_completed")
    return (x0, y0, x1, y1), edited, window, result_face, res, prompt


def provider_for_attempt(provider: ImageEditProvider, attempt: int) -> ImageEditProvider:
    """A retry with a fixed seed tends to reproduce the same drifted result; give each attempt its own seed."""
    seed = getattr(provider, "seed", None)
    if attempt <= 0 or not isinstance(seed, int):
        return provider
    retry = copy.copy(provider)
    retry.seed = seed + attempt   # type: ignore[attr-defined]
    return retry


def composite_edit(rgb: np.ndarray, edited: np.ndarray, face: Any, seg: np.ndarray, region: str,
                   window: np.ndarray, cfg: dict[str, Any], *, result_face: Any | None = None,
                   ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(composite, core mask, edit mask) — the deterministic, testable heart of the preview.

    `result_face`: the generated image's landmarks (after registration). Its eyes, nose, mouth and visible brows
    are protected as well as the original's, so a residual offset can never admit a second copy of a feature.
    """
    pm = cfg["preview_masks"]
    shape = rgb.shape[:2]
    faces_ = (face,) if result_face is None else (face, result_face)
    core = np.zeros(shape, bool)
    for f in faces_:
        core |= core_region(f, shape, region, pm["core_pad_px"])
    edge = protected_region(face, shape, region, cfg) & ~core
    mask = edit_mask(face, seg, region, cfg) & window
    result_seg = None
    if region == "hair":
        try:
            result_seg = MODELS.segment(edited)
        except CVUnavailable as e:
            raise PreviewError("无法检测发型边缘，请稍后重试") from e
        hair = ((seg == SEG_HAIR) | (result_seg == SEG_HAIR)) & window
        # Replace removed hair as well as new hair. A small context band retains scalp, temple/ear occlusion,
        # fine strands and local shadows, without pasting the model's entire head-shaped background region.
        mask = _dilate(hair, pm["feather_px"]) & window
    if pm.get("soft_protection", True) and region == "hair":
        hard = core | (edge & ~mask)
        # Keeping brows in the immutable core amputated below-brow fringes. Protect visible brows, while
        # allowing actual generated hair to occlude them (eyes/nose/mouth remain immutable in either case).
        for brow in (LEFT_BROW, RIGHT_BROW):
            for f in faces_:
                brow_mask = _dilate(hull_mask(shape, f.pts(brow)) > 0, pm["core_pad_px"])
                hard |= brow_mask & (result_seg != SEG_HAIR)
    else:
        hard = core | edge                    # V1 behaviour: hard protection of the whole lower face
    mask &= ~hard
    if pm.get("color_transfer", True):
        if region == "hair":
            skin = (seg == SEG_FACE_SKIN) & (result_seg == SEG_FACE_SKIN) & ~_dilate(mask, pm["color_band_px"])
            skin &= window & (core | edge)
        else:
            band = _dilate(mask, pm["color_band_px"]) & ~mask & window
            skin = (seg == SEG_FACE_SKIN) & band
        edited = lab_transfer(edited, rgb, skin, mask)
    # Poisson cloning can import the original hair's colour into a recolour and wash out thin strands.
    if region != "hair" and pm.get("composite_mode", "feather") == "seamless" and mask.any():
        ys, xs = np.where(mask)
        center = (int((xs.min() + xs.max()) / 2), int((ys.min() + ys.max()) / 2))
        try:
            out = cv2.seamlessClone(edited, rgb, (mask * 255).astype(np.uint8), center, cv2.NORMAL_CLONE)
        except cv2.error:
            out = None
    else:
        out = None
    if out is None:
        alpha = feathered_alpha(mask, hard, pm["feather_px"], guide=edited if region == "hair" else None)
        # Fade at internal crop boundaries too; otherwise a crop that meets a mask produces a rectangular seam.
        distance = cv2.distanceTransform(window.astype(np.uint8), cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
        alpha *= np.clip(distance / max(1, pm["feather_px"]), 0, 1) * window
        out = (rgb.astype(np.float32) * (1 - alpha[..., None]) + edited.astype(np.float32) * alpha[..., None])
        out = out.round().astype(np.uint8)
    out[hard] = rgb[hard]                # the identity guarantee does not depend on float rounding
    return out, core, mask


def render_target(
    front: Path | Image.Image,
    passport: dict[str, Any],
    kind: str,
    target_id: str,
    *,
    provider: ImageEditProvider,
    out_dir: Path,
    debug_dir: Path | None = None,
    trace: PreviewTrace | None = None,
) -> TargetResult:
    """One preview target end to end. Raises PreviewError (user-facing) or QualityGateFailed (LowChange, MisalignedEdit)."""
    spec = target_spec(passport, kind, target_id)
    region = spec["region"]
    cfg = load_qc_config()
    rgb = np.asarray(front if isinstance(front, Image.Image) else open_rgb(front)).copy()
    try:
        faces = MODELS.faces(rgb)
        seg = MODELS.segment(rgb)
    except CVUnavailable as e:
        raise PreviewError("照片检测服务暂时不可用") from e
    if not faces:
        raise PreviewError("没有在正脸照里找到人脸")
    face = faces[0]
    shape = rgb.shape[:2]
    if trace is not None:
        trace.mark("input_ready")
    (x0, y0, x1, y1), edited, window, result_face, res, prompt = generate_registered(
        rgb, face, seg, spec, cfg, provider, trace)
    composite, core, mask = composite_edit(rgb, edited, face, seg, region, window, cfg, result_face=result_face)
    if trace is not None:
        trace.mark("composite_completed")
    change = float(np.abs(composite.astype(np.int16) - rgb.astype(np.int16))[mask].mean()) if mask.any() else 0.0
    if change < cfg["preview_masks"]["min_hair_change"]:
        raise LowChange(f"change {change:.1f} below gate")
    verify_composite(composite, face, window, cfg)    # a change score is not a success: check the face, too
    if trace is not None:
        trace.mark("quality_passed")
    dx0, dy0, dx1, dy1 = display_box((x0, y0, x1, y1), shape)
    name = f"{kind}_{target_id}.jpg"
    after = save_labeled_jpeg(Image.fromarray(composite[dy0:dy1, dx0:dx1]), out_dir / f"preview_{name}",
                              produce_id=f"{passport['passport_id']}:{kind}:{target_id}")
    before = out_dir / f"before_{name}"
    save_jpeg(Image.fromarray(rgb[dy0:dy1, dx0:dx1]), before, quality=95)
    # Where the crop sits on the original (normalised), so the Look Studio can lay the result back onto the full photo
    # and add local colour layers in the original's geometry. Lives in the media dir: deleted with the photos.
    h, w = shape
    crop_box_path(after).write_text(json.dumps({"crop_box": [round(dx0 / w, 5), round(dy0 / h, 5),
                                                             round(dx1 / w, 5), round(dy1 / h, 5)]}))
    if debug_dir is not None:
        debug_dir.mkdir(parents=True, exist_ok=True)
        Image.fromarray(overlay(rgb, {"edit": mask, "protected": core})).save(debug_dir / f"mask_{kind}_{target_id}.jpg")
    if trace is not None:
        trace.mark("preview_saved")
    return TargetResult(kind, target_id, res.model, prompt, after, before, res.latency_ms, res.cost_usd_est,
                        round(change, 2), composite, core)
