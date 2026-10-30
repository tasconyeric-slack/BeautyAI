"""Transparent, non-calibrated human-like scale for the existing geometric score.

The geometry percentile is estimated from TFR's published 15,429-score summary,
assuming aes-geo-1.0 is numerically comparable to TFR's distinct scoring engine.
The 1-10 semantic score is the *same percentile* of a surrogate Normal distribution
fitted by assumption to Hayden et al.'s 2007 group averages. Neither relation
is validated against human labels for BeautyAI. Do not mistake it for a prediction.
"""
from __future__ import annotations

import math
from functools import lru_cache
from pathlib import Path
from statistics import NormalDist
from typing import Any

import yaml

from .reference import ROOT, ReferenceDataError, interp, load_reference, score_anchors

CONFIG_PATH = ROOT / "config/academic_rank.yaml"
METHOD = "tfr_harmony_quantile_to_hayden_semantic_normal_v1"


@lru_cache(maxsize=2)
def _config(path: str) -> dict[str, Any]:
    try:
        cfg = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
        if not isinstance(cfg, dict) or cfg.get("version") != "academic-quantile-human-v1":
            raise ValueError
        for key in ("human_rating_mu", "human_rating_sigma"):
            if not isinstance(cfg[key], (int, float)) or not math.isfinite(cfg[key]):
                raise ValueError
        if cfg["human_rating_sigma"] <= 0 or not 1 <= cfg["human_rating_mu"] <= 10:
            raise ValueError
        if cfg["display_step_percent"] not in (1, 5, 10):
            raise ValueError
        if not cfg["human_reference_url"] or not cfg["normality_context_url"]:
            raise ValueError
        return cfg
    except (OSError, KeyError, TypeError, ValueError, yaml.YAMLError):
        raise ReferenceDataError("invalid_academic_rank_policy") from None


def academic_rank_estimate(
    overall_score: float | None,
    scoring_version: str | None,
    *,
    complete: bool = True,
    config_path: str | Path = CONFIG_PATH,
    data: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Return a Passport rank, or None for missing/limited/unknown score.

    For tails without published quantiles, return one-sided bounds. A lack of
    source-matched data is a declared approximation rather than hidden calibration.
    """
    cfg = _config(str(config_path))
    if not cfg["enabled"] or not complete or scoring_version != cfg["source_scoring_version"]:
        return None
    if overall_score is None or isinstance(overall_score, bool):
        return None
    try:
        score = float(overall_score)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(score) or not 0 <= score <= 100:
        return None

    ref = (data or load_reference())["overall_score"]
    if ref["id"] != cfg["geometry_distribution_id"]:
        raise ReferenceDataError("geometry_distribution_id_mismatch")
    anchors = score_anchors(ref)
    p = interp(score, anchors)
    semantic = max(1.0, min(10.0, cfg["human_rating_mu"] +
                            cfg["human_rating_sigma"] * NormalDist().inv_cdf(p)))
    human = round(semantic, 1)
    step = cfg["display_step_percent"]
    raw_top = 100.0 * (1.0 - p)
    top = max(0.1, min(99.9, round(raw_top))) if raw_top < step or raw_top > 100 - step else round(raw_top / step) * step
    top = int(top) if top == int(top) else top
    pct = round(100 - top, 1) if top != int(top) else 100 - top

    if score < anchors[0][0]:
        precision = "lower_tail_bound"
        label = f"颜值参考分不高于 {human}/10 · 参考样本约后 {pct}%"
    elif score >= anchors[-1][0]:
        precision = "upper_tail_bound"
        label = f"颜值参考分不低于 {human}/10 · 参考样本约前 {top}% 以内"
    else:
        precision = "interpolated"
        label = f"颜值参考分约 {human}/10 · 参考样本前 {top}%"

    return {
        "status": "ok",
        "scoring_version": scoring_version,
        "mapping_mode": "crosswalk",
        "reference_distribution_version": cfg["version"],
        "reference_id": ref["id"],
        "score": score,
        "reference_score": human,
        "percentile_estimate": pct,
        "top_percent_estimate": top,
        "precision": precision,
        "approximate": True,
        "label_zh": label,
        "higher_than_zh": f"几何评分模型估计高于约 {pct}% 的对照扫描" if precision == "interpolated" else None,
        "note_zh": (
            f"几何分位置来自 The Face Report 公布的 {ref['n_scored']:,} 份自愿扫描。"
            "假定 BeautyAI 几何分与其分数尺度接近，且保持与真人评价相同的排序；"
            f"1–10 分的参考刻度基于 Hayden et al. (2007) 对 {cfg['human_reference_n']:,} 张照片的"
            "人工评分高/中分组均值推算，并借用正态分布建模假设。"
            "这两项对应关系未经 BeautyAI 真人数据验证，不是人工实际给出的分数，"
            "也不是用户在一般人口中的真实百分位。"
        ),
        "cohort": {
            "kind": ref["cohort"]["kind"],
            "n": ref["n_scored"],
            "source_date": ref["source_date"],
            "source_url": ref["source_url"],
            "publisher": ref["publisher"],
            "population_representative": False,
        },
        "method": METHOD,
    }
