"""AI 面部美学参考分 (Issue #31, D36): formula, public-reference fixtures, quality gates, interface, pipeline."""
from __future__ import annotations

import copy
import json
from pathlib import Path

import numpy as np
import pytest
import yaml

from aesthetic_passport.face_metrics.points import make_frame
from aesthetic_passport.face_metrics.synthetic import synthetic_face, synthetic_seg
from aesthetic_passport.schema_io import validate_passport
from aesthetic_passport.scoring import COMPONENTS, load_scoring_config, score_face, score_summary, tier_for
from aesthetic_passport.scoring.engine import golden_ratio, thirds

ROOT = Path(__file__).resolve().parents[1]
CFG = load_scoring_config()


def _score(**kw):
    yaw, pitch = kw.pop("yaw", 0.0), kw.pop("pitch", 0.0)
    flags = kw.pop("flags", None)
    face, _shape = synthetic_face(**kw)
    return score_face(face.landmarks, yaw=yaw, pitch=pitch, flags=flags)


def _thirds_score(upper: float, middle: float, lower: float) -> float:
    """Thirds score for given shares, through the real component on a frame whose levels sit at those shares."""
    lm = np.zeros((478, 2))
    lm[:, 0] = np.linspace(0, 400, 478)                     # spread x so the eye line (roll) is well defined
    lm[[33, 133], 1] = 100.0
    lm[[362, 263], 1] = 100.0
    lm[[33, 133, 362, 263], 0] = [0, 100, 300, 400]
    top, total = 0.0, 1000.0
    lm[10] = [200, top]
    lm[[105, 334], 1] = top + upper * total
    lm[2] = [200, top + (upper + middle) * total]
    lm[152] = [200, top + total]
    return thirds(make_frame(lm), CFG["thirds"])["score"]


# --- the public formula ---------------------------------------------------------------------------------------------
def test_weights_are_the_public_35_25_25_15():
    assert CFG["weights"] == {"symmetry": 0.35, "thirds": 0.25, "fifths": 0.25, "golden_ratio": 0.15}
    r = _score(asymmetry=0.2)
    assert r["overall_score"] == pytest.approx(sum(CFG["weights"][k] * c["score"] for k, c in
                                                   zip(COMPONENTS, r["components"], strict=True)), abs=0.11)


def test_canonical_mesh_reproduces_the_published_18_41_41_template_thirds():
    r = _score()
    shares = next(c for c in r["components"] if c["key"] == "thirds")["measured"]["shares"]
    assert [round(s * 100) for s in shares] == [18, 41, 41]
    assert r["component_scores"]["symmetry"] == 100.0            # the canonical mesh is mirror-perfect


@pytest.mark.parametrize(("shares", "published"), [((0.16, 0.44, 0.40), 73), ((0.19, 0.44, 0.37), 70)])
def test_thirds_conversion_matches_the_published_examples(shares, published):
    """Median scan 16/44/40 → 73 and sample report 19/44/37 → 70 (thefacereport.com, rounded inputs)."""
    assert _thirds_score(*shares) == pytest.approx(published, abs=2.5)


@pytest.mark.parametrize(("ratio", "band"), [(1.38, (100, 100)), (1.38 * 1.04, (90, 100)), (1.38 * 0.93, (80, 89)),
                                             (1.38 * 0.88, (70, 79)), (1.38 * 0.80, (0, 69))])
def test_golden_ratio_bands_follow_ten_points_per_five_percent(ratio, band):
    lm = np.zeros((478, 2))
    lm[[33, 133, 362, 263]] = [[100, 0], [150, 0], [250, 0], [300, 0]]
    lm[234], lm[454] = [0, 0], [400, 0]
    lm[10], lm[152] = [200, -200], [200, -200 + 400 * ratio]
    s = golden_ratio(make_frame(lm), CFG["golden_ratio"])["score"]
    assert band[0] <= round(s) <= band[1]


