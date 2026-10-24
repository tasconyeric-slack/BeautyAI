"""Overall 0–100 score → approximate rank in a published reference cohort (Issue #41).

The reference CDF is piecewise-linear through the published anchors only (cumulative bin edges, median, top-X%
thresholds); no distribution shape (normal or otherwise) is assumed. Below the lowest anchor and from the highest
threshold up only a bound is known, so the result says so. A score is placed only when its `scoring_version` is
registered in config/percentiles.yaml (`direct` or a monotonic `crosswalk`); anything else is "unavailable".
"""
from __future__ import annotations

import math
from itertools import pairwise
from typing import Any

from .reference import interp, load_config, load_reference, score_anchors


def _fmt(x: float) -> str:
    return f"{x:g}"


def _unavailable(reason: str, scoring_version: str | None, data: dict[str, Any]) -> dict[str, Any]:
    return {"status": "unavailable", "reason": reason, "scoring_version": scoring_version,
            "reference_distribution_version": data["version"], "reference_id": data["overall_score"]["id"]}


def to_reference_scale(score: float, mapping: dict[str, Any]) -> tuple[float, str | None]:
    """(reference score, outside) — outside is "below" / "above" when a crosswalk score lies beyond its knots: the
    returned value is then the end knot, and only a bound is known (the caller must not treat it as a point)."""
    if mapping["mode"] == "direct":
        return score, None
    if mapping["mode"] == "crosswalk":
        knots = [(float(a), float(b)) for a, b in mapping["knots"]]
        if any(x1 <= x0 or y1 <= y0 for (x0, y0), (x1, y1) in pairwise(knots)):
            raise ValueError("crosswalk knots must be strictly increasing in both coordinates")
        outside = "below" if score < knots[0][0] else "above" if score > knots[-1][0] else None
        return interp(score, knots), outside
    raise ValueError(f"unknown mapping mode {mapping['mode']!r}")


