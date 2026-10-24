"""Photo QC gate (MVP_BRIEF §6.1). CV layer → `input_quality`.

Forgiving by design: most problems produce `warn` (the photo is still analysed and the model is told about the
issue); only clearly unusable photos are `reject`. `passed = front != reject` (D20: only the front photo is required).
All thresholds live in config/qc.yaml. Every issue code the UI may receive is listed in QC_REASON_CODES (web copy in
web/lib/copy/zh.ts must cover each one).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import yaml
from PIL import Image

from .cv import (
    LEFT_BROW,
    LEFT_EYE,
    LIPS_OUTER,
    MODELS,
    RIGHT_BROW,
    RIGHT_EYE,
    Face,
    as_rgb,
    face_oval_mask,
    hull_mask,
)

ROOT = Path(__file__).resolve().parents[2]
QC_PATH = ROOT / "config" / "qc.yaml"
ROLE_ZH = {"front": "正脸", "profile90": "90° 侧脸", "noglasses": "无眼镜正脸", "profile45": "45° 侧脸",
           "smile": "微笑", "hair": "发型照"}
QC_REASON_CODES = ("no_face", "multiple_faces", "face_too_small", "blurry", "underexposed", "overexposed",
                   "pose_off_axis", "wrong_angle_for_role", "occluded_eyes", "lighting_inconsistent",
                   "beauty_filter_suspect", "eyewear_detected", "profile_unclear")


@lru_cache(maxsize=2)
def load_qc_config(path: str | None = None) -> dict[str, Any]:
    return yaml.safe_load(Path(path or QC_PATH).read_text(encoding="utf-8"))


@dataclass
class PhotoCheck:
    role: str
    status: str
    issues: list[str]
    face: Face | None
    rgb: np.ndarray
    face_count: int = 0
    yaw: float | None = None
    pitch: float | None = None
    roll: float | None = None
    blur_score: float | None = None
    face_luma_mean: float | None = None
    face_box_px: int | None = None
    clipped_frac: float | None = None
    lab_ab_mean: tuple[float, float] | None = None   # mean a*, b* (OpenCV 0–255) inside the face oval
    skin_texture: float | None = None                 # cheek median gradient (beauty_filter_suspect)
    edge_width: float | None = None                   # feature edge width in px at the evaluation scale (D28)
    rejects: set[str] = field(default_factory=set)
    extra: dict[str, Any] = field(default_factory=dict)   # role-specific results (profile90: trace, seg)

    def entry(self) -> dict[str, Any]:
        """The schema `input_quality.photos[]` item."""
        return {
            "photo_id": self.role, "status": self.status, "face_count": self.face_count,
            "yaw": self.yaw, "pitch": self.pitch, "roll": self.roll,
            "blur_score": self.blur_score, "face_luma_mean": self.face_luma_mean,
            "face_box_px": self.face_box_px, "issues": self.issues,
        }


def _blur(gray_crop: np.ndarray) -> float:
    h, w = gray_crop.shape[:2]
    s = min(1.0, 512 / max(h, w))   # down only: upsampling invents softness
    small = cv2.resize(gray_crop, (max(1, int(w * s)), max(1, int(h * s))), interpolation=cv2.INTER_AREA)
    return float(cv2.Laplacian(small, cv2.CV_64F).var())


def _crop(rgb: np.ndarray, box: tuple[int, int, int, int], pad: float = 0.12) -> np.ndarray:
    x0, y0, x1, y1 = box
    px, py = int((x1 - x0) * pad), int((y1 - y0) * pad)
    h, w = rgb.shape[:2]
    return rgb[max(0, y0 - py):min(h, y1 + py), max(0, x0 - px):min(w, x1 + px)]


def _visible_face_box(face: Face, shape: tuple[int, int]) -> tuple[int, int, int, int] | None:
    """Landmark bounds intersected with the photo; inferred off-image pixels provide no resolution."""
    if not np.isfinite(face.landmarks[:, :2]).all():
        return None
    h, w = shape
    x0, y0, x1, y1 = face.box
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
    return (x0, y0, x1, y1) if x1 > x0 and y1 > y0 else None


def _pose_issues(role: str, yaw: float, pitch: float, roll: float, cfg: dict) -> tuple[list[str], set[str]]:
    lim = cfg["gate"]["pose"].get(role)
    if not lim:
        return [], set()
    factor = cfg["gate"]["pose_reject_factor"]
    issues, rejects = [], set()
    ay, ap, ar = abs(yaw), abs(pitch), abs(roll)
    if role == "profile45":
        if ay < lim["yaw_min"] or ay > lim["yaw_max"]:
            issues.append("wrong_angle_for_role")
            if ay < cfg["gate"]["profile45_reject_below_yaw"]:
                rejects.add("wrong_angle_for_role")
    elif ay > lim["yaw_max"]:
        issues.append("pose_off_axis")
        if ay > lim["yaw_max"] * factor:
            rejects.add("pose_off_axis")
    if ap > lim["pitch_max"] or ar > lim["roll_max"]:
        if "pose_off_axis" not in issues:
            issues.append("pose_off_axis")
        if ap > lim["pitch_max"] * factor or ar > lim["roll_max"] * factor:
            rejects.add("pose_off_axis")
    return issues, rejects


def check_photo(im: Image.Image | np.ndarray, role: str, cfg: dict | None = None) -> PhotoCheck:
    cfg = cfg or load_qc_config()
    g = cfg["gate"]
    rgb = as_rgb(im)
    visible = [(f, box) for f in MODELS.faces(rgb) if (box := _visible_face_box(f, rgb.shape[:2])) is not None]
    visible.sort(key=lambda item: -(item[1][2] - item[1][0]) * (item[1][3] - item[1][1]))
    faces = [f for f, _ in visible]
    face_optional = role in cfg["photo_roles"].get("face_optional", [])

    # Faces that matter: ignore tiny background faces (posters, passers-by).
    main = faces[0] if faces else None
    areas = [(b[2] - b[0]) * (b[3] - b[1]) for _, b in visible]
    counted = [area for area in areas if area >= g["multi_face_min_rel_area"] * areas[0]]
    pc = PhotoCheck(role=role, status="ok", issues=[], face=main, rgb=rgb, face_count=len(counted))

    if main is None:
        if face_optional:  # e.g. the back of the head — judge sharpness/exposure on the whole frame
            gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
            pc.blur_score = round(_blur(gray), 1)
            if pc.blur_score < g["blur_laplacian_var_min"]:
                pc.issues.append("blurry")
            return _finish(pc)
        pc.issues, pc.rejects = ["no_face"], {"no_face"}
        return _finish(pc)
    if len(counted) > 1:
        pc.issues.append("multiple_faces")
        pc.rejects.add("multiple_faces")

    pc.yaw, pc.pitch, pc.roll = main.pose()
    x0, y0, x1, y1 = visible[0][1]
    pc.face_box_px = min(x1 - x0, y1 - y0)
    h, w = rgb.shape[:2]
    rel = max((y1 - y0) / h, (x1 - x0) / w)
    if rel < g["face_rel_min"]:
        pc.issues.append("face_too_small")
        if rel < g["face_rel_reject"]:
            pc.rejects.add("face_too_small")

    # Keep the schema's existing detail-quality code. Messages distinguish native resolution from softness;
    # cropping/zooming cannot add pixels, so only relative framing is called face_too_small.
    if pc.face_box_px < g["min_face_box_px"]:
        pc.issues.append("blurry")
        if pc.face_box_px < g["min_face_box_px_reject"]:
            pc.rejects.add("blurry")

    sharp = feature_sharpness(rgb, main, g)
    if sharp is None:
        # A detector box alone is not evidence of measurable features (occlusion / excessive crop / no detail).
        pc.issues.append("no_face")
        pc.rejects.add("no_face")
    else:
        pc.edge_width, detail = sharp
        pc.blur_score = round(detail, 1)
        soft = pc.edge_width > g["detail_min_edge_width"]
        if pc.edge_width > g["edge_width_warn"] or (soft and detail < g["detail_px_warn"]):
            pc.issues.append("blurry")
            if pc.edge_width > g["edge_width_reject"] or (soft and detail < g["detail_px_reject"]):
                pc.rejects.add("blurry")

    mask = face_oval_mask(main, rgb.shape[:2]) > 0
    if mask.sum() > 50:
        face_px = rgb[mask]
        luma = float((face_px @ np.array([0.299, 0.587, 0.114])).mean())
        pc.face_luma_mean = round(luma, 1)
        pc.clipped_frac = round(float((face_px.max(axis=1) >= 250).mean()), 4)
        lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)[mask]
        pc.lab_ab_mean = (float(lab[:, 1].mean()), float(lab[:, 2].mean()))
        if luma < g["face_luma_min"]:
            pc.issues.append("underexposed")
            if luma < g["face_luma_reject_min"]:
                pc.rejects.add("underexposed")
        elif luma > g["face_luma_max"] or pc.clipped_frac > g["clipped_highlight_max_frac"]:
            pc.issues.append("overexposed")
            if luma > g["face_luma_reject_max"] or pc.clipped_frac > g["clipped_highlight_reject_frac"]:
                pc.rejects.add("overexposed")

    if pc.yaw is not None:
        issues, rejects = _pose_issues(role, pc.yaw, pc.pitch, pc.roll, cfg)  # type: ignore[arg-type]
        pc.issues += issues
        pc.rejects |= rejects
    if role in g.get("eyewear_roles", []) and eyewear_hint(rgb, main, g):
        pc.issues.append("eyewear_detected")               # warn only: glasses are allowed (D35)
    if role in g["beauty_filter_roles"] and "blurry" not in pc.issues:
        pc.skin_texture = skin_texture(rgb, main)
        if pc.skin_texture is not None and pc.skin_texture < g["beauty_filter_cheek_texture_min"]:
            pc.issues.append("beauty_filter_suspect")   # warn only: never rejects (filters are common)
    return _finish(pc)


def eyewear_hint(rgb: np.ndarray, face: Face, g: dict[str, Any], seg: np.ndarray | None = None) -> bool:
    """Glasses hint: share of segmenter "others" (accessories) pixels in the eye + brow band. Warn-only."""
    from .cv import SEG_OTHERS

    try:
        seg = MODELS.segment(rgb) if seg is None else seg
    except Exception:  # noqa: BLE001 — a hint never fails the check
        return False
    band = hull_mask(rgb.shape[:2], face.pts(RIGHT_EYE + LEFT_EYE + RIGHT_BROW + LEFT_BROW)) > 0
    if band.sum() < 50:
        return False
    return float((seg[band] == SEG_OTHERS).mean()) > g.get("eyewear_others_frac", 0.08)


def check_profile90(im: Image.Image | np.ndarray, cfg: dict | None = None) -> PhotoCheck:
    """True side profile (~90°). Angle → resolution → outline, in that order, so the reason shown is the useful one.

    MediaPipe may or may not find a face at 90°; when it does, its nose tip must lie on the traced outline (in a 45°
    photo the far cheek is in front of it). The trace is kept in `extra` for the measurement layer."""
    from .face_metrics.profile import ProfileUnavailable, profile_masks, trace_profile

    cfg = cfg or load_qc_config()
    g = cfg["gate"]
    pg = g["profile90"]
    rgb = as_rgb(im)
    faces = MODELS.faces(rgb)
    main = faces[0] if faces else None
    counted = [f for f in faces if main and f.box_area >= g["multi_face_min_rel_area"] * main.box_area]
    pc = PhotoCheck(role="profile90", status="ok", issues=[], face=main, rgb=rgb, face_count=max(1, len(counted)))
    if len(counted) > 1:
        pc.issues.append("multiple_faces")
        pc.rejects.add("multiple_faces")
    if main is not None:
        pc.yaw, pc.pitch, pc.roll = main.pose()
        pc.face_box_px = main.box_short_side
        if pc.yaw is not None and abs(pc.yaw) < pg["frontal_yaw_below"]:
            pc.issues.append("wrong_angle_for_role")
            pc.rejects.add("wrong_angle_for_role")
            return _finish(pc)
    seg = MODELS.segment(rgb)
    pc.extra["seg"] = seg
    try:
        _, skin = profile_masks(seg)
    except ProfileUnavailable:
        pc.issues, pc.rejects = ["no_face"], {"no_face"}
        return _finish(pc)
    ys = np.nonzero(skin)[0]
    face_h = float(ys.max() - ys.min())
    pc.extra["face_h_px"] = round(face_h, 1)
    mask = skin
    luma = float((rgb[mask] @ np.array([0.299, 0.587, 0.114])).mean())
    pc.face_luma_mean = round(luma, 1)
    if luma < g["face_luma_min"]:
        pc.issues.append("underexposed")
        if luma < g["face_luma_reject_min"]:
            pc.rejects.add("underexposed")
    elif luma > g["face_luma_max"]:
        pc.issues.append("overexposed")
        if luma > g["face_luma_reject_max"]:
            pc.rejects.add("overexposed")
    if face_h < pg["face_h_px_warn"]:
        pc.issues.append("face_too_small")
        if face_h < pg["face_h_px_reject"]:
            pc.rejects.add("face_too_small")
            return _finish(pc)
    try:
        trace = trace_profile(rgb, seg, main)
    except ProfileUnavailable as e:
        pc.issues.append("no_face" if e.reason == "no_face" else "profile_unclear")
        pc.rejects.add(pc.issues[-1])
        pc.extra["reason"] = e.reason
        return _finish(pc)
    # Keep the attempted geometry for offline diagnostics even when the nose/outline gate rejects it.
    # Consumers must still honor status (the production measurement path does).
    pc.extra.update(trace=trace, seg=seg, facing=trace.facing, scale_px=round(trace.scale_px, 1))
    if trace.nose_gap is not None and trace.nose_gap > pg["max_nose_gap"]:
        pc.issues.append("wrong_angle_for_role")
        pc.rejects.add("wrong_angle_for_role")
        pc.extra["nose_gap"] = round(trace.nose_gap, 3)
        return _finish(pc)
    return _finish(pc)


def _eval_crop(rgb: np.ndarray, face: Face, max_face_px: int) -> tuple[np.ndarray, float, np.ndarray]:
    """Grayscale face crop (+10% margin) scaled DOWN so the face is ≤ max_face_px wide — never up (D28).

    Returns (float32 crop, scale, crop origin in image pixels)."""
    box = _visible_face_box(face, rgb.shape[:2])
    if box is None:
        raise ValueError("Face has no usable bounds in the photo")
    x0, y0, x1, y1 = box
    fw = max(1, x1 - x0)
    pad = int(0.1 * fw)
    h, w = rgb.shape[:2]
    cx0, cy0 = max(0, x0 - pad), max(0, y0 - pad)
    gray = cv2.cvtColor(rgb[cy0:min(h, y1 + pad), cx0:min(w, x1 + pad)], cv2.COLOR_RGB2GRAY)
    s = min(1.0, max_face_px / fw)
    if s < 1.0:
        gray = cv2.resize(gray, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    return gray.astype(np.float32), s, np.array([cx0, cy0], np.float64)


def _gradients(crop: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    gx = cv2.Sobel(crop, cv2.CV_32F, 1, 0, ksize=3) / 8.0    # /8: intensity change per pixel
    gy = cv2.Sobel(crop, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    return gx, gy


def feature_sharpness(rgb: np.ndarray, face: Face, g: dict[str, Any]) -> tuple[float, float] | None:
    """(edge_width px, detail_px) from the eyes, brows and lips.

    Per region: contrast (p95 − p5 intensity) / strongest gradient (p98) is the width of its sharpest edges in pixels —
    independent of lighting and of how smooth the skin is. The median over regions is robust to one occluded feature.
    """
    box = _visible_face_box(face, rgb.shape[:2])
    if box is None:
        return None
    crop, s, origin = _eval_crop(rgb, face, g["sharp_eval_face_px"])
    gx, gy = _gradients(crop)
    mag = np.hypot(gx, gy)
    fw = (box[2] - box[0]) * s
    grow = max(1, int(0.015 * fw))
    widths, widths_x = [], []
    for idx in (RIGHT_EYE, LEFT_EYE, RIGHT_BROW, LEFT_BROW, LIPS_OUTER):
        m = hull_mask(crop.shape, (face.pts(idx) - origin) * s)
        m = cv2.dilate(m, np.ones((3, 3), np.uint8), iterations=grow) > 0
        if m.sum() < 30:
            continue
        v = crop[m]
        contrast = float(np.percentile(v, 95) - np.percentile(v, 5))
        peak, peak_x = float(np.percentile(mag[m], 98)), float(np.percentile(np.abs(gx[m]), 98))
        if contrast < 8 or peak <= 0:      # flat region (e.g. hidden under hair): no information
            continue
        widths.append(contrast / peak)
        widths_x.append(contrast / max(peak_x, 1e-3))
    if not widths:
        return None
    edge = max(float(np.median(widths)), float(np.median(widths_x)) / g["sharp_x_factor"])
    return round(edge, 2), fw * 1.6 / edge


def skin_texture(rgb: np.ndarray, face: Face, max_face_px: int = 256) -> float | None:
    """Median gradient inside both cheek discs, on the same down-only scale as feature_sharpness.

    Beauty filters smooth skin while keeping edges (eyes, hairline) sharp, so near-zero cheek texture on an otherwise
    sharp photo suggests a filter. Naturally smooth skin overlaps with mild filtering, so this is a warn-only signal
    with a conservative limit (config/qc.yaml).
    """
    cheek_w = float(np.linalg.norm(face.pts(234) - face.pts(454)))
    if cheek_w < 40:
        return None
    crop, s, origin = _eval_crop(rgb, face, max_face_px)
    gx, gy = _gradients(crop)
    mag = np.hypot(gx, gy)
    fw = (face.box[2] - face.box[0]) * s
    vals = []
    for eye_outer, mouth, sign in ((33, 61, -1), (263, 291, 1)):
        c = ((face.pts(eye_outer) + face.pts(mouth)) / 2 - origin) * s
        c[0] += sign * 0.06 * fw
        r = max(3, int(0.08 * fw))
        x, y = int(c[0]), int(c[1])
        patch = mag[max(0, y - r): y + r, max(0, x - r): x + r]
        if patch.size > 50:
            vals.append(float(np.median(patch)))
    return round(min(vals), 2) if vals else None


def _finish(pc: PhotoCheck) -> PhotoCheck:
    pc.issues = list(dict.fromkeys(pc.issues))
    pc.status = "reject" if pc.rejects else ("warn" if pc.issues else "ok")
    return pc


def messages_for(issues: list[str], cfg: dict | None = None, role: str | None = None,
                 *, face_box_px: int | None = None) -> list[str]:
    cfg = cfg or load_qc_config()
    msgs = {**cfg["retake_messages_zh"], **(cfg.get("retake_messages_role_zh", {}).get(role or "", {}))}
    if face_box_px is not None and face_box_px < cfg["gate"]["min_face_box_px"]:
        msgs["blurry"] = cfg["retake_messages_context_zh"]["low_face_resolution"]
    return [msgs[i] for i in issues if i in msgs]


def check_role(im: Image.Image | np.ndarray, role: str) -> PhotoCheck:
    return check_profile90(im) if role == "profile90" else check_photo(im, role)


def check_photo_with_messages(im: Image.Image | np.ndarray, role: str) -> dict[str, Any]:
    pc = check_role(im, role)
    # The issues that caused a reject come first: that is what the person must fix.
    ordered = sorted(pc.issues, key=lambda i: i not in pc.rejects)
    return {**pc.entry(), "issues": ordered, "messages": messages_for(ordered, role=role, face_box_px=pc.face_box_px)}


def lighting_consistency(checks: list[PhotoCheck], cfg: dict | None = None) -> str:
    lc = (cfg or load_qc_config())["lighting_consistency"]
    ab = [c.lab_ab_mean for c in checks if c.lab_ab_mean is not None and c.status != "reject"]
    if len(ab) < 2:
        return "unknown"
    a, b = zip(*ab, strict=True)
    spread = max(max(a) - min(a), max(b) - min(b))
    if spread < lc["high_if_spread_below"]:
        return "high"
    return "medium" if spread < lc["medium_if_spread_below"] else "low"


def input_quality(checks: list[PhotoCheck], cfg: dict | None = None) -> dict[str, Any]:
    cfg = cfg or load_qc_config()
    by_role = {c.role: c for c in checks}
    passed = all(r in by_role and by_role[r].status != "reject" for r in cfg["photo_roles"]["required"])
    guidance: list[str] = []
    # What blocks comes first: rejected photos before warnings, and each photo's reject reasons before the rest.
    for c in sorted(checks, key=lambda c: c.status != "reject"):
        rejects = getattr(c, "rejects", set())
        for m in messages_for(sorted(c.issues, key=lambda i: i not in rejects), cfg, c.role,
                              face_box_px=getattr(c, "face_box_px", None)):
            line = f"{ROLE_ZH.get(c.role, c.role)}：{m}"
            if line not in guidance:
                guidance.append(line)
    lighting = lighting_consistency(checks, cfg)
    if lighting == "low":
        guidance.append(cfg["retake_messages_zh"]["lighting_inconsistent"])
    return {
        "passed": passed,
        "photos": [c.entry() for c in checks],
        "lighting_consistency": lighting,
        "retake_guidance": [g[:120] for g in guidance],
    }
