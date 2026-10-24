"""AI 面部美学参考分: 35/25/25/15 geometric harmony on the front photo's MediaPipe landmarks (Issue #31, D36).

    score_face(landmarks, yaw=…, pitch=…, flags=…) → aesthetic_score (passport field, schema v0.6)

Deterministic: the same landmarks + config version always give the same numbers. It reuses the landmarks the CV
layer already measured (no second detector) in the same head-roll-corrected frame as `measurement_profile`.
All thresholds and conversion constants come from config/scoring.yaml.

Components (each 0–100, higher = closer to the reference geometry):
    symmetry      12 mirrored pairs reflected across a midline fitted on 5 midline points, residual ÷ the pair's
                  mean distance from the midline, five feature groups weighted 35/25/15/15/10.
    thirds        visible thirds (mesh top → brow → nose base → chin) against 18/41/41.
    fifths        five horizontal segments in units of eye width, against equal fifths.
    golden_ratio  visible face length ÷ cheekbone width against the visible-window proxy 1.38.
Missing data is explicit: a component that cannot be measured is null with a reason; without all four there is no
overall score. Soft photo-condition flags keep the score but set status "limited" (never full confidence).
"""
from __future__ import annotations

import math
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import yaml

from ..face_metrics import load_registry
from ..face_metrics.points import Frame, make_frame

ROOT = Path(__file__).resolve().parents[3]
CONFIG_PATH = ROOT / "config" / "scoring.yaml"
COMPONENTS = ("symmetry", "thirds", "fifths", "golden_ratio")
POSE_FLAGS = {"pose_unknown", "pose_yaw", "pose_pitch", "head_roll"}


@lru_cache(maxsize=1)
def load_scoring_config(path: str | None = None) -> dict[str, Any]:
    return yaml.safe_load(Path(path or CONFIG_PATH).read_text(encoding="utf-8"))


def _clamp(v: float) -> float:
    return max(0.0, min(100.0, v))


def _r1(v: float) -> float:
    return round(float(v), 1)


def _pt(f: Frame, idx: list[int]) -> np.ndarray:
    """Frame point of one landmark index or the mean of several."""
    return f.i(tuple(idx))


# --- components ---------------------------------------------------------------------------------------------------
def symmetry(f: Frame, cfg: dict[str, Any]) -> dict[str, Any]:
    mids = np.array([f.i(i) for i in cfg["midline"]])
    k, c = np.polyfit(mids[:, 1], mids[:, 0], 1)            # x = c + k·y (frame)
    n = math.hypot(1.0, k)
    normal = np.array([1.0, -k]) / n

    def dist(p: np.ndarray) -> float:                        # signed distance from the line x − k·y − c = 0
        return float((p[0] - k * p[1] - c) / n)

    features: dict[str, float] = {}
    residuals: list[float] = []
    for name, feat in cfg["features"].items():
        rs = []
        for a, b in feat["pairs"]:
            pa, pb = f.i(a), f.i(b)
            refl = pa - 2 * dist(pa) * normal
            norm = (abs(dist(pa)) + abs(dist(pb))) / 2
            if norm <= 0:
                raise ValueError("pair on the midline")
            rs.append(float(np.linalg.norm(refl - pb)) / norm)
        residuals += rs
        features[name] = _clamp(100 - cfg["penalty"] * float(np.mean(rs)))
    total_w = sum(feat["weight"] for feat in cfg["features"].values())
    score = sum(features[n_] * cfg["features"][n_]["weight"] for n_ in features) / total_w
    return {"score": score, "measured": {"mean_residual": round(float(np.mean(residuals)), 4),
                                         "features": {k_: _r1(v) for k_, v in features.items()},
                                         "pairs": len(residuals)}}


def thirds(f: Frame, cfg: dict[str, Any]) -> dict[str, Any]:
    lv = cfg["levels"]
    ys = [float(_pt(f, lv[k])[1]) for k in ("top", "brow", "nose_base", "chin")]
    segs = np.diff(ys)
    if np.any(segs <= 0):
        raise ValueError("thirds out of order")
    shares = segs / segs.sum()
    ref = np.array(cfg["reference"], float)
    rel = shares / ref - 1
    dev = float(np.mean(np.abs(rel)))
    return {"score": _clamp(100 - cfg["penalty"] * dev),
            "measured": {"shares": [round(float(s), 4) for s in shares], "reference": list(cfg["reference"]),
                         "mean_rel_deviation": round(dev, 4)},
            "_rel": rel}


def fifths(f: Frame, cfg: dict[str, Any]) -> dict[str, Any]:
    xs = [float(f.i(i)[0]) for i in cfg["cuts"]]
    segs = np.diff(xs)
    if np.any(segs <= 0):
        raise ValueError("fifths out of order")
    eye_w = (segs[1] + segs[3]) / 2
    units = segs / eye_w
    dev = float(np.mean(np.abs(units - 1)))
    return {"score": _clamp(100 - cfg["penalty"] * dev),
            "measured": {"segments_eye_widths": [round(float(u), 3) for u in units], "mean_rel_deviation": round(dev, 4)},
            "_units": units}


