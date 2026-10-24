"""CV layer: QC gate on programmatically degraded photos, anchors, face-shape heuristic.

Face-dependent tests need a face photo in data/test_faces/ (git-ignored) and the MediaPipe models (`make models`);
they are skipped otherwise. Pure-logic tests always run.
"""
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageEnhance, ImageFilter

from aesthetic_passport import cv
from aesthetic_passport.face_shape import classify
from aesthetic_passport.qc import _pose_issues, input_quality, lighting_consistency, load_qc_config

FACES = Path(__file__).resolve().parents[1] / "data" / "test_faces"
CANDIDATES = [p for p in sorted(FACES.glob("*")) if p.suffix.lower() in (".jpg", ".jpeg", ".png")] if FACES.exists() else []


def _face_photo():
    """First test photo with exactly one usable frontal face."""
    if not cv.available():
        return None
    from aesthetic_passport.qc import check_photo

    for p in CANDIDATES:
        im = Image.open(p).convert("RGB")
        im.thumbnail((1600, 1600))
        pc = check_photo(im, "front")
        if pc.face_count == 1 and pc.status != "reject":
            return im
    return None


FACE = _face_photo()
needs_face = pytest.mark.skipif(FACE is None, reason="no face photo in data/test_faces or MediaPipe models missing")


def qc(im, role="front"):
    from aesthetic_passport.qc import check_photo

    return check_photo(im, role)


# --- synthetic bad photos -----------------------------------------------------------------

@needs_face
def test_good_photo_is_not_rejected():
    pc = qc(FACE)
    assert pc.status in ("ok", "warn") and pc.face_count == 1
    assert pc.yaw is not None and abs(pc.yaw) < 12


@needs_face
def test_blur_rejected_as_blurry():
    pc = qc(FACE.filter(ImageFilter.GaussianBlur(14)))
    assert "blurry" in pc.issues and pc.status == "reject"


@needs_face
def test_dark_rejected_as_underexposed():
    pc = qc(ImageEnhance.Brightness(FACE).enhance(0.18))
    assert "underexposed" in pc.issues and pc.status == "reject"


@needs_face
def test_overexposed():
    pc = qc(ImageEnhance.Brightness(FACE).enhance(2.6))
    assert "overexposed" in pc.issues