def test_tiers_use_the_public_thresholds():
    assert [tier_for(x, CFG["tiers"])["min"] for x in (95, 87, 86.9, 83, 80, 78, 77.9, 60, 59.9, 0)] == \
        [87, 87, 83, 83, 78, 78, 60, 60, 0, 0]


# --- the score follows the measurement ------------------------------------------------------------------------------
def test_deterministic_and_roll_invariant():
    a, b = _score(asymmetry=0.15), _score(asymmetry=0.15)
    assert a == b
    rolled = _score(asymmetry=0.15, roll_deg=9)
    for k in COMPONENTS:
        assert rolled["component_scores"][k] == pytest.approx(a["component_scores"][k], abs=0.2)


def test_symmetry_falls_as_the_face_becomes_asymmetric():
    s = [_score(asymmetry=x)["component_scores"]["symmetry"] for x in (0.0, 0.2, 0.5)]
    assert s[0] > s[1] > s[2]


def test_face_length_moves_the_golden_ratio_term_and_its_direction():
    short, long_ = _score(), _score(stretch_upper=1.25, stretch_lower=1.25)
    assert long_["component_scores"]["golden_ratio"] > short["component_scores"]["golden_ratio"]
    assert short["improvement"]["component"] == "golden_ratio" and "偏宽短" in short["improvement"]["text_zh"]


def test_strengths_and_improvement_come_from_the_components():
    r = _score(asymmetry=0.1)
    order = sorted(COMPONENTS, key=lambda k: -r["component_scores"][k])
    assert [s["component"] for s in r["strengths"]] == order[:2]
    assert r["improvement"]["component"] == order[-1]


# --- honest limited / unavailable states ----------------------------------------------------------------------------
def test_good_photo_is_full_confidence():
    r = _score(yaw=1.0, pitch=2.0)
    assert r["status"] == "full" and r["confidence"] == "high" and r["quality_flags"] == []


def test_turned_head_withholds_the_overall_score():
    r = _score(yaw=20.0)
    assert r["status"] == "unavailable" and r["overall_score"] is None and r["tier"] is None
    assert r["component_scores"]["symmetry"] is None and r["component_scores"]["fifths"] is None
    assert r["component_scores"]["thirds"] is not None
    assert "pose_off_axis" in r["quality_flags"]


@pytest.mark.parametrize(("kw", "flag", "confidence"), [
    ({"yaw": 8.0}, "pose_yaw", "low"), ({"pitch": 14.0}, "pose_pitch", "low"), ({"yaw": None}, "pose_unknown", "low"),
    ({"close_mouth": False}, "mouth_open", "medium"), ({"flags": {"eyewear": "user"}}, "eyewear", "medium"),
    ({"flags": {"upper_third_occluded": True}}, "forehead_covered", "medium"),
])
def test_soft_conditions_keep_the_score_but_never_full_confidence(kw, flag, confidence):
    r = _score(**kw)
    assert r["overall_score"] is not None and r["status"] == "limited"
    assert flag in r["quality_flags"] and r["confidence"] == confidence and flag in r["copy_zh"]["flags"]


def test_missing_or_tiny_landmarks_are_unavailable():
    assert score_face(np.zeros((10, 2)), yaw=0, pitch=0)["quality_flags"] == ["no_landmarks"]
    face, _ = synthetic_face(scale=1.5)
    r = score_face(face.landmarks, yaw=0, pitch=0)
    assert r["status"] == "unavailable" and r["quality_flags"] == ["face_too_small"]


# --- contract -------------------------------------------------------------------------------------------------------
def test_stable_interface_for_percentiles():
    s = score_summary(_score())
    assert set(s) == {"overall_score", "component_scores", "scoring_version", "quality_flags", "status"}
    assert set(s["component_scores"]) == set(COMPONENTS) and 0 <= s["overall_score"] <= 100
    assert score_summary(None)["overall_score"] is None


