"""V3B (D35): true side profile, multi-photo measurement views, eyewear handling, catalog classification.

Synthetic inputs only (MediaPipe's canonical mesh rendered at 90°; no person). The tracer must be invariant to
mirroring and to in-plane head tilt, move in the right direction when the lips or chin move, and return explicit
"unavailable" reasons instead of numbers whenever a photo cannot support a measurement.
"""
from __future__ import annotations

import csv
from pathlib import Path

import numpy as np
import pytest

from aesthetic_passport.face_metrics import PhotoIn, SideIn, load_registry, measure_all
from aesthetic_passport.face_metrics.profile import (
    ProfileUnavailable,
    compute_side,
    side_points,
    trace_profile,
)
from aesthetic_passport.face_metrics.synthetic import synthetic_face, synthetic_profile, synthetic_seg

ROOT = Path(__file__).resolve().parents[1]
KEYS = ("nasolabial_angle", "facial_convexity", "mentolabial_angle", "e_line_upper", "e_line_lower",
        "chin_projection", "nasomental_angle")


def _side(**kw):
    rgb, seg, _truth = synthetic_profile(**kw)
    t = trace_profile(rgb, seg)
    P = side_points(t)
    return t, {k: compute_side(k, t, P)[0] for k in KEYS}


def test_profile_metrics_are_mirror_and_tilt_invariant():
    _t, base = _side()
    _t, left = _side(facing="left")
    _t, tilt = _side(tilt_deg=18)
    for k in KEYS:
        assert left[k] == pytest.approx(base[k], abs=1e-6), k                 # mirroring changes nothing
        tol = 3.0 if k.endswith("angle") or k == "facial_convexity" else 0.02
        assert tilt[k] == pytest.approx(base[k], abs=tol), k                  # looking up / down changes little
    assert 150 < base["facial_convexity"] < 180 and 60 < base["nasolabial_angle"] < 150


def test_profile_metrics_follow_the_anatomy():
    _t, base = _side()
    _t, lips = _side(lip_protrusion=0.8)
    _t, chin = _side(chin_projection=1.0)
    assert lips["e_line_upper"] > base["e_line_upper"] + 0.03                 # lips forward → nearer / past E-line
    assert lips["nasolabial_angle"] < base["nasolabial_angle"]                # upper lip tips forward
    assert chin["chin_projection"] > base["chin_projection"]                  # chin forward
    assert chin["facial_convexity"] > base["facial_convexity"]                # straighter profile


def test_profile_tracer_refuses_a_face_without_profile_structure():
    seg = np.zeros((300, 300), np.uint8)
    with pytest.raises(ProfileUnavailable):
        trace_profile(np.zeros((300, 300, 3), np.uint8), seg)


def _front():
    face, shape = synthetic_face()
    return face, shape, synthetic_seg(face, shape, 150)


def test_front_only_has_no_side_numbers_and_explains_why():
    face, shape, seg = _front()
    prof, _pts, views = measure_all(face, shape=shape, yaw=0.0, pitch=0.0, seg=seg)
    side = [m for m in prof["metrics"] if m["view"] == "side"]
    assert side and all(m["value"] is None and m["availability"] == "needs_photo"
                        and m["missing_reason"] == "needs_side_photo" for m in side)
    assert prof["coverage"]["measured"] >= 30 and prof["coverage"]["side_measured"] == 0
    v = {x["role"]: x for x in prof["views"]}
    assert v["profile90"]["status"] == "not_provided" and "profile90" not in views
    assert "needs_side_photo" in prof["missing_reasons_zh"]


def test_rejected_side_photo_reason_reaches_every_side_metric():
    face, shape, seg = _front()
    prof, _p, _v = measure_all(face, shape=shape, yaw=0.0, pitch=0.0, seg=seg,
                               side=SideIn(shape=(240, 198), reason="side_not_true_profile"))
    side = [m for m in prof["metrics"] if m["view"] == "side"]
    assert all(m["missing_reason"] == "side_not_true_profile" and m["value"] is None for m in side)
    assert next(x for x in prof["views"] if x["role"] == "profile90")["status"] == "unavailable"


