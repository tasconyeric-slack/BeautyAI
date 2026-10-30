"""Reference-cohort percentiles (Issue #41): published anchors, gate, crosswalk, 12 ratio rails."""
from __future__ import annotations

import copy
import json

import numpy as np
import pytest

from aesthetic_passport.percentiles import (
    ReferenceDataError,
    check_scale_compatibility,
    fit_crosswalk,
    load_config,
    load_reference,
    ratio_percentile,
    ratio_rails,
    score_anchors,
    score_percentile,
)
from aesthetic_passport.percentiles.reference import interp, validate_reference

DATA = load_reference()


def _cfg(**mappings):
    cfg = copy.deepcopy(load_config())
    cfg["score_mappings"] = mappings
    return cfg


DIRECT = _cfg(test_v1={"mode": "direct"})


def _reference_like_sample(n: int = 1000, shift: float = 0.0) -> list[float]:
    """Deterministic scores whose distribution follows the published anchors (inverse of the piecewise CDF)."""
    inv = [(p, s) for s, p in score_anchors(DATA["overall_score"])]
    out = []
    for k in range(n):
        u = (k + 0.5) / n
        s = 45.0 if u < inv[0][0] else 91.5 if u > inv[-1][0] else interp(u, inv)
        out.append(s + shift)
    return out


# ---- overall score -------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("score,top", [(80, 30), (84, 10), (89, 1), (91, 0.1)])
def test_published_anchor_fixtures(score, top):
    r = score_percentile(score, "test_v1", cfg=DIRECT)
    assert r["status"] == "ok" and r["top_percent_estimate"] == top
    assert r["approximate"] is True and r["cohort"]["n"] == 15429
    assert r["cohort"]["population_representative"] is False


def test_score_80_is_not_80th_percentile_and_cdf_is_monotonic():
    assert score_percentile(80, "test_v1", cfg=DIRECT)["percentile_estimate"] == 70
    prev = -1.0
    for s in np.arange(0, 100.01, 0.5):
        p = score_percentile(float(s), "test_v1", cfg=DIRECT)["percentile_estimate"]
        assert p >= prev
        prev = p


def test_tails_are_bounds_not_extrapolations():
    low = score_percentile(20, "test_v1", cfg=DIRECT)
    assert low["precision"] == "lower_tail_bound" and low["percentile_estimate"] == 7 and "后 7%" in low["label_zh"]
    high = score_percentile(99, "test_v1", cfg=DIRECT)
    assert high["precision"] == "upper_tail_bound" and "0.1% 以内" in high["label_zh"]
    assert score_percentile(90, "test_v1", cfg=DIRECT)["label_zh"] == "参考扫描人群中前 1% 以内"


@pytest.mark.parametrize("score,version,kw,reason", [
    (80, "someone_elses_scale", {}, "score_scale_unverified"),
    (None, "test_v1", {}, "no_score"),
    (80, "test_v1", {"complete": False}, "partial_score"),
    (101, "test_v1", {}, "out_of_range"),
    (float("nan"), "test_v1", {}, "out_of_range"),
])
def test_gate_returns_unavailable(score, version, kw, reason):
    r = score_percentile(score, version, cfg=DIRECT, **kw)
    assert r["status"] == "unavailable" and r["reason"] == reason and "percentile_estimate" not in r


def test_shipped_config_registers_no_unverified_scale():
    # A version is added only together with its compatibility check (see config/percentiles.yaml).
    for v, m in (load_config().get("score_mappings") or {}).items():
        assert m["mode"] in {"direct", "crosswalk"} and m.get("checked"), v


def test_copy_never_claims_a_population_rank():
    for s in np.arange(0, 100.01, 1.0):
        r = score_percentile(float(s), "test_v1", cfg=DIRECT)
        text = r["label_zh"] + (r["higher_than_zh"] or "") + r["note_zh"]
        assert "参考扫描" in text and not any(w in text for w in ("全人类", "全球人口", "真实全球"))


def test_compatibility_check_and_crosswalk():
    same = check_scale_compatibility(_reference_like_sample())
    assert same["verdict"] == "compatible"
    shifted = _reference_like_sample(shift=-10)          # a scorer that runs 10 points low
    assert check_scale_compatibility(shifted)["verdict"] == "needs_crosswalk"
    knots = fit_crosswalk(shifted)
    cfg = _cfg(low_v1={"mode": "crosswalk", "knots": knots, "checked": "test"})
    assert score_percentile(70, "low_v1", cfg=cfg)["top_percent_estimate"] == 30      # our 70 ≈ reference 80
    assert check_scale_compatibility([75.0] * 10)["verdict"] == "inconclusive"


def test_reference_file_is_checked():
    bad = json.loads(json.dumps(DATA))
    bad["overall_score"]["top_thresholds"][1]["top_share"] = 0.5   # 84 → top 50% contradicts 80 → top 30%
    with pytest.raises(ReferenceDataError):
        validate_reference(bad)


# ---- ratio rails ---------------------------------------------------------------------------------------------------

