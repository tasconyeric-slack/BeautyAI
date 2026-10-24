"""V3A measurement profile (D34): registry integrity, deterministic formulas, explicit missingness, insights, paywall.

Runs on the synthetic canonical-mesh face (no photos, no MediaPipe model files).
"""
import copy
import json
import math
from pathlib import Path

import numpy as np
import pytest

from aesthetic_passport.anchors import measure
from aesthetic_passport.face_metrics import load_registry, measure_profile
from aesthetic_passport.face_metrics.compute import COMPUTE, SMILE_COMPUTE
from aesthetic_passport.face_metrics.points import MIRROR_PAIRS, all_point_names
from aesthetic_passport.face_metrics.profile import SIDE_COMPUTE, SIDE_POINTS
from aesthetic_passport.face_metrics.synthetic import canonical_vertices, synthetic_face, synthetic_seg

ROOT = Path(__file__).resolve().parents[1]
REG = load_registry()


def _profile(face=None, shape=None, *, yaw=2.0, pitch=1.0, hairline="auto", **kw):
    if face is None:
        face, shape = synthetic_face(stretch_upper=1.3, asymmetry=0.08)
    if hairline == "auto":
        gy, cy = face.pts(9)[1], face.pts(152)[1]
        hairline = gy - 0.48 * (cy - gy)
    seg = synthetic_seg(face, shape, hairline) if hairline is not None else None
    prof, pts = measure_profile(face, shape=shape, yaw=yaw, pitch=pitch, seg=seg, **kw)
    return prof, pts, {m["id"]: m for m in prof["metrics"]}


# --- registry ---------------------------------------------------------------------------------------------------
def test_registry_is_consistent_and_scoped():
    ms = REG["metrics"]
    ids = [m["id"] for m in ms]
    assert len(ids) == len(set(ids)) and len({m["key"] for m in ms}) == len(ms)
    groups = {g["key"] for g in REG["groups"]}
    pillars = {p["key"] for p in REG["pillars"]}
    names = all_point_names()
    for m in ms:
        assert m["group"] in groups and m["pillar"] in pillars and m["unit"] in REG["units"], m["id"]
        assert m["tier"] in ("free", "full") and m["view"] in ("front", "side", "smile")
        if m["view"] == "front":
            assert m["compute"] in COMPUTE, m["id"]
        elif m["view"] == "side":
            assert m["compute"] in SIDE_COMPUTE, m["id"]
        else:
            assert m["compute"] in SMILE_COMPUTE, m["id"]
        lo, hi = m["valid_range"]
        assert lo < hi
        ov = m.get("overlay") or {}
        used = {n for seg in ov.get("segments", []) for n in seg[:2]} | {n for a in ov.get("angles", []) for n in a}
        used |= set(ov.get("points", []))
        allowed = set(SIDE_POINTS) if m["view"] == "side" else names
        assert used <= allowed, (m["id"], used - allowed)
        assert all(seg[2] in ("measure", "reference") for seg in ov.get("segments", []))
    front = [m for m in ms if m["view"] == "front"]
    assert len(ms) >= 100 and 80 <= len(front) <= 110           # V3B: 100+ definitions, not all 176 candidates
    assert 15 <= sum(m["tier"] == "free" for m in front) <= 40
    side = [m for m in ms if m["view"] == "side"]
    assert 8 <= len(side) <= 16                                 # side metrics come only from the profile tracer
    research = {r["id"] for r in REG["research_candidates"]}
    assert research and not research & set(ids)                 # undefined public labels are never computed


def test_registry_copy_avoids_safety_terms():
    import yaml

    terms = [t for g in yaml.safe_load((ROOT / "config" / "rules.yaml").read_text(encoding="utf-8"))["safety_terms"].values()
             for t in g]
    text = (ROOT / "config" / "face_metrics.yaml").read_text(encoding="utf-8")
    rules_text = json.dumps(yaml.safe_load((ROOT / "config" / "rules.yaml").read_text(encoding="utf-8"))
                            ["measurement_insights"], ensure_ascii=False)
    for t in terms:
        assert t not in text.split("research_candidates")[0] and t not in rules_text, t


def test_mirror_pairs_match_the_canonical_mesh():
    v = canonical_vertices()
    derived = []
    for i, p in enumerate(v):
        if abs(p[0]) < 1e-3 or p[0] > 0:
            continue
        d = np.linalg.norm(v - p * [-1, 1, 1], axis=1)
        derived.append((i, int(d.argmin())))
        assert d.min() < 1e-6
    assert derived == MIRROR_PAIRS and len(MIRROR_PAIRS) == 220