def golden_ratio(f: Frame, cfg: dict[str, Any]) -> dict[str, Any]:
    a, b = cfg["length"]
    c, d = cfg["width"]
    length = float(np.linalg.norm(f.i(a) - f.i(b)))
    width = float(np.linalg.norm(f.i(c) - f.i(d)))
    if width <= 0:
        raise ValueError("no width")
    ratio = length / width
    dev = ratio / cfg["target"] - 1
    return {"score": _clamp(100 - cfg["penalty"] * abs(dev)),
            "measured": {"ratio": round(ratio, 3), "target": cfg["target"], "rel_deviation": round(dev, 4)}}


COMPUTE = {"symmetry": symmetry, "thirds": thirds, "fifths": fifths, "golden_ratio": golden_ratio}


# --- quality ------------------------------------------------------------------------------------------------------
def _quality(f: Frame, yaw: float | None, pitch: float | None, flags: dict[str, Any], q: dict[str, Any]
             ) -> tuple[list[str], dict[str, str]]:
    """(soft flags → limited, {component: reason} → not scored)."""
    soft: list[str] = []
    blocked: dict[str, str] = {}
    if yaw is None:
        soft.append("pose_unknown")
    else:
        if abs(yaw) > q["limited_max_yaw"]:
            blocked.update(symmetry="pose_off_axis", fifths="pose_off_axis")
        elif abs(yaw) > q["full_max_yaw"]:
            soft.append("pose_yaw")
        if pitch is not None and abs(pitch) > q["limited_max_pitch"]:
            blocked.update(thirds="pose_off_axis", golden_ratio="pose_off_axis")
        elif pitch is not None and abs(pitch) > q["full_max_pitch"]:
            soft.append("pose_pitch")
    if abs(f.roll_deg) > q["max_roll"]:
        soft.append("head_roll")
    # mouth / eyes are read from the same landmarks (face_metrics gates), so they hold even without a profile
    gates = load_registry()["gates"]
    mouth_w = f.d("mouth_l", "mouth_r")
    mouth_open = flags.get("mouth_open") or (mouth_w > 1 and f.d("lip_upper_inner", "lip_lower_inner") / mouth_w
                                              > gates["mouth_open_ratio"])
    eyes_closed = flags.get("eyes_closed") or any(
        f.d(f"eye_{s}_top", f"eye_{s}_bottom") / max(f.d(f"eye_{s}_outer", f"eye_{s}_inner"), 1e-6)
        < gates["eyes_closed_ratio"] for s in "lr")
    for on, flag in ((mouth_open, "mouth_open"), (eyes_closed, "eyes_closed"),
                     (flags.get("upper_third_occluded"), "forehead_covered")):
        if on:
            soft.append(flag)
    if flags.get("eyewear"):
        soft.append("eyewear")
    return soft, blocked


# --- highlights ---------------------------------------------------------------------------------------------------
def _strength_text(key: str, comp: dict[str, Any], copy: dict[str, Any]) -> str:
    m = comp["measured"]
    t = copy["strengths"][key]
    if key == "symmetry":
        feats = m["features"]
        return t.format(residual_pct=round(m["mean_residual"] * 100, 1),
                        best_feature=copy["features"][max(feats, key=feats.get)])
    if key == "thirds":
        u, mi, lo = (round(s * 100) for s in m["shares"])
        return t.format(upper=u, middle=mi, lower=lo)
    if key == "fifths":
        return t.format(dev_pct=round(m["mean_rel_deviation"] * 100))
    return t.format(ratio=f"{m['ratio']:.2f}", dev_pct=round(abs(m["rel_deviation"]) * 100))


def _improvement_text(key: str, comp: dict[str, Any], copy: dict[str, Any]) -> str:
    imp = copy["improvements"]
    if key == "symmetry":
        feats = comp["measured"]["features"]
        return imp["symmetry"].format(worst_feature=copy["features"][min(feats, key=feats.get)])
    if key == "thirds":
        rel = comp["_rel"]
        i = int(np.argmax(np.abs(rel)))
        return imp[f"thirds_{('upper', 'middle', 'lower')[i]}_{'long' if rel[i] > 0 else 'short'}"]
    if key == "fifths":
        u = comp["_units"]
        outer, inner = (u[0] + u[4]) / 2 - 1, u[2] - 1
        if abs(outer) >= abs(inner):
            return imp["fifths_outer_wide" if outer > 0 else "fifths_outer_narrow"]
        return imp["fifths_inner_wide" if inner > 0 else "fifths_inner_narrow"]
    return imp["golden_ratio_wide" if comp["measured"]["rel_deviation"] < 0 else "golden_ratio_long"]


def tier_for(score: float, tiers: list[dict[str, Any]]) -> dict[str, Any]:
    for t in tiers:
        if score >= t["min"]:
            return {"key": t["key"], "label_zh": t["label_zh"], "min": t["min"]}
    raise ValueError("tiers must end at 0")