def test_passport_with_every_state_validates():
    p = json.loads((ROOT / "examples" / "sample_passport.json").read_text(encoding="utf-8"))
    for r in (_score(), _score(yaw=8.0), _score(yaw=20.0), score_face(np.zeros((3, 2)), yaw=0, pitch=0), None):
        q = copy.deepcopy(p)
        q["aesthetic_score"] = r
        assert validate_passport(q) == []
    old = copy.deepcopy(p)
    old.pop("aesthetic_score")
    old["schema_version"] = "0.5"
    assert validate_passport(old) == []                      # older passports stay valid


def test_copy_avoids_safety_terms():
    rules = yaml.safe_load((ROOT / "config" / "rules.yaml").read_text(encoding="utf-8"))
    terms = [t for g in rules["safety_terms"].values() for t in g]
    text = json.dumps(CFG["copy_zh"], ensure_ascii=False) + json.dumps([t["label_zh"] for t in CFG["tiers"]],
                                                                       ensure_ascii=False)
    assert [t for t in terms if t.lower() in text.lower()] == []


# --- critical path: the real pipeline on the same landmarks as the measurement profile -------------------------------
def test_pipeline_scores_the_front_landmarks(monkeypatch, tmp_path):
    from PIL import Image

    from aesthetic_passport import qc
    from aesthetic_passport.cv import MODELS
    from aesthetic_passport.pipeline import run_pipeline
    from aesthetic_passport.qc import PhotoCheck

    face, shape = synthetic_face(stretch_upper=1.3, asymmetry=0.1)
    rgb = np.full((shape[0], shape[1], 3), 190, np.uint8)
    gy, cy = face.pts(9)[1], face.pts(152)[1]
    seg = synthetic_seg(face, shape, gy - 0.48 * (cy - gy))
    photo = tmp_path / "front.png"
    Image.fromarray(rgb).save(photo)
    check = PhotoCheck(role="front", status="ok", issues=[], face=face, rgb=rgb, face_count=1, yaw=1.0, pitch=2.0,
                       roll=0.0, face_luma_mean=150.0, clipped_frac=0.0, lab_ab_mean=(135.0, 140.0))
    monkeypatch.setattr(qc, "check_role", lambda _im, _role: check)
    monkeypatch.setattr(MODELS, "segment", lambda _rgb: seg)
    monkeypatch.setenv("QC_MODE", "real")
    monkeypatch.setenv("ANALYSIS_PROVIDER", "fake")
    ctx = json.loads((ROOT / "examples" / "sample_context.json").read_text(encoding="utf-8"))["user_context"]
    p = run_pipeline({"front": photo}, ctx, run_dir=tmp_path / "run")
    s = p["aesthetic_score"]
    assert s == score_face(face.landmarks, yaw=1.0, pitch=2.0, flags=p["measurement_profile"]["flags"])
    assert s["status"] == "full" and s["overall_score"] is not None and p["schema_version"] == "0.8"
    log = (tmp_path / "run" / "cv.json").read_text(encoding="utf-8")
    assert str(s["overall_score"]) not in log                 # no photo-derived numbers in the logs
    assert "aesthetic_score" not in json.loads(log)           # nor photo-derived status / flags (PR #46 review)
    from aesthetic_passport.percentiles import reference_percentiles

    assert p["reference_percentiles"] == reference_percentiles(s, face.landmarks, yaw=1.0, pitch=2.0)


def test_stub_qc_reports_unavailable_never_a_number(monkeypatch, tmp_path):
    from aesthetic_passport.pipeline import run_pipeline

    monkeypatch.setenv("QC_MODE", "stub")
    monkeypatch.setenv("ANALYSIS_PROVIDER", "fake")
    photo = tmp_path / "front.jpg"
    from PIL import Image

    Image.new("RGB", (64, 64)).save(photo)
    p = run_pipeline({"front": photo}, {"presentation": "feminine"}, run_dir=tmp_path / "run")
    assert p["aesthetic_score"]["status"] == "unavailable" and p["aesthetic_score"]["overall_score"] is None
