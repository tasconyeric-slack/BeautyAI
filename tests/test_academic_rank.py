"""SCUT-FBP5500 published score bins + explicit V1 product bridge (no live calibration)."""
from __future__ import annotations

import json

import pytest

from aesthetic_passport.percentiles.academic import academic_rank_estimate


@pytest.mark.parametrize(
    "score,top",
    [(75, 50), (78, 35), (83, 15), (87, 5)],
)
def test_provisional_academic_positions(score, top):
    result = academic_rank_estimate(score, "aes-geo-1.0")
    assert result is not None and result["status"] == "ok"
    assert result["top_percent_estimate"] == top
    assert result["percentile_estimate"] == 100 - top
    assert result["cohort"]["n"] == 5500
    assert "产品假设" in result["note_zh"]
    assert result["cohort"]["population_representative"] is False
    json.dumps(result, ensure_ascii=False)


@pytest.mark.parametrize(
    "score,version,complete",
    [(None, "aes-geo-1.0", True), (75, "different-score", True),
     (75, "aes-geo-1.0", False), (float("nan"), "aes-geo-1.0", True),
     (-1, "aes-geo-1.0", True), (101, "aes-geo-1.0", True)],
)
def test_no_rank_without_usable_geometry_score(score, version, complete):
    assert academic_rank_estimate(score, version, complete=complete) is None


def test_monotonicity_and_distinct_comparison_from_learned_rank():
    ranks = [academic_rank_estimate(s, "aes-geo-1.0") for s in range(101)]
    shares = [result["percentile_estimate"] for result in ranks]
    assert shares == sorted(shares)
    assert all(1 <= r["top_percent_estimate"] <= 99 for r in ranks)
    assert all(r["method"] == "published_score_bins_uniform_with_fixed_geometry_bridge_v1" for r in ranks)