# --- entry point --------------------------------------------------------------------------------------------------
def unavailable(reason: str, cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    """An explicit no-score result (no landmarks, face too small, QC stub)."""
    cfg = cfg or load_scoring_config()
    return _result(cfg, {k: None for k in COMPONENTS}, {k: reason for k in COMPONENTS}, [reason], None)


def score_face(landmarks: Any, *, yaw: float | None, pitch: float | None, flags: dict[str, Any] | None = None,
               config: dict[str, Any] | None = None) -> dict[str, Any]:
    """`landmarks`: (N ≥ 468, 2|3) image pixels of the front photo (cv.Face.landmarks). `flags`: the measurement
    profile's photo flags (mouth_open, eyes_closed, upper_third_occluded, eyewear)."""
    cfg = config or load_scoring_config()
    lm = np.asarray(landmarks, float)
    if lm.ndim != 2 or lm.shape[0] < 468:
        return unavailable("no_landmarks", cfg)
    f = make_frame(lm)
    q = cfg["quality"]
    if float(np.linalg.norm(f.i(234) - f.i(454))) < q["min_face_width_px"]:
        return unavailable("face_too_small", cfg)
    soft, blocked = _quality(f, yaw, pitch, flags or {}, q)
    comps: dict[str, dict[str, Any] | None] = {}
    reasons: dict[str, str] = {}
    for key in COMPONENTS:
        if key in blocked:
            comps[key], reasons[key] = None, blocked[key]
            continue
        try:
            comps[key] = COMPUTE[key](f, cfg[key])
        except (ValueError, ZeroDivisionError, FloatingPointError, np.linalg.LinAlgError):
            comps[key], reasons[key] = None, "landmarks_unclear"
    flags_out = soft + sorted(set(reasons.values()))
    return _result(cfg, comps, reasons, flags_out, f)


def _result(cfg: dict[str, Any], comps: dict[str, dict[str, Any] | None], reasons: dict[str, str],
            quality_flags: list[str], f: Frame | None) -> dict[str, Any]:
    copy = cfg["copy_zh"]
    w = cfg["weights"]
    complete = all(comps[k] is not None for k in COMPONENTS)
    overall = _r1(sum(w[k] * comps[k]["score"] for k in COMPONENTS)) if complete else None  # type: ignore[index]
    soft = [x for x in quality_flags if x not in set(reasons.values())]
    status = "unavailable" if overall is None else ("limited" if soft else "full")
    confidence = (None if overall is None else "high" if status == "full"
                  else "low" if any(x in POSE_FLAGS for x in soft) else "medium")

    components = []
    for k in COMPONENTS:
        c = comps[k]
        components.append({
            "key": k, "name_zh": copy["components"][k]["name"], "about_zh": copy["components"][k]["about"],
            "weight": w[k], "score": _r1(c["score"]) if c else None,
            "status": "measured" if c else "not_measured", "missing_reason": reasons.get(k),
            "measured": c["measured"] if c else None,
        })
    available = sorted((k for k in COMPONENTS if comps[k]), key=lambda k: -comps[k]["score"])  # type: ignore[index]
    strengths = [{"component": k, "text_zh": _strength_text(k, comps[k], copy)} for k in available[:2]]  # type: ignore[arg-type]
    improvement = None
    if available:
        k = available[-1]
        improvement = {"component": k, "text_zh": _improvement_text(k, comps[k], copy)}  # type: ignore[arg-type]

    return {
        "scoring_version": cfg["version"],
        "status": status,
        "overall_score": overall,
        "component_scores": {k: (_r1(comps[k]["score"]) if comps[k] else None) for k in COMPONENTS},  # type: ignore[index]
        "weights": {k: w[k] for k in COMPONENTS},
        "quality_flags": quality_flags,
        "confidence": confidence,
        "tier": tier_for(overall, cfg["tiers"]) if overall is not None else None,
        "components": components,
        "strengths": strengths,
        "improvement": improvement,
        "copy_zh": {"name": copy["name"], "scale_note": copy["scale_note"], "status": copy["status"][status],
                    "flags": {x: copy["flags"][x] for x in quality_flags if x in copy["flags"]}},
        "provenance": {"layer": "scoring", "source": "front_photo_landmarks", "landmark_model": cfg["landmark_model"],
                       "frame": "roll_corrected", "method": cfg["method"],
                       "roll_deg": round(f.roll_deg, 1) if f is not None else None,
                       "formula": "overall = Σ weight × component (0–100); components per config/scoring.yaml",
                       "reference_doc": "docs/scoring/COMPETITOR_FORMULA.md"},
    }


def score_summary(score: dict[str, Any] | None) -> dict[str, Any]:
    """The stable, minimal interface for downstream consumers (#41 percentiles):
    {overall_score: 0..100 | None, component_scores, scoring_version, quality_flags, status}."""
    if not score:
        return {"overall_score": None, "component_scores": {k: None for k in COMPONENTS}, "scoring_version": None,
                "quality_flags": ["no_landmarks"], "status": "unavailable"}
    return {k: score[k] for k in ("overall_score", "component_scores", "scoring_version", "quality_flags", "status")}
