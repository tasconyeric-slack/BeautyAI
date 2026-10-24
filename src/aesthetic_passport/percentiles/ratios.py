"""The 12 published frontal ratios, rebuilt on MediaPipe's 478-point mesh, and where a value sits in the 14,144-scan
reference quantiles (Issue #41).

A ratio percentile is a size position ("this proportion is on the high side among reference scans"), never a beauty
score: higher is not better. Landmark choices follow the published text definitions literally; the publisher does not
publish indices, so each choice is an inference recorded in `LANDMARK_NOTES` and docs/scoring/REFERENCE_DISTRIBUTIONS.md.
Widths are Euclidean distances; heights are vertical distances in the roll-free frame (eye-centre line horizontal),
the same frame face_metrics uses.
"""
from __future__ import annotations

import math
from typing import Any

from .reference import interp, load_config, load_reference

# MediaPipe indices ("_l" = image-left = the subject's right, as in face_metrics/points.py)
CHEEK = (234, 454)                 # widest face-oval points at cheekbone level (our cheekbone width everywhere)
EYE_OUTER, EYE_INNER = (33, 263), (133, 362)
UPPER_LID_MID = (159, 386)
IRIS = (468, 473)
BROW = (105, 334)                   # brow level, the same cut as #31's thirds (config/scoring.yaml)
MESH_TOP, CHIN, SUBNASALE, NASION, NOSE_TIP = 10, 152, 2, 168, 1
JAW = (172, 397)                    # jaw corners, as anchors.py / face_metrics
MOUTH = (61, 291)
ALAR = (129, 358)                   # alar width, as face_metrics M063
LIP_TOP, LIP_BOTTOM, LIP_IN_UP, LIP_IN_LO = 0, 17, 13, 14

LANDMARK_NOTES = {
    "canthal_tilt": "inner 133/362 → outer 33/263, angle vs the eye-centre line; +ve = outer corner higher; mean of both eyes",
    "eye_spacing": "|133–362| ÷ mean(|33–133|, |362–263|)",
    "fwhr": "|234–454| ÷ vertical(mean 159/386 → 0)",
    "face_length_width": "vertical(10 → 152) ÷ |234–454|",
    "ipd_face_width": "|468–473| ÷ |234–454| (needs iris points)",
    "midface_length": "vertical(mean 105/334 → 2) ÷ vertical(10 → 152)",
    "lower_face_length": "vertical(2 → 152) ÷ vertical(10 → 152)",
    "jaw_cheek_width": "|172–397| ÷ |234–454|",
    "mouth_face_width": "|61–291| ÷ |234–454|",
    "nose_mouth_width": "|129–358| ÷ |61–291|",
    "nose_length": "vertical(168 → 1) ÷ vertical(10 → 152)",
    "lip_fullness": "vertical(0 → 17) ÷ |61–291| (closed mouth only)",
}
BAND_ZH = {"very_low": "明显偏低", "low": "偏低", "typical": "居中", "high": "偏高", "very_high": "明显偏高"}
MISSING_ZH = {
    "no_face": "没有可用的正脸关键点。",
    "no_iris": "这张照片没有可用的虹膜定位，本项不测。",
    "mouth_open": "照片中嘴唇张开，唇厚比例不测。",
    "pose_off_axis": "头部转动较大，宽度比例会失真，本项不测。",
    "out_of_range": "计算结果异常（可能是关键点定位偏差），本项不显示。",
    "definition_unverified": "这项比例的关键点定义尚未核对到与对照数据一致，暂不显示对照位置。",
}