# --- formulas ---------------------------------------------------------------------------------------------------
def test_synthetic_face_measures_the_front_core_deterministically():
    p1, pts1, _m = _profile()
    p2, pts2, _ = _profile()
    assert p1 == p2 and pts1 == pts2                             # same input → same bytes
    measured = [x for x in p1["metrics"] if x["availability"] == "measured"]
    geometric = [x for x in measured if x["group"] != "skin"]
    assert len(geometric) >= 25
    # every measured metric's overlay points exist in the exported geometry points
    for x in measured:
        ov = x["overlay"]
        used = {s["from"] for s in ov["segments"]} | {s["to"] for s in ov["segments"]} | set(ov["points"])
        used |= {n for a in ov["angles"] for n in (a["a"], a["vertex"], a["b"])}
        assert used <= set(pts1), (x["id"], used - set(pts1))


def test_metrics_agree_with_anchors_on_the_same_landmarks():
    face, shape = synthetic_face(stretch_upper=1.3)
    a, _ = measure(face, 2.0)
    _p, _pts, m = _profile(face, shape)
    assert m["M001"]["value"] == pytest.approx(a["face_length_width_ratio"], abs=1e-3)
    assert m["M006"]["value"] == pytest.approx(a["width_profile"]["jaw"], abs=1e-3)
    assert m["M005"]["value"] == pytest.approx(a["width_profile"]["forehead"], abs=1e-3)
    assert m["M033"]["value"] == pytest.approx(a["intercanthal_to_eye_width"], abs=1e-3)
    t = m["M017"]["value"] + m["M018"]["value"] + m["M019"]["value"]
    assert t == pytest.approx(1.0, abs=1e-3)


def test_head_roll_is_removed_from_angles_and_ratios():
    base = _profile()[2]
    face, shape = synthetic_face(stretch_upper=1.3, asymmetry=0.08, roll_deg=8)
    rolled = _profile(face, shape, hairline=None)[2]
    assert rolled["M013"]["value"] == pytest.approx(8.0, abs=0.05)
    for mid in ("M044", "M054", "M001", "M025", "M033", "M062", "M098", "M114"):
        assert rolled[mid]["value"] == pytest.approx(base[mid]["value"], abs=0.02), mid
    assert base["M013"]["value"] == pytest.approx(0.0, abs=0.05)


def test_canthal_tilt_sign_and_symmetry_respond_to_the_face():
    _p, _pts, m = _profile()
    assert m["M044"]["components"]["image_left"] == pytest.approx(m["M044"]["components"]["image_right"], abs=1.5)
    sym = _profile(*synthetic_face(stretch_upper=1.3))[2]["M114"]["value"]
    asym = _profile(*synthetic_face(stretch_upper=1.3, asymmetry=0.3))[2]["M114"]["value"]
    assert sym == pytest.approx(0, abs=1e-6) and asym > sym + 0.002


# --- missingness -------------------------------------------------------------------------------------------------
def test_upper_third_is_null_without_a_hairline_and_never_renormalized():
    _p, _pts, m = _profile(hairline=None)
    for mid in ("M017", "M018", "M019", "M024"):
        assert m[mid]["value"] is None and m[mid]["missing_reason"] == "hairline_not_found", mid
    assert m["M025"]["availability"] == "measured"               # middle / lower stays available


def test_fringe_over_the_forehead_reports_occlusion():
    face, shape = synthetic_face(stretch_upper=1.3)
    brow_y = face.pts(9)[1]
    prof, _pts, m = _profile(face, shape, hairline=brow_y - 3)
    assert prof["flags"]["upper_third_occluded"] is True
    assert m["M017"]["missing_reason"] == "upper_third_occluded" and m["M018"]["value"] is None
    assert "upper_third_occluded" in prof["missing_reasons_zh"]


def test_open_mouth_and_missing_iris_are_explicit():
    face, shape = synthetic_face(close_mouth=False)
    prof, _pts, m = _profile(face, shape)
    assert prof["flags"]["mouth_open"] is True
    for mid in ("M080", "M078", "M081"):
        assert m[mid]["value"] is None and m[mid]["missing_reason"] == "mouth_open"
    face, shape = synthetic_face()
    face.landmarks = face.landmarks[:468]
    _p, pts, m = _profile(face, shape)
    assert m["M035"]["missing_reason"] == "no_iris" and m["M037"]["missing_reason"] == "no_iris"
    assert not any(k.startswith("iris") for k in pts)


def test_side_metrics_need_a_true_profile_photo():
    _p, _pts, m = _profile()
    side = [x for x in m.values() if x["view"] == "side"]
    assert side and all(x["value"] is None and x["availability"] == "needs_photo"
                        and x["missing_reason"] == "needs_side_photo" for x in side)


