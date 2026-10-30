"""Check source-derived quantiles and explicitly assumed 1-10 semantic scale."""
from __future__ import annotations

import json

import pytest

from aesthetic_passport.percentiles.academic import METHOD, academic_rank_estimate


@pytest.mark.parametrize(
    "score,top,human",
    [(70, 70, 4.5), (75, 50, 5.0), (78, 40, 5.3), (80, 30, 5.5),
     (83, 15, 6.1), (87, 5, 6.7), (89, 1, 7.4)],
)
def test_quantile_preserving_semantic_positions(score, top, human):
    result = academic_rank_estimate(score, "aes-geo-1.0")
    assert result is not None and result["status"] == "ok"
    assert result["top_percent_estimate"] == top
    assert result["percentile_estimate"] == 100 - top
    assert result["reference_score"] == human
    assert result["cohort"]["n"] == 15429
    assert "假定" in result["note_zh"]
    assert result["cohort"]["population_representative"] is False
    assert result["method"] == METHOD
    json.dumps(result, ensure_ascii=False)


@pytest.mark.parametrize(
    "score,version,complete",
    [(None, "aes-geo-1.0", True), (75, "different-score", True),
     (75, "aes-geo-1.0", False), (float("nan"), "aes-geo-1.0", True),
     (-1, "aes-geo-1.0", True), (101, "aes-geo-1.0", True)],
)
def test_no_rank_without_usable_geometry_score(score, version, complete):
    assert academic_rank_estimate(score, version, complete=complete) is None


def test_monotonicity_and_no_false_tail_precision():
    ranks = [academic_rank_estimate(s, "aes-geo-1.0") for s in range(101)]
    shares = [result["percentile_estimate"] for result in ranks]
    humans = [result["reference_score"] for result in ranks]
    assert shares == sorted(shares)
    assert humans == sorted(humans)
    assert all(0.1 <= r["top_percent_estimate"] <= 99.9 for r in ranks)
    assert ranks[0]["precision"] == "lower_tail_bound"
    assert ranks[100]["precision"] == "upper_tail_bound"
    assert "不高于" in ranks[0]["label_zh"]
    assert "不低于" in ranks[100]["label_zh"]