def test_twelve_ratios_computed_only_verified_rails_shown():
    from aesthetic_passport.face_metrics.synthetic import synthetic_face
    from aesthetic_passport.percentiles import compute_reference_ratios

    face, _ = synthetic_face()
    vals = compute_reference_ratios(face.landmarks)
    assert all(v["value"] is not None for v in vals.values()) and len(vals) == 12
    out = ratio_rails(face.landmarks)
    assert [r["id"] for r in out["rails"]] == [m["id"] for m in DATA["ratio_norms"]["metrics"]]
    verified = set(load_config()["ratio_verified"])
    assert verified == {"midface_length", "lower_face_length"} and out["measured"] == len(verified)
    assert "CC BY 4.0" in out["attribution"]
    for r in out["rails"]:
        assert r["higher_is_better"] is None and r["definition_verified"] == (r["id"] in verified)
        if r["id"] in verified:
            assert r["status"] == "ok" and "不代表好坏" in r["text_zh"] and 5 <= r["percentile_estimate"] <= 95
        else:                                                   # computed, but never exposed until verified
            assert r["status"] == "unavailable" and r["reason"] == "definition_unverified" and r["value"] is None


def test_rails_unavailable_states():
    from aesthetic_passport.face_metrics.synthetic import synthetic_face
    from aesthetic_passport.percentiles import compute_reference_ratios

    face, _ = synthetic_face()
    assert compute_reference_ratios(face.landmarks[:468])["ipd_face_width"]["missing_reason"] == "no_iris"
    open_mouth, _ = synthetic_face(close_mouth=False)
    assert compute_reference_ratios(open_mouth.landmarks)["lip_fullness"]["missing_reason"] == "mouth_open"
    turned = ratio_rails(face.landmarks, yaw=25)
    assert turned["measured"] == 0 and all(r["reason"] == "pose_off_axis" for r in turned["rails"])
    assert all(r["reason"] == "no_face" for r in ratio_rails(None)["rails"])


def test_passport_block_follows_the_scorer_and_the_gate():
    from aesthetic_passport.face_metrics.synthetic import synthetic_face
    from aesthetic_passport.percentiles import reference_percentiles
    from aesthetic_passport.scoring import score_face, unavailable

    face, _ = synthetic_face()
    s = score_face(face.landmarks, yaw=0.0, pitch=0.0)
    assert s["status"] == "full" and s["scoring_version"] == "aes-geo-1.0"
    shipped = reference_percentiles(s, face.landmarks, yaw=0.0, pitch=0.0)
    assert shipped["rank"]["status"] == "ok" and shipped["rank"]["method"] == \
        "tfr_harmony_quantile_to_hayden_semantic_normal_v1"
    assert "percentile_estimate" in shipped["rank"] and shipped["ratios"]["measured"] == 2
    cfg = _cfg(**{"aes-geo-1.0": {"mode": "direct", "checked": "test"}})
    ranked = reference_percentiles(s, face.landmarks, cfg=cfg)["rank"]
    assert ranked["status"] == "ok" and ranked["score"] == s["overall_score"]
    limited = {**s, "status": "limited"}
    assert reference_percentiles(limited, cfg=cfg)["rank"]["reason"] == "partial_score"
    assert reference_percentiles(unavailable("no_landmarks"), cfg=cfg)["rank"]["reason"] == "no_score"
    assert reference_percentiles(None)["rank"]["reason"] == "no_score"


def test_publishers_own_sample_report_agrees_with_the_cdf():
    # Sample report: 79/100 (= .35·81 + .25·70 + .25·85 + .15·78) is "Top 30%"; our CDF gives one rounding step off.
    assert score_percentile(79, "test_v1", cfg=DIRECT)["top_percent_estimate"] in (30, 35)


def test_ratio_percentile_positions():
    assert ratio_percentile("eye_spacing", 1.24)["percentile_estimate"] == 50
    assert ratio_percentile("eye_spacing", 1.24)["band"] == "typical"
    low = ratio_percentile("canthal_tilt", -5.0)
    assert low["precision"] == "lower_tail_bound" and low["band"] == "very_low"
    high = ratio_percentile("lip_fullness", 0.60)
    assert high["precision"] == "upper_tail_bound" and high["percentile_estimate"] == 95
    assert ratio_percentile("fwhr", 2.30)["band"] == "high"
    with pytest.raises(KeyError):
        ratio_percentile("attractiveness", 1.0)


def test_crosswalk_ends_are_bounds():
    # scores beyond the knots are not clamped to an interpolated point (Codex review on #45)
    cfg = _cfg(cw={"mode": "crosswalk", "knots": [[40, 50], [60, 70], [70, 84]], "checked": "test"})
    low = score_percentile(30, "cw", cfg=cfg)
    assert low["precision"] == "lower_tail_bound" and low["label_zh"] == "参考扫描人群中约后 7%"
    assert score_percentile(40, "cw", cfg=cfg)["precision"] == "interpolated"
    high = score_percentile(75, "cw", cfg=cfg)      # beyond the last knot (ref 84 = top 10%): only "top 10% or better"
    assert high["precision"] == "upper_tail_bound" and high["label_zh"] == "参考扫描人群中前 10% 以内"