def compute_reference_ratios(landmarks: Any, *, yaw: float | None = None, pitch: float | None = None,
                             cfg: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
    """{ratio_id: {"value": float | None, "missing_reason": str | None}} for one front photo's landmarks (N×2+ px)."""
    import numpy as np

    from ..face_metrics.points import make_frame

    cfg = cfg or load_config()
    gates = cfg["ratio_gates"]
    ids = list(LANDMARK_NOTES)
    lm = None if landmarks is None else np.asarray(landmarks, float)
    if lm is None or lm.ndim != 2 or lm.shape[0] < 468:
        return {k: {"value": None, "missing_reason": "no_face"} for k in ids}
    if (yaw is not None and abs(yaw) > gates["max_abs_yaw"]) or (pitch is not None and abs(pitch) > gates["max_abs_pitch"]):
        return {k: {"value": None, "missing_reason": "pose_off_axis"} for k in ids}

    f = make_frame(lm)

    def P(*idx: int) -> np.ndarray:
        return np.mean([f.i(i) for i in idx], axis=0)

    def dist(a: int, b: int) -> float:
        return float(np.linalg.norm(P(a) - P(b)))

    def vert(a: np.ndarray, b: np.ndarray) -> float:
        return float(b[1] - a[1])

    cheek = dist(*CHEEK)
    face_h = vert(P(MESH_TOP), P(CHIN))
    mouth = dist(*MOUTH)

    def tilt(inner: int, outer: int) -> float:
        a, b = P(inner), P(outer)
        return math.degrees(math.atan2(a[1] - b[1], abs(a[0] - b[0])))   # outer higher (smaller y) → positive

    eye_w = (dist(EYE_OUTER[0], EYE_INNER[0]) + dist(EYE_INNER[1], EYE_OUTER[1])) / 2
    vals: dict[str, float | None] = {
        "canthal_tilt": (tilt(EYE_INNER[0], EYE_OUTER[0]) + tilt(EYE_INNER[1], EYE_OUTER[1])) / 2,
        "eye_spacing": dist(*EYE_INNER) / eye_w if eye_w > 0 else None,
        "fwhr": cheek / vert(P(*UPPER_LID_MID), P(LIP_TOP)),
        "face_length_width": face_h / cheek,
        "ipd_face_width": dist(*IRIS) / cheek if lm.shape[0] >= 478 else None,
        "midface_length": vert(P(*BROW), P(SUBNASALE)) / face_h,
        "lower_face_length": vert(P(SUBNASALE), P(CHIN)) / face_h,
        "jaw_cheek_width": dist(*JAW) / cheek,
        "mouth_face_width": mouth / cheek,
        "nose_mouth_width": dist(*ALAR) / mouth,
        "nose_length": vert(P(NASION), P(NOSE_TIP)) / face_h,
        "lip_fullness": vert(P(LIP_TOP), P(LIP_BOTTOM)) / mouth,
    }
    mouth_open = vert(P(LIP_IN_UP), P(LIP_IN_LO)) / mouth > gates["mouth_open_ratio"]
    out: dict[str, dict[str, Any]] = {}
    for k in ids:
        v = vals[k]
        if k == "ipd_face_width" and v is None:
            out[k] = {"value": None, "missing_reason": "no_iris"}
        elif k == "lip_fullness" and mouth_open:
            out[k] = {"value": None, "missing_reason": "mouth_open"}
        elif v is None or not math.isfinite(v) or (k != "canthal_tilt" and v <= 0):
            out[k] = {"value": None, "missing_reason": "out_of_range"}
        else:
            out[k] = {"value": v, "missing_reason": None}
    return out


def _band(pct: float, cuts: dict[str, float]) -> str:
    if pct < cuts["very_low"]:
        return "very_low"
    if pct < cuts["low"]:
        return "low"
    if pct > cuts["very_high"]:
        return "very_high"
    if pct > cuts["high"]:
        return "high"
    return "typical"


def ratio_percentile(metric_id: str, value: float | None, *, data: dict[str, Any] | None = None,
                     cfg: dict[str, Any] | None = None, missing_reason: str | None = None) -> dict[str, Any]:
    """Position of one ratio value in the published quantiles (linear between quantile knots; bounds beyond p5/p95)."""
    data = data or load_reference()
    cfg = cfg or load_config()
    norms = data["ratio_norms"]
    m = next((x for x in norms["metrics"] if x["id"] == metric_id), None)
    if m is None:
        raise KeyError(f"unknown reference ratio {metric_id!r}")
    base = {"id": metric_id, "name_zh": m["name_zh"], "unit": m["unit"], "reference_id": norms["id"],
            "reference_distribution_version": data["version"],
            "rail": dict(zip((f"p{lv}" for lv in norms["quantile_levels"]), m["quantiles"])),
            "higher_is_better": None}
    if value is None or not math.isfinite(float(value)):
        reason = missing_reason or "out_of_range"
        return {**base, "status": "unavailable", "reason": reason, "value": None,
                "text_zh": MISSING_ZH.get(reason, "本项不可用。")}

    v = float(value)
    levels, q = norms["quantile_levels"], m["quantiles"]
    lo_lv, hi_lv = levels[0], levels[-1]
    if v < q[0]:
        precision, shown, band = "lower_tail_bound", lo_lv, "very_low"
        text = f"这项比例低于对照扫描的第 {lo_lv} 百分位（{BAND_ZH[band]}）"
    elif v > q[-1]:
        precision, shown, band = "upper_tail_bound", hi_lv, "very_high"
        text = f"这项比例高于对照扫描的第 {hi_lv} 百分位（{BAND_ZH[band]}）"
    else:
        # equal quantile values (published 2-decimal rounding) → take the middle of the tied levels
        knots: list[tuple[float, float]] = []
        for qv, lv in zip(q, levels):
            if knots and qv == knots[-1][0]:
                knots[-1] = (qv, (knots[-1][1] + lv) / 2)
            else:
                knots.append((qv, float(lv)))
        pct = interp(v, knots)
        step = cfg["ratio_display_step"]
        shown = int(min(hi_lv, max(lo_lv, round(pct / step) * step)))
        precision, band = "interpolated", _band(shown, cfg["ratio_bands"])   # band agrees with the shown number
        text = f"这项比例在对照扫描中{BAND_ZH[band]}（约第 {shown} 百分位）"
    return {**base, "status": "ok", "value": round(v, m["decimals"] + 1), "percentile_estimate": shown,
            "precision": precision, "band": band, "band_zh": BAND_ZH[band], "approximate": True,
            "text_zh": text + "。百分位只表示数值大小的位置，不代表好坏。"}


def ratio_rails(landmarks: Any, *, yaw: float | None = None, pitch: float | None = None,
                data: dict[str, Any] | None = None, cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    """All 12 rails for one front photo, in published order, plus the source note (CC BY 4.0 attribution).

    Only ratios listed in `ratio_verified` (config/percentiles.yaml) get a position; the rest report
    `definition_unverified` (their value is not exposed) until their landmark definition is checked on real photos."""
    data = data or load_reference()
    cfg = cfg or load_config()
    verified = cfg.get("ratio_verified") or {}
    vals = compute_reference_ratios(landmarks, yaw=yaw, pitch=pitch, cfg=cfg)
    norms = data["ratio_norms"]
    rails = []
    for m in norms["metrics"]:
        v = vals[m["id"]]
        if m["id"] not in verified and v["value"] is not None:
            v = {"value": None, "missing_reason": "definition_unverified"}
        rail = ratio_percentile(m["id"], v["value"], data=data, cfg=cfg, missing_reason=v["missing_reason"])
        rail["definition_verified"] = m["id"] in verified
        rails.append(rail)
    return {
        "reference_id": norms["id"],
        "reference_distribution_version": data["version"],
        "rails": rails,
        "measured": sum(r["status"] == "ok" for r in rails),
        "verified": len(verified),
        "note_zh": (f"对照：{norms['n_scans']:,} 份正脸扫描的公开比例分布（{norms['source_date']}，CC BY 4.0）。"
                    f"{norms['cohort']['description_zh']}。关键点定义为本产品按公开文字说明复现，结果为近似位置。"),
        "attribution": norms["attribution"],
        "source_url": norms["source_url"],
    }