@needs_face
def test_shrunk_face_rejected_as_too_small():
    w, h = FACE.size
    canvas = Image.new("RGB", (w, h), (235, 235, 235))
    small = FACE.resize((w // 5, h // 5))
    canvas.paste(small, (w // 2 - small.width // 2, h // 2 - small.height // 2))
    pc = qc(canvas)
    assert pc.status == "reject" and ("face_too_small" in pc.issues or "no_face" in pc.issues)


@needs_face
def test_two_faces_rejected():
    w, h = FACE.size
    tiled = Image.new("RGB", (w * 2, h))
    tiled.paste(FACE, (0, 0))
    tiled.paste(FACE, (w, 0))
    pc = qc(tiled)
    assert "multiple_faces" in pc.issues and pc.status == "reject"


@needs_face
def test_rotated_head_flags_pose():
    pc = qc(FACE.rotate(35, expand=True, fillcolor=(240, 240, 240)))
    assert pc.status == "reject" and "pose_off_axis" in pc.issues


def test_no_face_rejected():
    if not cv.available():
        pytest.skip("MediaPipe models missing")
    noise = Image.fromarray(np.random.default_rng(0).integers(0, 255, (600, 480, 3), dtype=np.uint8))
    pc = qc(noise)
    assert pc.issues == ["no_face"] and pc.status == "reject"


@needs_face
def test_frontal_photo_in_profile_slot_rejected():
    pc = qc(FACE, "profile45")
    assert "wrong_angle_for_role" in pc.issues and pc.status == "reject"


def test_hair_photo_without_face_is_allowed():
    if not cv.available():
        pytest.skip("MediaPipe models missing")
    plain = Image.new("RGB", (600, 800), (90, 70, 60))
    plain.paste(Image.new("RGB", (200, 200), (20, 15, 10)), (200, 200))
    pc = qc(plain, "hair")
    assert pc.status != "reject" and "no_face" not in pc.issues


@needs_face
def test_anchors_and_heuristic_on_real_face():
    from aesthetic_passport.anchors import measure

    pc = qc(FACE)
    anchors, warnings = measure(pc.face, pc.yaw)
    assert warnings == [] and anchors is not None
    assert 1.0 < anchors["face_length_width_ratio"] < 1.7
    assert 0.6 < anchors["width_profile"]["jaw"] < 1.0
    assert anchors["face_shape_heuristic"]["top"] in anchors["face_shape_heuristic"]["scores"]


# --- pure logic (always run) -----------------------------------------------------------------

def test_pose_rules_per_role():
    cfg = load_qc_config()
    assert _pose_issues("front", 3, 2, 1, cfg) == ([], set())
    assert _pose_issues("front", 18, 2, 1, cfg) == (["pose_off_axis"], set())             # warn
    assert _pose_issues("front", 40, 2, 1, cfg) == (["pose_off_axis"], {"pose_off_axis"})  # reject
    assert _pose_issues("profile45", -42, 3, 2, cfg) == ([], set())                       # either side
    assert _pose_issues("profile45", 22, 3, 2, cfg) == (["wrong_angle_for_role"], set())
    assert _pose_issues("profile45", 5, 3, 2, cfg)[1] == {"wrong_angle_for_role"}
    assert _pose_issues("hair", 90, 0, 0, cfg) == ([], set())


class _PC:
    def __init__(self, role, status, ab=None, issues=()):
        self.role, self.status, self.lab_ab_mean, self.issues = role, status, ab, list(issues)

    def entry(self):
        return {"photo_id": self.role, "status": self.status, "issues": self.issues}


def test_gate_requires_front_only():
    ok = [_PC("front", "ok", (130, 140)), _PC("profile45", "warn", (131, 141), ["blurry"])]
    iq = input_quality(ok)
    assert iq["passed"] and iq["lighting_consistency"] == "high"
    assert any(g.startswith("45° 侧脸") for g in iq["retake_guidance"])
    assert input_quality([_PC("front", "ok"), _PC("profile45", "reject", issues=["no_face"])])["passed"]   # D20
    assert not input_quality([_PC("front", "reject", issues=["blurry"]), _PC("profile45", "ok")])["passed"]
    assert input_quality([_PC("front", "ok")])["passed"]
    assert not input_quality([_PC("profile45", "ok")])["passed"]
    assert input_quality([_PC("front", "ok"), _PC("profile45", "ok"), _PC("smile", "reject")])["passed"]


def test_lighting_consistency_buckets():
    assert lighting_consistency([_PC("front", "ok", (128, 140))]) == "unknown"
    assert lighting_consistency([_PC("front", "ok", (128, 140)), _PC("profile45", "ok", (136, 146))]) == "medium"
    assert lighting_consistency([_PC("front", "ok", (128, 140)), _PC("profile45", "ok", (128, 160))]) == "low"
    # rejected photos don't count
    assert lighting_consistency([_PC("front", "ok", (128, 140)), _PC("profile45", "reject", (128, 190))]) == "unknown"


def _original_heuristic(aspect, forehead, jaw):
    """The MIT reference formulas, verbatim, to prove the config-driven port is equivalent."""
    def clamp(v):
        return max(0.0, min(1.0, v))

    def near(v, t, tol):
        return clamp(1.0 - abs(v - t) / tol)

    return {
        "round": 0.55 * near(aspect, 1.08, 0.30) + 0.25 * near(jaw, 0.90, 0.20) + 0.20 * near(forehead, 0.90, 0.22),
        "square": 0.45 * near(aspect, 1.18, 0.30) + 0.35 * near(jaw, 0.96, 0.16) + 0.20 * near(forehead, 0.91, 0.22),
        "oblong": 0.65 * clamp((aspect - 1.34) / 0.34) + 0.20 * near(jaw, 0.86, 0.22) + 0.15 * near(forehead, 0.90, 0.22),
        "heart": 0.45 * clamp((forehead - jaw + 0.02) / 0.22) + 0.25 * near(forehead, 0.96, 0.19) + 0.30 * clamp((1.0 - jaw) / 0.25),
        "diamond": 0.55 * clamp((1.0 - max(forehead, jaw)) / 0.25) + 0.25 * near(aspect, 1.35, 0.32) + 0.20 * near(forehead, jaw, 0.16),
        "oval": 0.55 * near(aspect, 1.36, 0.30) + 0.25 * near(jaw, 0.82, 0.19) + 0.20 * near(forehead, 0.88, 0.20),
    }


@pytest.mark.parametrize("aspect,forehead,jaw", [(1.05, 0.9, 0.92), (1.55, 0.88, 0.84), (1.3, 0.95, 0.72),
                                                  (1.35, 0.78, 0.77), (1.2, 0.92, 0.97), (1.38, 0.88, 0.82)])
def test_heuristic_port_matches_reference(aspect, forehead, jaw):
    ours = classify(aspect, forehead, jaw)
    ref = _original_heuristic(aspect, forehead, jaw)
    assert ours["scores"] == {k: round(v, 3) for k, v in ref.items()}
    assert ours["top"] == max(ref, key=ref.get)


def test_heuristic_flags_ambiguity():
    assert classify(1.36, 0.88, 0.82)["top"] == "oval"
    assert classify(1.05, 0.9, 0.92)["top"] == "round"
    assert classify(1.6, 0.88, 0.85)["top"] == "oblong"


# --- pipeline in real-CV mode -------------------------------------------------------------------

class _NeverCalled:
    name, model = "never", "never"

    def analyze(self, *a, **k):
        raise AssertionError("the model must not be called when the QC gate fails")


@needs_face
def test_failed_gate_stops_before_model_call(tmp_path, monkeypatch):
    from aesthetic_passport.pipeline import PipelineError, run_pipeline

    monkeypatch.setenv("QC_MODE", "real")
    ImageEnhance.Brightness(FACE).enhance(0.18).save(tmp_path / "front.jpg")   # D20: only the front photo can block
    FACE.save(tmp_path / "profile45.jpg")   # a frontal photo in the 45° slot → rejected (optional: guidance only)
    with pytest.raises(PipelineError) as e:
        run_pipeline({"front": tmp_path / "front.jpg", "profile45": tmp_path / "profile45.jpg"},
                     _ctx(), run_dir=tmp_path / "run", provider=_NeverCalled())
    assert e.value.code == "qc_failed"
    iq = e.value.payload["input_quality"]
    assert not iq["passed"] and any("正脸" in g for g in iq["retake_guidance"])
    assert any("45°" in g for g in iq["retake_guidance"])


@needs_face
def test_real_cv_run_carries_measured_anchors(tmp_path, monkeypatch):
    import json

    from aesthetic_passport import qc as qc_mod
    from aesthetic_passport.pipeline import run_pipeline
    from aesthetic_passport.providers import FakeProvider

    monkeypatch.setenv("QC_MODE", "real")
    monkeypatch.setattr(qc_mod, "_pose_issues", lambda *a, **k: ([], set()))  # no real 45° photo in the test set
    FACE.save(tmp_path / "front.jpg")
    FACE.save(tmp_path / "profile45.jpg")
    p = run_pipeline({"front": tmp_path / "front.jpg", "profile45": tmp_path / "profile45.jpg"}, _ctx(),
                     run_dir=tmp_path / "run", provider=FakeProvider(delay_s=0))
    assert p["anchors"]["method"] == "mediapipe_face_landmarker"
    assert p["anchors"]["face_shape_heuristic"]["top"] in p["anchors"]["face_shape_heuristic"]["scores"]
    assert p["input_quality"]["lighting_consistency"] == "high"   # same photo twice
    cm = p["color_measurements"]
    assert cm["method"] == "regional_lab_median" and cm["regions"]["skin"]["n_pixels"] > 0
    assert 20 < cm["depth_L"] < 100 and cm["reliability"] in ("high", "medium", "low")
    assert json.loads((tmp_path / "run" / "cv.json").read_text())["anchor_warnings"] == []


def _ctx():
    import json

    return json.loads((Path(__file__).resolve().parents[1] / "examples" / "sample_context.json").read_text())["user_context"]


@needs_face
def test_color_regions_land_on_the_right_features():
    import numpy as np

    from aesthetic_passport.color_sample import measure_colors

    pc = qc(FACE)
    cm = measure_colors(np.asarray(FACE), pc.face, lighting_consistency="high", clipped_frac=0.0, face_luma=150)
    r = cm["regions"]
    assert all(r[k] is not None for k in ("skin", "brow", "iris", "lip", "hair"))
    # Structural expectations that hold for any face: skin is lighter than brows, iris and hair.
    assert r["skin"]["lab"]["L"] > r["brow"]["lab"]["L"]
    assert r["skin"]["lab"]["L"] > r["iris"]["lab"]["L"]
    assert r["skin"]["lab"]["L"] > r["hair"]["lab"]["L"]
    assert cm["skin_brow_contrast_dL"] > 0


def test_lab_conversion_round_trip():
    import numpy as np

    from aesthetic_passport.color_sample import lab_to_hex, to_lab

    px = np.array([[[200, 150, 120]]], dtype=np.uint8)
    L, a, b = to_lab(px)[0, 0]
    assert 0 <= L <= 100 and a > 0 and b > 0          # a warm, light color
    assert lab_to_hex((L, a, b)) == "#C89678"


def test_retake_guidance_leads_with_what_blocks():
    front = _PC("front", "warn", issues=["face_too_small"])
    prof = _PC("profile45", "reject", issues=["blurry", "wrong_angle_for_role"])
    prof.rejects = {"wrong_angle_for_role"}
    g = input_quality([front, prof])["retake_guidance"]
    assert g[0].startswith("45° 侧脸：侧脸照需要约 45° 转头")
    assert g[-1].startswith("正脸")