def test_front_plus_side_measures_eight_plus_profile_metrics_with_their_own_geometry():
    face, shape, seg = _front()
    rgb, sseg, _ = synthetic_profile()
    prof, _p, views = measure_all(face, shape=shape, yaw=0.0, pitch=0.0, seg=seg,
                                  side=SideIn(shape=rgb.shape[:2], trace=trace_profile(rgb, sseg)))
    side = [m for m in prof["metrics"] if m["view"] == "side" and m["availability"] == "measured"]
    assert len(side) >= 8 and all(m["source_photo"] == "profile90" for m in side)
    pts = views["profile90"]["points"]
    for m in side:                                        # every overlay name resolves in the side geometry
        ov = m["overlay"]
        names = {s["from"] for s in ov["segments"]} | {s["to"] for s in ov["segments"]} | set(ov["points"])
        names |= {n for a in ov["angles"] for n in (a["a"], a["vertex"], a["b"])}
        assert names <= set(pts), m["id"]
    assert len(views["profile90"]["silhouette"]) > 20


def test_low_resolution_side_photo_drops_small_features_instead_of_guessing():
    face, shape, seg = _front()
    rgb, sseg, _ = synthetic_profile(width=160, height=200, scale=6.5)       # a thumbnail-sized profile
    try:
        trace = trace_profile(rgb, sseg)
    except ProfileUnavailable:
        return                                             # refusing outright is also an honest outcome
    prof, _p, _v = measure_all(face, shape=shape, yaw=0.0, pitch=0.0, seg=seg,
                               side=SideIn(shape=rgb.shape[:2], trace=trace))
    side = {m["key"]: m for m in prof["metrics"] if m["view"] == "side"}
    assert side["nasolabial_angle"]["missing_reason"] in ("resolution_too_low", "out_of_range") or \
        side["nasolabial_angle"]["confidence"] == "low"


def test_eyewear_uses_the_glasses_free_photo_and_never_mixes_smile_into_neutral():
    face, shape, seg = _front()
    ng_face, ng_shape = synthetic_face(eye_scale=1.15)
    sm_face, sm_shape = synthetic_face(close_mouth=False)
    prof, _p, views = measure_all(face, shape=shape, yaw=0.0, pitch=0.0, seg=seg, eyewear="user",
                                  noglasses=PhotoIn(face=ng_face, shape=ng_shape, yaw=0.0, pitch=0.0),
                                  smile=PhotoIn(face=sm_face, shape=sm_shape, yaw=0.0, pitch=0.0))
    reg = {m["id"]: m for m in load_registry()["metrics"]}
    by = {m["id"]: m for m in prof["metrics"]}
    for mid, m in by.items():
        if reg[mid].get("eyewear"):
            assert m["source_photo"] == "noglasses", mid
        elif m["view"] == "front":
            assert m["source_photo"] == "front", mid
    assert by["M041"]["value"] != pytest.approx(measure_all(face, shape=shape, yaw=0.0, pitch=0.0, seg=seg)[0]
                                                 ["metrics"][[x["id"] for x in prof["metrics"]].index("M041")]["value"])
    assert {"noglasses", "smile"} <= set(views)
    smile = [m for m in prof["metrics"] if m["view"] == "smile"]
    assert all(m["source_photo"] == "smile" for m in smile if m["availability"] == "measured")
    # without a glasses-free photo the front photo is used, capped at low and annotated
    prof2, _p, _v = measure_all(face, shape=shape, yaw=0.0, pitch=0.0, seg=seg, eyewear="user")
    eye = next(m for m in prof2["metrics"] if m["id"] == "M041")
    assert eye["source_photo"] == "front" and eye["confidence"] == "low" and eye["notes"] == ["eyewear"]


def test_every_catalog_candidate_is_classified_exactly_once():
    reg = load_registry()
    ids = [r["id"] for r in csv.DictReader((ROOT / "docs/v3a/facial_metric_catalog_v1.csv").open(encoding="utf-8-sig"))]
    computed = {m["id"] for m in reg["metrics"]} | {a for m in reg["metrics"] for a in m.get("aliases", [])}
    status = reg["catalog_status"]
    assert len(ids) == 176
    for i in ids:
        assert (i in computed) != (i in status), i
    assert set(status) <= set(ids)
    for v in status.values():
        assert v["status"] in ("covered", "deferred", "qualitative", "excluded", "meta")
        if v["status"] == "covered":
            assert v["by"] in computed
