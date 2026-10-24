"""Measurement insights (V3A, D34). Rules layer: measurement_profile (CV) → derived.measurement_insights.

Each insight follows the face page's three steps — 看到的 (the measured value) → 意味着 (a neutral reading against an
illustrative common range) → 所以建议 (styling directions, each linked to the advice page and, when the model
proposed one in that category, to the top-ranked recommendation). Bands and copy live in config/rules.yaml
(`measurement_insights`). Pure and deterministic; never reads or writes `analysis` beyond recommendation categories.
No score, no "ideal": a band only says where a value sits relative to a common range.
"""
from __future__ import annotations

from typing import Any

LEVEL_RANK = {"high": 2, "medium": 1, "low": 0}


def _fmt(value: float, unit: str, decimals: int) -> str:
    if unit in ("fraction", "pct_face"):
        return f"{value * 100:.{decimals}f}%"
    if unit == "deg":
        return f"{value:.{decimals}f}°"
    return f"{value:.{decimals}f}"


def _band(value: float, band: list[float], spec: dict[str, Any]) -> str:
    lo, hi = band
    key = "low" if value < lo else "high" if value > hi else "typical"
    if key not in spec:                       # a side without copy reads as typical (e.g. symmetry has no "low")
        return "typical"
    return key


def _top_rec(category_ids: list[str], ranked: list[dict[str, Any]], recs: dict[str, dict[str, Any]],
             excluded: set[str]) -> str | None:
    for r in ranked:
        rid = r["rec_id"]
        if rid not in excluded and recs[rid]["category"] in category_ids:
            return rid
    return None


def _assessment(m: dict[str, Any], ins_spec: dict[str, Any] | None, band_spec: list[Any] | None,
                typical_zh: str) -> dict[str, Any] | None:
    """Assessment of one measured value: band, short label, reference range, bar position (0..1), basis."""
    if ins_spec is not None:
        lo, hi = ins_spec["band"]
        basis = ins_spec.get("basis", "illustrative")
        band = _band(m["value"], [lo, hi], ins_spec)
        label = (ins_spec.get(band) or {}).get("label_zh") or typical_zh
    elif band_spec is not None:
        lo, hi, basis, low_zh, high_zh = band_spec
        v = m["value"]
        band = "low" if v < lo and low_zh else "high" if v > hi and high_zh else "typical"
        label = {"low": low_zh, "high": high_zh}.get(band) or typical_zh
    else:
        return None
    w = (hi - lo) or 1.0
    pos = (m["value"] - (lo - w)) / (3 * w)
    return {"metric_id": m["id"], "band": band, "label_zh": label[:24], "range": [lo, hi],
            "position": round(min(1.0, max(0.0, pos)), 3), "basis": basis}


def measurement_insights(
    profile: dict[str, Any] | None,
    analysis: dict[str, Any],
    ranked: list[dict[str, Any]],
    excluded_ids: set[str],
    cfg: dict[str, Any],
) -> dict[str, Any] | None:
    if not profile:
        return None
    mi = cfg["measurement_insights"]
    areas = mi["areas"]
    recs = {r["id"]: r for r in analysis["recommendations"]}
    by_id = {m["id"]: m for m in profile["metrics"]}

    items: list[dict[str, Any]] = []
    for mid, spec in mi["metrics"].items():
        m = by_id.get(mid)
        if not m or m["availability"] != "measured" or m["value"] is None:
            continue
        band = _band(m["value"], spec["band"], spec)
        copy = spec.get(band)
        if copy is None:                       # typical without copy → nothing worth saying
            continue
        advice = []
        for a in copy.get("advice", []):
            area = areas[a["area"]]
            advice.append({"area": a["area"], "page": area["page"], "label_zh": area["label_zh"], "text_zh": a["text_zh"],
                           "rec_id": _top_rec(area["categories"], ranked, recs, excluded_ids)})
        items.append({
            "metric_id": mid,
            "pillar": m["pillar"],
            "band": band,
            "label_zh": copy["label_zh"],
            "seen_zh": spec["seen_zh"].format(value=_fmt(m["value"], m["unit"], m["decimals"])),
            "means_zh": copy["means_zh"],
            "advice": advice,
            "confidence": m["confidence"],
            "priority": spec["priority"],
            "highlight": False,
        })

    # First screen: the most distinctive *trait* readings — non-typical first, then confidence, then priority.
    candidates = [i for i in items if mi["metrics"][i["metric_id"]].get("highlight", True)]
    candidates.sort(key=lambda i: (i["band"] == "typical", -LEVEL_RANK[i["confidence"]], i["priority"]))
    chosen = {i["metric_id"] for i in candidates[: mi["highlights"]]}
    for i in items:
        i["highlight"] = i["metric_id"] in chosen
    items.sort(key=lambda i: (not i["highlight"], i["priority"]))

    bands = cfg.get("measurement_bands") or {}
    assessments = []
    for m in profile["metrics"]:
        if m["availability"] != "measured" or m["value"] is None:
            continue
        a = _assessment(m, mi["metrics"].get(m["id"]), bands.get(m["id"]), bands.get("typical_zh", "常见范围内"))
        if a:
            assessments.append(a)

    pillars = []
    for p in profile["pillars"]:
        ms = [m for m in profile["metrics"] if m["pillar"] == p["key"]]
        notable = [i for i in items if i["pillar"] == p["key"] and i["band"] != "typical"]
        summary = ("较有特点的是：" + "、".join(i["label_zh"] for i in notable[:3]) + "。") if notable else mi["pillar_typical_zh"][p["key"]]
        pillars.append({"key": p["key"], "measured": sum(m["availability"] == "measured" for m in ms), "total": len(ms),
                        "summary_zh": summary, "notable": [i["metric_id"] for i in notable]})
    return {"items": items, "pillars": pillars, "assessments": assessments}