def test_out_of_range_values_are_dropped_not_clamped():
    reg = copy.deepcopy(REG)
    for x in reg["metrics"]:
        if x["id"] == "M001":
            x["valid_range"] = [0.1, 0.2]
    face, shape = synthetic_face()
    prof, _pts = measure_profile(face, shape=shape, yaw=0, pitch=0, registry=reg)
    m = {x["id"]: x for x in prof["metrics"]}
    assert m["M001"]["value"] is None and m["M001"]["missing_reason"] == "out_of_range"


def test_pose_lowers_confidence_and_gates_symmetry():
    m = _profile(yaw=2.0)[2]
    assert m["M001"]["confidence"] == "high"
    m = _profile(yaw=9.0)[2]
    assert m["M001"]["confidence"] == "low"                      # medium sensitivity: 9 × 1.5 ≥ 12
    assert m["M044"]["confidence"] == "medium"
    m = _profile(yaw=14.0)[2]
    assert m["M114"]["missing_reason"] == "pose_off_axis" and m["M110"]["missing_reason"] == "pose_off_axis"
    m = _profile(yaw=None)[2]
    assert m["M001"]["confidence"] == "medium"                   # unknown pose is never "high"
    assert m["M051"]["confidence"] == "medium"                   # brows are capped (no hair segmentation)