def score_percentile(
    overall_score: float | None,
    scoring_version: str | None,
    *,
    complete: bool = True,
    data: dict[str, Any] | None = None,
    cfg: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Place one overall score in the reference cohort.

    `complete=False` (a partial / limited score from the scorer) never gets a rank. Returns a dict with `status`
    "ok" or "unavailable" (+ `reason`). When ok: `percentile_estimate` (% of reference scans scoring lower, rounded),
    `top_percent_estimate`, `precision` (interpolated | lower_tail_bound | upper_tail_bound), Chinese copy and the
    cohort / source block for the expandable note.
    """
    data = data or load_reference()
    cfg = cfg or load_config()
    ref = data["overall_score"]
    if overall_score is None:
        return _unavailable("no_score", scoring_version, data)
    if not complete:
        return _unavailable("partial_score", scoring_version, data)
    try:
        s = float(overall_score)
    except (TypeError, ValueError):
        return _unavailable("out_of_range", scoring_version, data)
    if math.isnan(s) or not 0.0 <= s <= 100.0:
        return _unavailable("out_of_range", scoring_version, data)
    mapping = (cfg.get("score_mappings") or {}).get(scoring_version or "")
    if mapping is None:
        return _unavailable("score_scale_unverified", scoring_version, data)

    r, outside = to_reference_scale(s, mapping)
    disp = cfg["score_display"]
    anchors = score_anchors(ref)
    lo_edge, hi_edge = float(disp["lower_tail_below"]), float(disp["upper_tail_from"])

    if outside == "below" or r < lo_edge:
        # below the lowest anchor (or below a crosswalk's first knot): only "under this edge" is known
        below = round(interp(max(lo_edge, r), anchors) * 100)
        precision, pct, top = "lower_tail_bound", below, 100 - below
        label = f"参考扫描人群中约后 {below}%"
        higher_than = None
    elif outside == "above" or r >= hi_edge:
        top_share = 1.0 - interp(min(hi_edge, r), anchors)
        precision, top = "upper_tail_bound", round(top_share * 100, 3)
        pct = round(100 - top, 3)
        label = f"参考扫描人群中前 {_fmt(top)}% 以内"
        higher_than = f"高于约 {_fmt(pct)}% 的参考扫描"
    else:
        p = interp(r, anchors)
        precision = "interpolated"
        top_raw = (1.0 - p) * 100
        if top_raw < 0.95:                                       # between the 1% and 0.1% thresholds
            top, pct = 1, 99
            label = "参考扫描人群中前 1% 以内"
        else:
            if min(p, 1 - p) >= disp["coarse_from"]:
                step = disp["coarse_step"]
                pct = round(p * 100 / step) * step
            elif p < 0.5:
                pct = round(p * 100)
            else:
                pct = 100 - round(top_raw)
            top = 100 - pct
            label = f"参考扫描人群中约前 {top}%" if top <= 50 else f"约高于 {pct}% 的参考扫描"
        higher_than = f"约高于 {pct}% 的参考扫描"

    cohort = ref["cohort"]
    return {
        "status": "ok",
        "scoring_version": scoring_version,
        "mapping_mode": mapping["mode"],
        "reference_distribution_version": data["version"],
        "reference_id": ref["id"],
        "score": s,
        "reference_score": round(r, 2),
        "percentile_estimate": pct,
        "top_percent_estimate": top,
        "precision": precision,
        "approximate": True,
        "label_zh": label,
        "higher_than_zh": higher_than,
        "note_zh": (f"对照人群：{ref['publisher'].split(' (')[0]} 公开的 {ref['n_scored']:,} 份扫描（{ref['source_date']}）。"
                    f"{cohort['description_zh']}。按公开的分档与阈值做分段线性插值，结果为近似值；"
                    "分数代表面部几何协调度的参考，不代表全人群排名。"),
        "cohort": {"kind": cohort["kind"], "n": ref["n_scored"], "source_date": ref["source_date"],
                   "source_url": ref["source_url"], "publisher": ref["publisher"],
                   "population_representative": cohort["population_representative"]},
        "method": "piecewise_linear_published_anchors",
    }


# ---- Scale checks used before registering a scoring_version ---------------------------------------------------------

def _quantile(sorted_xs: list[float], q: float) -> float:
    pos = q * (len(sorted_xs) - 1)
    i = math.floor(pos)
    j = min(i + 1, len(sorted_xs) - 1)
    return sorted_xs[i] + (sorted_xs[j] - sorted_xs[i]) * (pos - i)


def check_scale_compatibility(scores: list[float], *, data: dict[str, Any] | None = None,
                              cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    """Compare a sample of our scores with the published bins / median / top shares.

    verdict: "compatible" (may be registered as `direct`), "needs_crosswalk", or "inconclusive" (sample too small).
    The sample should be real, consented scans scored by the candidate scoring_version.
    """
    data = data or load_reference()
    tol = (cfg or load_config())["compatibility"]
    ref = data["overall_score"]
    xs = sorted(float(x) for x in scores if x is not None)
    n = len(xs)
    if n < tol["min_sample"]:
        return {"verdict": "inconclusive", "n": n, "reason": f"need ≥ {tol['min_sample']} scores"}
    bin_gaps = []
    for b in ref["bins"]:
        lo = -math.inf if b["lo"] is None else b["lo"]
        hi = math.inf if b["hi"] is None else b["hi"]
        ours = sum(lo <= x < hi for x in xs) / n
        bin_gaps.append({"lo": b["lo"], "hi": b["hi"], "ours": round(ours, 4), "published": b["share"],
                         "gap": round(abs(ours - b["share"]), 4)})
    top_gaps = [{"score": t["score"], "ours": round(sum(x >= t["score"] for x in xs) / n, 4),
                 "published": t["top_share"]} for t in ref["top_thresholds"]]
    for t in top_gaps:
        t["gap"] = round(abs(t["ours"] - t["published"]), 4)
    median_gap = abs(_quantile(xs, 0.5) - ref["summary"]["median"])
    ok = (max(g["gap"] for g in bin_gaps) <= tol["max_bin_share_gap"]
          and max(g["gap"] for g in top_gaps) <= tol["max_top_share_gap"]
          and median_gap <= tol["max_median_gap"])
    return {"verdict": "compatible" if ok else "needs_crosswalk", "n": n, "median": round(_quantile(xs, 0.5), 2),
            "median_gap": round(median_gap, 2), "bins": bin_gaps, "top_shares": top_gaps}


def fit_crosswalk(scores: list[float], *, data: dict[str, Any] | None = None,
                  cfg: dict[str, Any] | None = None) -> list[list[float]]:
    """Monotonic quantile-matching knots [[our_score, reference_score], ...]: our sample's quantile at each published
    anchor level maps to that anchor's reference score. Assumes our scanned cohort resembles the reference cohort —
    record that assumption next to the knots in config/percentiles.yaml."""
    data = data or load_reference()
    tol = (cfg or load_config())["compatibility"]
    xs = sorted(float(x) for x in scores if x is not None)
    if len(xs) < tol["min_sample"]:
        raise ValueError(f"need ≥ {tol['min_sample']} scores to fit a crosswalk, got {len(xs)}")
    knots: list[list[float]] = []
    for ref_score, below in score_anchors(data["overall_score"]):
        ours = round(_quantile(xs, below), 3)
        if knots and (ours <= knots[-1][0]):
            continue                                            # ties in our sample: keep the map strictly monotonic
        knots.append([ours, ref_score])
    if len(knots) < 2:
        raise ValueError("sample too concentrated to fit a monotonic crosswalk")
    return knots
