"""Optional, percentile-based display tiers for #33's model-matched sample ranking.

Do not apply these tiers to raw attractiveness scores or geometric harmony scores.
This module does not produce or authorize a rank: the rank engine owns that gate.
"""

from __future__ import annotations

import itertools
import math
from dataclasses import dataclass
from pathlib import Path

import yaml

from .contracts import RankResult
from .reference import ROOT, ReferenceDataError


@dataclass(frozen=True)
class RelativeTier:
    id: str
    label_zh: str
    min_percentile: int


def tier_for_rank(
    rank: RankResult, *, config_path: str | Path | None = None
) -> RelativeTier | None:
    """Classify an available *displayed* reference percentile, not a raw score.

    The returned category is approximate at the rank's existing display precision.
    An unavailable rank never acquires a tier or a number via this helper.
    """
    if rank.status != "available" or rank.percentile is None:
        return None
    p = rank.percentile
    if isinstance(p, bool) or not isinstance(p, (int, float)) or not math.isfinite(p) or not 0 <= p <= 100:
        raise ReferenceDataError("invalid_rank_percentile")
    try:
        raw = yaml.safe_load(
            Path(config_path or ROOT / "config/attractiveness_rank_tiers.yaml").read_text(encoding="utf-8")
        )
        if not isinstance(raw, dict) or raw.get("version") != "attractiveness-rank-tiers-1":
            raise ValueError
        tiers = raw["tiers"]
        if not isinstance(tiers, list) or not tiers:
            raise ValueError
        cuts: list[int] = []
        result: RelativeTier | None = None
        for entry in tiers:
            cut = entry["min_percentile"]
            if type(cut) is not int or not 0 <= cut <= 100:
                raise ValueError
            if not isinstance(entry["id"], str) or not entry["id"]:
                raise ValueError
            if not isinstance(entry["label_zh"], str) or not entry["label_zh"]:
                raise ValueError
            cuts.append(cut)
            if result is None and p >= cut:
                result = RelativeTier(entry["id"], entry["label_zh"], cut)
        if cuts[-1] != 0 or any(a <= b for a, b in itertools.pairwise(cuts)):
            raise ValueError
        if len({entry["id"] for entry in tiers}) != len(tiers):
            raise ValueError
        return result
    except (OSError, TypeError, KeyError, ValueError, yaml.YAMLError):
        raise ReferenceDataError("invalid_rank_tier_policy") from None