def test_skin_items_need_color_and_pixels():
    face, shape = synthetic_face()
    m = _profile(face, shape)[2]
    assert m["M137"]["missing_reason"] == "color_unavailable" and m["M148"]["missing_reason"] == "color_unavailable"
    rgb = np.full((shape[0], shape[1], 3), 200, np.uint8)
    rgb[:, : shape[1] // 2] = 170                                # image-left half darker
    color = {"depth_L": 70.0, "warmth_b": 15.0, "reliability": "medium"}
    m = _profile(face, shape, rgb=rgb, color_measurements=color)[2]
    assert m["M137"]["value"] == 70.0 and m["M137"]["confidence"] == "medium"
    assert m["M148"]["value"] > 5 and m["M148"]["components"]["image_left"] < m["M148"]["components"]["image_right"]


# --- passport, insights, paywall ---------------------------------------------------------------------------------
def _sample():
    return json.loads((ROOT / "examples" / "sample_passport.json").read_text(encoding="utf-8"))


def test_sample_passports_carry_a_consistent_profile():
    for name in ("sample_passport.json", "sample_male_passport.json"):
        p = json.loads((ROOT / "examples" / name).read_text(encoding="utf-8"))
        m = {x["id"]: x for x in p["measurement_profile"]["metrics"]}
        a = p["anchors"]
        assert m["M001"]["value"] == pytest.approx(a["face_length_width_ratio"], abs=0.01)
        assert m["M033"]["value"] == pytest.approx(a["intercanthal_to_eye_width"], abs=0.01)
        assert m["M017"]["value"] == pytest.approx(a["thirds"]["upper"], abs=0.01)   # hairline built from it
        assert p["derived"]["measurement_insights"]["items"]
    geo = json.loads((ROOT / "web" / "lib" / "fixtures" / "sample_geometry.json").read_text(encoding="utf-8"))
    p = _sample()
    side_pts = set(geo["views"]["profile90"]["points"])
    for x in p["measurement_profile"]["metrics"]:
        if x["availability"] == "measured":
            ov = x["overlay"]
            used = {s["from"] for s in ov["segments"]} | {s["to"] for s in ov["segments"]} | set(ov["points"])
            used |= {n for a in ov["angles"] for n in (a["a"], a["vertex"], a["b"])}
            assert used <= (side_pts if x["view"] == "side" else set(geo["points"])), x["id"]


def test_insights_band_and_link_to_ranked_recommendations():
    from aesthetic_passport.insights import measurement_insights
    from aesthetic_passport.rules import load_rules

    p = _sample()
    prof = copy.deepcopy(p["measurement_profile"])
    for x in prof["metrics"]:
        if x["id"] == "M001":
            x["value"] = 1.6                                     # longer than the common range
    out = measurement_insights(prof, p["analysis"], p["derived"]["ranked_recommendations"], set(), load_rules())
    it = next(i for i in out["items"] if i["metric_id"] == "M001")
    assert it["band"] == "high" and it["highlight"] and it["seen_zh"].endswith("1.60 倍")
    hair = next(a for a in it["advice"] if a["area"] == "hair")
    recs = {r["id"]: r for r in p["analysis"]["recommendations"]}
    assert hair["page"] == "hair" and (hair["rec_id"] is None or recs[hair["rec_id"]]["category"] == "hairstyle")
    arch = next(x for x in out["pillars"] if x["key"] == "architecture")
    assert "M001" in arch["notable"] and "脸型偏修长" in arch["summary_zh"]
    assert measurement_insights(None, p["analysis"], [], set(), load_rules()) is None


def test_free_view_trims_detailed_metrics_on_the_server():
    from aesthetic_passport.api.entitlement import free_view
    from aesthetic_passport.schema_io import validate_passport

    p = _sample()
    fv, locked = free_view(p)
    assert "measurement_profile.full" in locked
    ms = fv["measurement_profile"]["metrics"]
    assert len(ms) == len(p["measurement_profile"]["metrics"])       # every module stays visible (V3B, D35) …
    full = [x for x in ms if x["tier"] == "full"]
    assert full and all(x["locked"] and x["value"] is None and x["components"] is None and x["confidence"] is None
                        and not x["overlay"]["segments"] and not x["overlay"]["angles"] for x in full)  # … values don't
    free = {x["id"] for x in ms if x["tier"] == "free"}
    mi = fv["derived"]["measurement_insights"]
    assert all(i["metric_id"] in free for i in mi["items"]) and all(a["metric_id"] in free for a in mi["assessments"])
    assert not [e for e in validate_passport(fv) if "measurement" in e] and validate_passport(p) == []
    assert all(x["value"] is not None for x in p["measurement_profile"]["metrics"] if x["tier"] == "full"
               and x["availability"] == "measured")


def test_old_passports_without_a_profile_still_validate_and_rerank():
    from aesthetic_passport.api.rerank import rerank_passport
    from aesthetic_passport.schema_io import validate_passport

    p = _sample()
    p.pop("measurement_profile")
    p["derived"].pop("measurement_insights")
    p["schema_version"] = "0.3.1"
    assert validate_passport(p) == []
    r = rerank_passport(p, p["user_context"], [], context_changed=False)
    assert r["derived"]["measurement_insights"] is None


def test_values_are_finite_and_rounded():
    prof = _profile()[0]
    for x in prof["metrics"]:
        if x["value"] is not None:
            assert math.isfinite(x["value"]) and round(x["value"], 4) == x["value"]


def _synthetic_run(monkeypatch, tmp_path, *, fail_profile: bool):
    """Run the real pipeline with a synthetic QC result (synthetic face + flat image) and the fake analysis model."""
    from PIL import Image

    import aesthetic_passport.face_metrics as fm
    from aesthetic_passport import qc
    from aesthetic_passport.cv import MODELS
    from aesthetic_passport.pipeline import run_pipeline
    from aesthetic_passport.qc import PhotoCheck

    face, shape = synthetic_face(stretch_upper=1.3)
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
    if fail_profile:
        def boom(*_a, **_k):
            raise RuntimeError("synthetic failure")
        monkeypatch.setattr(fm, "measure_all", boom)
    ctx = json.loads((ROOT / "examples" / "sample_context.json").read_text(encoding="utf-8"))["user_context"]
    run_dir = tmp_path / "run"
    return run_pipeline({"front": photo}, ctx, run_dir=run_dir), run_dir


def test_pipeline_writes_the_profile_and_the_points_from_the_same_landmarks(monkeypatch, tmp_path):
    p, run_dir = _synthetic_run(monkeypatch, tmp_path, fail_profile=False)
    mp = p["measurement_profile"]
    assert mp["coverage"]["measured"] >= 25 and p["derived"]["measurement_insights"]["items"]
    geo = json.loads((run_dir / "media" / "geometry.json").read_text(encoding="utf-8"))
    for m in mp["metrics"]:
        if m["availability"] == "measured":
            used = {s["from"] for s in m["overlay"]["segments"]} | {s["to"] for s in m["overlay"]["segments"]}
            assert used <= set(geo["points"]), m["id"]
    log = (run_dir / "cv.json").read_text(encoding="utf-8")
    assert "points" not in log and "landmark" not in log       # nothing photo-derived in the logs


def test_a_measurement_failure_never_blocks_the_passport(monkeypatch, tmp_path):
    """The profile is an extra CV layer: if it throws, the run still assembles a valid passport without it."""
    p, run_dir = _synthetic_run(monkeypatch, tmp_path, fail_profile=True)
    assert p["measurement_profile"] is None and p["derived"]["measurement_insights"] is None
    assert json.loads((run_dir / "cv.json").read_text(encoding="utf-8"))["measurement_error"] == "RuntimeError"
    assert json.loads((run_dir / "media" / "geometry.json").read_text(encoding="utf-8"))["points"] == {}
