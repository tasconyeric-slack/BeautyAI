"""Face measurement profile (V3A, D34). CV layer → `passport.measurement_profile`.

    measure_profile(face, shape=…, yaw=…, pitch=…, seg=…, rgb=…, color_measurements=…) → (profile, points)

`profile` goes into the passport: values, units, availability, confidence and an overlay *spec* (names of points and
segments) per metric — never coordinates. `points` (normalized image coordinates of every named landmark and helper)
goes into geometry.json, which lives and dies with the front photo (24 h, invariant 7). The face page joins the two:
lines are drawn between the very points the numbers were computed from.

Definitions live in config/face_metrics.yaml. Missing data is explicit: a metric that cannot be measured has
`value: null`, `availability` and a `missing_reason` — it is never estimated, normalized away or filled by the model.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import yaml

from .compute import COMPUTE, Ctx, Missing
from .points import LANDMARKS, Frame, build_helpers, make_frame

ROOT = Path(__file__).resolve().parents[3]
REGISTRY_PATH = ROOT / "config" / "face_metrics.yaml"
LEVELS = ("low", "medium", "high")


@lru_cache(maxsize=1)
def load_registry(path: str | None = None) -> dict[str, Any]:
    return yaml.safe_load(Path(path or REGISTRY_PATH).read_text(encoding="utf-8"))


def _min_level(*levels: str | None) -> str:
    return LEVELS[min(LEVELS.index(lv) for lv in levels if lv is not None)]


def pose_level(yaw: float | None, pitch: float | None, sensitivity: str, cfg: dict[str, Any]) -> str:
    if yaw is None:
        return cfg["unknown_pose"]
    k = cfg["sensitivity_factor"][sensitivity]
    ay, ap = abs(yaw) * k, abs(pitch or 0.0) * k
    if ay < cfg["yaw_high_below"] and ap < cfg["pitch_high_below"]:
        return "high"
    if ay < cfg["yaw_medium_below"] and ap < cfg["pitch_medium_below"]:
        return "medium"
    return "low"


def _overlay(spec: dict[str, Any] | None) -> dict[str, Any]:
    spec = spec or {}
    return {
        "segments": [{"from": a, "to": b, "role": r} for a, b, r in spec.get("segments", [])],
        "angles": [{"a": a, "vertex": v, "b": b} for a, v, b in spec.get("angles", [])],
        "points": list(spec.get("points", [])),
        "outline": bool(spec.get("outline", False)),
        "silhouette": bool(spec.get("silhouette", False)),
    }


def _hairline(face: Any, seg: np.ndarray | None, f: Frame) -> tuple[float | None, bool]:
    """(hairline y in image pixels, forehead occluded). Same detector and plausibility window as anchors.thirds."""
    from ..anchors import _hairline_y
    from ..qc import load_qc_config

    y, occluded = _hairline_y(face, seg, load_qc_config()["anchors"]["landmarks"])
    if y is None:
        return None, occluded
    gx = f.raw(LANDMARKS["glabella"])[0]
    up = f.p("glabella")[1] - f.to_frame(np.array([gx, y]))[1]
    mid = f.dy("glabella", "subnasale")
    return (y, False) if 0.5 * mid <= up <= 1.8 * mid else (None, False)


def _cheek_samples(f: Frame, rgb: np.ndarray | None, seg: np.ndarray | None, cheek_w: float,
                   gates: dict[str, Any]) -> tuple[dict[str, np.ndarray], dict[str, tuple[float, float, float]] | None]:
    """Left / right cheek disc centres (image px) and their Lab medians (skin pixels, L 20–80th percentile)."""
    from ..cv import SEG_FACE_SKIN

    centres: dict[str, np.ndarray] = {}
    mid_x = float(f.raw(1)[0])
    for side, eye, mouth in (("l", 33, 61), ("r", 263, 291)):
        c = (f.raw(eye) + f.raw(mouth)) / 2
        c[0] += np.sign(c[0] - mid_x) * 0.06 * cheek_w
        centres[f"cheek_sample_{side}"] = c
    if rgb is None:
        return centres, None
    from ..color_sample import to_lab

    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    r = gates["cheek_disc_frac"] * cheek_w
    lab_out: dict[str, tuple[float, float, float]] = {}
    for name, (cx, cy) in centres.items():
        x0, x1 = max(0, int(cx - r)), min(w, int(cx + r) + 1)
        y0, y1 = max(0, int(cy - r)), min(h, int(cy + r) + 1)
        if x1 <= x0 or y1 <= y0:
            return centres, None
        disc = np.hypot(xx[y0:y1, x0:x1] - cx, yy[y0:y1, x0:x1] - cy) <= r
        if seg is not None:
            disc &= seg[y0:y1, x0:x1] == SEG_FACE_SKIN
        px = to_lab(rgb[y0:y1, x0:x1])[disc]
        if len(px) < gates["min_cheek_pixels"]:
            return centres, None
        lo, hi = np.percentile(px[:, 0], [20, 80])
        px = px[(px[:, 0] >= lo) & (px[:, 0] <= hi)]
        m = np.median(px, axis=0)
        lab_out[name] = (float(m[0]), float(m[1]), float(m[2]))
    return centres, lab_out


def _round(v: float) -> float:
    return round(float(v), 4)


@dataclass
class PhotoIn:
    """A frontal photo for the measurement layer (front, glasses-free or smile)."""

    face: Any
    shape: tuple[int, int]
    yaw: float | None = None
    pitch: float | None = None
    seg: np.ndarray | None = None
    rgb: np.ndarray | None = None


@dataclass
class SideIn:
    """The true-profile photo: a traced outline, or the reason it could not be measured."""

    shape: tuple[int, int]
    trace: Any = None                 # profile.ProfileTrace
    reason: str | None = None         # missing reason when trace is None


ROLE_ZH = {"front": "正脸", "noglasses": "无眼镜正脸", "profile90": "侧脸", "smile": "微笑"}


def _frame_ctx(ph: PhotoIn, reg: dict[str, Any], color: dict[str, Any] | None, *, hairline: bool,
               cheeks: bool) -> tuple[Frame, Ctx, dict[str, Any]]:
    gates = reg["gates"]
    f = make_frame(ph.face.landmarks)
    cheek_w = f.d("cheek_l", "cheek_r")
    eye_w = (f.d("eye_l_outer", "eye_l_inner") + f.d("eye_r_inner", "eye_r_outer")) / 2
    hair_y_img, occluded = _hairline(ph.face, ph.seg, f) if hairline and cheek_w > 1 else (None, False)
    centres, cheeks_lab = (_cheek_samples(f, ph.rgb, ph.seg, cheek_w, gates) if cheeks and cheek_w > 1
                           else ({}, None))
    build_helpers(f, hair_y_img, centres)
    mouth_w = f.d("mouth_l", "mouth_r")
    mouth_open = mouth_w > 1 and f.d("lip_upper_inner", "lip_lower_inner") / mouth_w > gates["mouth_open_ratio"]
    widths = (f.d("eye_l_outer", "eye_l_inner"), f.d("eye_r_inner", "eye_r_outer"))
    heights = (f.d("eye_l_top", "eye_l_bottom"), f.d("eye_r_top", "eye_r_bottom"))
    eyes_closed = any(w <= 1 or h / w < gates["eyes_closed_ratio"] for w, h in zip(widths, heights, strict=True))
    hair_frame_y = float(f.helpers["hairline"][1]) if "hairline" in f.helpers else None
    ctx = Ctx(cheek_w=cheek_w, eye_w=eye_w, hairline_y=hair_frame_y, upper_occluded=occluded,
              mouth_open=bool(mouth_open), eyes_closed=bool(eyes_closed), yaw=ph.yaw, gates=gates,
              color=color, cheeks_lab=cheeks_lab, rgb=ph.rgb, face=ph.face, seg=ph.seg, pitch=ph.pitch)
    flags = {"mouth_open": bool(mouth_open), "eyes_closed": bool(eyes_closed), "upper_third_occluded": occluded,
             "hairline_found": hair_frame_y is not None}
    return f, ctx, flags


def _entry(m: dict[str, Any]) -> dict[str, Any]:
    e: dict[str, Any] = {k: m[k] for k in ("id", "key", "name_zh", "group", "pillar", "view", "unit", "decimals",
                                          "tier", "definition_zh")}
    e.update(value=None, components=None, availability="not_measured", missing_reason=None, confidence=None,
             source_photo=None, notes=[], overlay=_overlay(m.get("overlay")))
    return e


def _front_metric(e: dict[str, Any], m: dict[str, Any], f: Frame, ctx: Ctx, conf_cfg: dict[str, Any],
                  color_level: str | None, cap: str | None) -> None:
    if ctx.cheek_w <= 1 or ctx.eye_w <= 1:
        e["missing_reason"] = "no_face"
        return
    try:
        value, comps = COMPUTE[m["compute"]](f, ctx)
    except Missing as err:
        e["missing_reason"] = err.reason
        return
    except (ZeroDivisionError, FloatingPointError, ValueError):
        e["missing_reason"] = "out_of_range"
        return
    lo, hi = m["valid_range"]
    if not (np.isfinite(value) and lo <= value <= hi):          # never clamped
        e["missing_reason"] = "out_of_range"
        return
    level = _min_level(pose_level(ctx.yaw, ctx.pitch, m["pose"], conf_cfg), m["max_confidence"], color_level if "color" in m.get("needs", []) else None, cap)
    e.update(value=_round(value), availability="measured", confidence=level,
             components={k: _round(v) for k, v in comps.items()} if comps else None)


def _side_metric(e: dict[str, Any], m: dict[str, Any], side: SideIn | None) -> None:
    from .profile import ProfileUnavailable, compute_side, side_points

    if side is None or side.trace is None:
        e["availability"] = "needs_photo"
        e["missing_reason"] = (side.reason if side and side.reason else "needs_side_photo")
        return
    e["source_photo"] = "profile90"
    try:
        value, comps, arm = compute_side(m["compute"], side.trace, side_points(side.trace))
    except ProfileUnavailable as err:
        e["missing_reason"] = err.reason
        return
    except (ZeroDivisionError, FloatingPointError, ValueError):
        e["missing_reason"] = "out_of_range"
        return
    need = float(m.get("min_arm_px", 12))
    if arm < need:
        e["missing_reason"] = "resolution_too_low"
        return
    lo, hi = m["valid_range"]
    if not (np.isfinite(value) and lo <= value <= hi):
        e["missing_reason"] = "out_of_range"
        return
    level = _min_level("low" if arm < 2.5 * need else "high", m["max_confidence"])
    e.update(value=_round(value), availability="measured", confidence=level,
             components={k: _round(v) for k, v in comps.items()} if comps else None)


def _smile_metric(e: dict[str, Any], m: dict[str, Any], neutral: Frame | None, smile: Frame | None,
                  reason: str | None, yaw: float | None, conf_cfg: dict[str, Any]) -> None:
    from .compute import SMILE_COMPUTE, SmileCtx

    if smile is None or neutral is None:
        e["availability"] = "needs_photo"
        e["missing_reason"] = reason or "needs_smile_photo"
        return
    e["source_photo"] = "smile"
    try:
        value, comps = SMILE_COMPUTE[m["compute"]](SmileCtx(neutral=neutral, smile=smile))
    except Missing as err:
        e["missing_reason"] = err.reason
        return
    except (ZeroDivisionError, FloatingPointError, ValueError):
        e["missing_reason"] = "out_of_range"
        return
    lo, hi = m["valid_range"]
    if not (np.isfinite(value) and lo <= value <= hi):
        e["missing_reason"] = "out_of_range"
        return
    e.update(value=_round(value), availability="measured",
             confidence=_min_level(pose_level(yaw, None, m["pose"], conf_cfg), m["max_confidence"]),
             components={k: _round(v) for k, v in comps.items()} if comps else None)


def catalog_summary(reg: dict[str, Any]) -> dict[str, int]:
    computed = {m["id"] for m in reg["metrics"] if m["id"].startswith("M")}
    computed |= {a for m in reg["metrics"] for a in m.get("aliases", [])}
    out = {"candidates": 176, "computed": len(computed), "covered": 0, "deferred": 0, "qualitative": 0,
           "excluded": 0, "meta": 0, "own_definitions": sum(not m["id"].startswith("M") for m in reg["metrics"])}
    for v in (reg.get("catalog_status") or {}).values():
        out[v["status"]] += 1
    return out


def measure_all(
    face: Any,
    *,
    shape: tuple[int, int],
    yaw: float | None,
    pitch: float | None,
    seg: np.ndarray | None = None,
    rgb: np.ndarray | None = None,
    color_measurements: dict[str, Any] | None = None,
    registry: dict[str, Any] | None = None,
    eyewear: str | None = None,
    noglasses: PhotoIn | None = None,
    side: SideIn | None = None,
    smile: PhotoIn | None = None,
    smile_reason: str | None = None,
    capture: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, list[float]], dict[str, dict[str, Any]]]:
    """(measurement_profile, front points, other views' geometry).

    `eyewear` is "user" (declared at upload), "detected" (QC hint) or None. Eye / brow metrics marked `eyewear` are
    measured on the glasses-free photo when one passed QC (source_photo "noglasses"); otherwise on the front photo
    with confidence capped at low and an "eyewear" note. Smile geometry only ever feeds the smile metrics.
    """
    reg = registry or load_registry()
    conf_cfg = reg["confidence"]
    front = PhotoIn(face=face, shape=shape, yaw=yaw, pitch=pitch, seg=seg, rgb=rgb)
    f, ctx, flags = _frame_ctx(front, reg, color_measurements, hairline=True, cheeks=True)
    ng = None
    if noglasses is not None:
        ng = _frame_ctx(noglasses, reg, None, hairline=False, cheeks=False)
    sm_frame = None
    if smile is not None:
        sm_frame = _frame_ctx(smile, reg, None, hairline=False, cheeks=False)[0]
    color_level = (color_measurements or {}).get("reliability")

    metrics: list[dict[str, Any]] = []
    for m in reg["metrics"]:
        e = _entry(m)
        if m["view"] == "side":
            _side_metric(e, m, side)
        elif m["view"] == "smile":
            _smile_metric(e, m, f, sm_frame, smile_reason, smile.yaw if smile else None, conf_cfg)
        elif m.get("eyewear") and eyewear and ng is not None:
            e["source_photo"] = "noglasses"
            _front_metric(e, m, ng[0], ng[1], conf_cfg, None, None)
        else:
            e["source_photo"] = "front"
            cap = "low" if m.get("eyewear") and eyewear else None
            _front_metric(e, m, f, ctx, conf_cfg, color_level, cap)
            if cap and e["availability"] == "measured":
                e["notes"] = ["eyewear"]
        metrics.append(e)

    def count(view: str) -> tuple[int, int]:
        ms = [x for x in metrics if x["view"] == view]
        return sum(x["availability"] == "measured" for x in ms), len(ms)

    (fm, ft), (sm_, st), (mm, mt) = count("front"), count("side"), count("smile")
    views = [{"role": "front", "label_zh": ROLE_ZH["front"], "status": "measured", "reason": None,
              "measured": fm, "total": ft}]
    if ng is not None:
        n_ng = sum(x["source_photo"] == "noglasses" and x["availability"] == "measured" for x in metrics)
        views.append({"role": "noglasses", "label_zh": ROLE_ZH["noglasses"], "status": "measured", "reason": None,
                      "measured": n_ng, "total": sum(x["source_photo"] == "noglasses" for x in metrics)})
    side_status = ("measured" if side and side.trace is not None and sm_ else
                   "not_provided" if side is None else "unavailable")
    views.append({"role": "profile90", "label_zh": ROLE_ZH["profile90"], "status": side_status,
                  "reason": None if side_status == "measured" else (side.reason if side else "needs_side_photo"),
                  "measured": sm_, "total": st})
    smile_status = "measured" if sm_frame is not None and mm else ("not_provided" if smile_reason is None
                                                                     and smile is None else "unavailable")
    views.append({"role": "smile", "label_zh": ROLE_ZH["smile"], "status": smile_status,
                  "reason": None if smile_status == "measured" else (smile_reason or "needs_smile_photo"),
                  "measured": mm, "total": mt})
    for v in views:
        cap_ = (capture or {}).get(v["role"])
        if cap_:
            v["capture"] = cap_
    roll = round(f.roll_deg, 1)
    profile = {
        "version": reg["version"],
        "method": reg["method"],
        "source_photo": "front",
        "frame": "roll_corrected",
        "pose": {"yaw": yaw, "pitch": pitch, "roll": roll},
        "flags": {**flags, "side_photo": bool(side and side.trace is not None), "eyewear": eyewear,
                  "noglasses_photo": ng is not None, "smile_photo": sm_frame is not None},
        "coverage": {"measured": fm, "front_total": ft, "side_total": st, "side_measured": sm_,
                     "smile_total": mt, "smile_measured": mm, "total_measured": fm + sm_ + mm,
                     "total_defined": len(metrics)},
        "views": views,
        "catalog": catalog_summary(reg),
        "groups": reg["groups"],
        "pillars": [{k: p[k] for k in ("key", "name_zh", "about_zh")} for p in reg["pillars"]],
        "missing_reasons_zh": {r: reg["missing_reasons_zh"][r] for r in sorted(
            {x["missing_reason"] for x in metrics if x["missing_reason"]} | {v["reason"] for v in views if v["reason"]})},
        "metrics": metrics,
    }
    extra: dict[str, dict[str, Any]] = {}
    if ng is not None and noglasses is not None:
        extra["noglasses"] = {"width": noglasses.shape[1], "height": noglasses.shape[0],
                              "points": export_points(ng[0], noglasses.shape)}
    if sm_frame is not None and smile is not None:
        extra["smile"] = {"width": smile.shape[1], "height": smile.shape[0],
                          "points": export_points(sm_frame, smile.shape)}
    if side is not None and side.trace is not None:
        from .profile import side_points, silhouette

        h, w = side.shape
        pts = {k: [round(float(v[0]) / w, 4), round(float(v[1]) / h, 4)] for k, v in side_points(side.trace).items()}
        extra["profile90"] = {"width": w, "height": h, "points": pts, "silhouette": silhouette(side.trace, side.shape),
                              "facing": side.trace.facing}
    return profile, export_points(f, shape), extra


def measure_profile(
    face: Any,
    *,
    shape: tuple[int, int],
    yaw: float | None,
    pitch: float | None,
    seg: np.ndarray | None = None,
    rgb: np.ndarray | None = None,
    color_measurements: dict[str, Any] | None = None,
    registry: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, list[float]]]:
    """Front-only convenience wrapper (V3A signature)."""
    profile, points, _extra = measure_all(face, shape=shape, yaw=yaw, pitch=pitch, seg=seg, rgb=rgb,
                                          color_measurements=color_measurements, registry=registry)
    return profile, points


def export_points(f: Frame, shape: tuple[int, int]) -> dict[str, list[float]]:
    """Every named landmark + helper point, normalized to the image (0..1). For geometry.json only."""
    h, w = shape
    out: dict[str, list[float]] = {}
    names = [n for n in LANDMARKS if f.has_iris or not n.startswith("iris")]
    for name in names:
        x, y = f.raw(LANDMARKS[name])
        out[name] = [round(float(x) / w, 4), round(float(y) / h, 4)]
    for name, xy in f.helpers.items():
        x, y = f.to_image(xy)
        out[name] = [round(float(x) / w, 4), round(float(y) / h, 4)]
    return out
