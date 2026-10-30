"""Research-bin estimated position for the existing geometric-harmony score.

2023 published SCUT-FBP5500 *human-rating* bin frequencies are real.
The bridge between a 0-100 geometry index and those ratings is a declared
BeautyAI product assumption, NOT a learned or empirically calibrated mapping.
Do not route outputs through the #33 model-matched ECDF rank library.
"""
from __future__ import annotations

import math
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from .reference import ROOT, ReferenceDataError

CONFIG_PATH = ROOT / "config/academic_rank.yaml"


@lru_cache(maxsize=2)
def _config(path: str) -> dict[str, Any]:
    try:
        data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
        if not isinstance(data, dict) or data.get("version") != "academic-geometry-rank-v1":
            raise ValueError
        bins = data["native_rating_bins"]
        if len(bins) != 4 or any(
            len(row) != 3 or row[0] != i + 1 or row[1] != i + 2
            or type(row[2]) is not int or row[2] <= 0
            for i, row in enumerate(bins)
        ):
            raise ValueError
        if sum(row[2] for row in bins) != data["reference_n"] or data["reference_n"] != 5500:
            raise ValueError
        for field in ("geometry_score_center", "academic_rating_center", "rating_per_geometry_point"):
            if not isinstance(data[field], (float, int)) or not math.isfinite(data[field]):
                raise ValueError
        if data["rating_per_geometry_point"] <= 0 or not 1 <= data["academic_rating_center"] <= 5:
            raise ValueError
        if data["display_step_percent"] not in (1, 5, 10):
            raise ValueError
        return data
    except (OSError, KeyError, TypeError, ValueError, yaml.YAMLError):
        raise ReferenceDataError("invalid_academic_rank_policy") from None


def academic_rank_estimate(
    overall_score: float | None,
    scoring_version: str | None,
    *,
    complete: bool = True,
    config_path: str | Path = CONFIG_PATH,
) -> dict[str, Any] | None:
    """Return a score_percentile-compatible result, or None if not applicable.

    Never override missing/limited scores or unknown scoring versions. No photos,
    model checkpoints, user records or dataset images are accessed.
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

    # The cross-scale bridge is an explicit *product convention*, not an academic estimate of model fidelity.
    converted = max(1.0, min(5.0, cfg["academic_rating_center"] +
                                cfg["rating_per_geometry_point"] * (score - cfg["geometry_score_center"])))
    below_count = 0.0
    for lo, hi, count in cfg["native_rating_bins"]:
        if converted >= hi:
            below_count += count
        elif converted > lo:
            below_count += count * (converted - lo) / (hi - lo)
            break
        else:
            break
    raw_top = 100.0 * (1.0 - below_count / cfg["reference_n"])
    step = cfg["display_step_percent"]
    if raw_top < step or raw_top > 100 - step:
        top = max(1, min(99, round(raw_top)))
    else:
        top = round(raw_top / step) * step
    percentile = 100 - top
    source = cfg["source_title"]
    return {
        "status": "ok",
        "scoring_version": scoring_version,
        "mapping_mode": "crosswalk",
        "reference_distribution_version": cfg["version"],
        "reference_id": "scut-fbp5500-2023-published-bins",
        "score": score,
        "reference_score": round(converted, 3),
        "percentile_estimate": percentile,
        "top_percent_estimate": top,
        "precision": "interpolated",
        "approximate": True,
        "label_zh": f"按学术分布模型估计约前 {top}%",
        "higher_than_zh": f"模型估计高于约 {percentile}% 的参考图片",
        "note_zh": (
            f"学术参考：{source}公布的 {cfg['reference_n']:,} 张照片人工平均评分区间频数。"
            "本版本用固定产品假设将 BeautyAI 面部几何分映射到论文 1–5 分尺度，"
            "并假设每个评分区间内部均匀分布；没有用新样本拟合。"
            "这只是参考模型的估计位置，不是用户在人口中的真实排名，"
            "也不是人工颜值评价模型的直接预测。"
        ),
        "cohort": {
            "kind": "academic_published_images",
            "n": cfg["reference_n"],
            "source_date": cfg["source_date"],
            "source_url": cfg["source_url"],
            "publisher": source,
            "population_representative": False,
        },
        "method": "published_score_bins_uniform_with_fixed_geometry_bridge_v1",
    }
