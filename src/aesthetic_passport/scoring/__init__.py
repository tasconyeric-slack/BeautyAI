"""AI 面部美学参考分 (Issue #31, D36): deterministic geometric harmony score on the front photo's landmarks.

Stable interface for downstream consumers (#41 percentiles): `score_summary(passport["aesthetic_score"])` →
    {overall_score: 0..100 | None, component_scores: {symmetry, thirds, fifths, golden_ratio}, scoring_version,
     quality_flags, status: "full" | "limited" | "unavailable"}
"""
from .engine import COMPONENTS, load_scoring_config, score_face, score_summary, tier_for, unavailable

__all__ = ["COMPONENTS", "load_scoring_config", "score_face", "score_summary", "tier_for", "unavailable"]
