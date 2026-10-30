"""Display tiers must never invent a rank; thresholds describe reference percentiles only."""

from dataclasses import replace

import pytest

from aesthetic_passport.attractiveness_rank.contracts import RankResult
from aesthetic_passport.attractiveness_rank.reference import ReferenceDataError
from aesthetic_passport.attractiveness_rank.tiers import tier_for_rank


@pytest.mark.parametrize(
    "percentile,expected",
    [(10, "lower_15"), (15, "middle_range"), (50, "middle_range"),
     (65, "top_35"), (80, "top_35"), (85, "top_15"), (90, "top_15"),
     (95, "top_5"), (99, "top_5")],
)
def test_reference_percentile_tiers(percentile, expected):
    rank = RankResult(
        status="available", percentile=percentile,
        top_percent=100 - percentile, display_step_percent=5,
    )
    assert tier_for_rank(rank).id == expected


def test_unavailable_rank_never_gets_a_tier():
    rank = RankResult(status="unavailable", unavailable_reason="reference_missing")
    assert tier_for_rank(rank) is None
    # Even a malformed, contradictory numeric field must not override the status.
    assert tier_for_rank(replace(rank, percentile=95)) is None


def test_tiers_are_not_score_thresholds():
    # A model raw score of 87 has no meaning for the tier without a reference CDF.
    assert tier_for_rank(RankResult(status="unavailable", unavailable_reason="model_reference_mismatch")) is None


def test_invalid_rank_or_policy_rejected(tmp_path):
    with pytest.raises(ReferenceDataError):
        tier_for_rank(RankResult(status="available", percentile=float("nan")))
    path = tmp_path / "wrong.yaml"
    path.write_text('version: attractiveness-rank-tiers-1\ntiers:\n  - {id: x, label_zh: x, min_percentile: 95}\n')
    with pytest.raises(ReferenceDataError):
        tier_for_rank(RankResult(status="available", percentile=95), config_path=path)
