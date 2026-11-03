"""Synthetic numeric fixtures only; no portrait inference."""
from functools import lru_cache
from statistics import NormalDist

import pytest
from test_attractiveness_rank import manifest, prediction

from aesthetic_passport.attractiveness_rank import rank_prediction
from aesthetic_passport.attractiveness_rank.ingest import build_image_reference


@lru_cache
def reference():
    m = manifest()
    m.update(cohort_id="scut-heldout-ridge17-research",
             distribution_version="scut-heldout-ridge17-ecdf-v1", reference_unit="image")
    m["identity"]["model_id"] = "geometry-ridge17-scut-60-40-v1"
    m["native_score_bounds"] = [1, 5]
    m["provenance"].update(data_kind="research_only", research_authorized=True)
    return build_image_reference(m, [3 + .3 * NormalDist().inv_cdf((i + .5) / 2128) for i in range(2128)])


def ranked(score):
    ref = reference()
    p = prediction(score, model_id=ref["cohorts"][0]["identity"]["model_id"])
    return rank_prediction(p, ref, cohort_id="scut-heldout-ridge17-research",
                           distribution_version="scut-heldout-ridge17-ecdf-v1",
                           image_reference_authorized=True)


def test_ridge_extreme_tail_is_numeric_and_distinct():
    results = [ranked(s) for s in [3, 3.5, 3.7, 3.93, 4.12, 4.4, 5]]
    assert all(r.status == "available" for r in results)
    tops = [r.top_percent for r in results]
    assert tops == sorted(tops, reverse=True)
    assert len(set(tops)) == len(tops)
    assert 0 < tops[-1] < .01
    assert results[-1].method == "ridge_ecdf_normal_tail_v1"
    assert "model_estimated_tail" in results[-1].limitations
    assert results[0].top_percent == pytest.approx(50)


def test_transition_is_continuous_and_monotone():
    # Normal fixture 95th percentile, near the configured empirical join.
    join = 3 + .3 * NormalDist().inv_cdf(.95)
    values = [ranked(join + d).top_percent for d in [-1e-6, 0, 1e-6]]
    assert values == sorted(values, reverse=True)
    assert max(values) - min(values) < .001


def test_dense_grid_and_empirical_knots():
    from aesthetic_passport.attractiveness_rank.continuous import continuous_rank

    points = reference()["cohorts"][0]["distribution"]
    tops = [continuous_rank(points, 1 + i / 250, .9, .99, .95)[0] for i in range(1001)]
    assert tops == sorted(tops, reverse=True)
    assert all(0 < top <= 100 for top in tops)
    for i in [200, 500, 1000, 1500, 1900]:
        top, estimated = continuous_rank(points, points[i]["score"], .9, .99, .95)
        assert top == pytest.approx(100 * (1 - (i + .5) / len(points)))
        assert not estimated


def test_free_teaser_preserves_tail_and_failure_metadata():
    from dataclasses import asdict

    from aesthetic_passport.api.entitlement import cv_teaser

    stored = {"learned_attractiveness": {"status": "ok", "production_authorized": True, "display_score": 9},
              "learned_reference_rank": asdict(ranked(4.5))}
    rank = cv_teaser(stored)["rank"]
    assert rank["top_percent"] == ranked(4.5).top_percent
    assert rank["estimated"] is True
    stored["learned_reference_rank"] = {"status": "unavailable", "unavailable_reason": "model_reference_mismatch"}
    rank = cv_teaser(stored)["rank"]
    assert rank["top_percent"] is None and not rank["estimated"]
    assert rank["unavailable_reason"] == "model_reference_mismatch"
