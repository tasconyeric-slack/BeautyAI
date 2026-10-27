"""Non-private canonical-mesh regressions for profile QC (Issue #12)."""
import numpy as np
import pytest

from aesthetic_passport.cv import MODELS, SEG_CLOTHES, SEG_FACE_SKIN
from aesthetic_passport.face_metrics.profile import ProfileUnavailable, trace_profile
from aesthetic_passport.face_metrics.synthetic import synthetic_profile
from aesthetic_passport.qc import check_profile90


@pytest.mark.parametrize("facing", ["left", "right"])
def test_disconnected_skin_cannot_inflate_profile_resolution(monkeypatch, facing):
    rgb, seg, _ = synthetic_profile(scale=6.5, facing=facing)
    # A small, disconnected segmentation error far above the real 115px-tall face.
    seg[10:20, 600:620] = SEG_FACE_SKIN
    monkeypatch.setattr(MODELS, "faces", lambda _: [])
    monkeypatch.setattr(MODELS, "segment", lambda _: seg)
    check = check_profile90(rgb)
    assert check.status == "reject"
    assert check.rejects == {"face_too_small"}
    assert check.extra["face_h_px"] == 115.0


def test_foreground_without_face_skin_returns_named_unavailable():
    rgb, seg, _ = synthetic_profile(scale=6.5)
    # A larger disconnected foreground object wins component selection.
    seg[:, :200] = SEG_CLOTHES
    with pytest.raises(ProfileUnavailable, match="no_face"):
        trace_profile(rgb, seg)


def test_rejected_three_quarter_keeps_diagnostic_trace(monkeypatch):
    from aesthetic_passport.cv import Face

    rgb, seg, truth = synthetic_profile()
    lm = np.zeros((478, 3))
    lm[:, :2] = (300, 350)
    lm[1, :2] = np.array(truth["mesh_1"]) - (60, 0)
    a = np.deg2rad(45)
    matrix = np.array([[np.cos(a), 0, np.sin(a), 0], [0, 1, 0, 0],
                       [-np.sin(a), 0, np.cos(a), 0], [0, 0, 0, 1]])
    face = Face(lm, matrix)
    monkeypatch.setattr(MODELS, "faces", lambda _: [face])
    monkeypatch.setattr(MODELS, "segment", lambda _: seg)
    check = check_profile90(rgb)
    assert check.status == "reject" and "wrong_angle_for_role" in check.rejects
    assert check.extra["trace"].nose_gap > 0.05


@pytest.mark.parametrize("facing", ["left", "right"])
@pytest.mark.parametrize("connected_skin", [False, True])
def test_neck_skin_labels_do_not_turn_a_shoulder_into_the_nose(monkeypatch, facing, connected_skin):
    rgb, seg, truth = synthetic_profile()
    # Same foreground component as the head: a shoulder extends beyond the nose and the segmenter
    # labels some neck pixels as face skin. Unlike a detached foreground patch, it survives PR #15.
    seg[620:, :] = SEG_CLOTHES
    seg[500 if connected_skin else 700:760, 250:290] = SEG_FACE_SKIN
    if facing == "left":
        rgb, seg = rgb[:, ::-1].copy(), seg[:, ::-1].copy()
    monkeypatch.setattr(MODELS, "faces", lambda _: [])
    monkeypatch.setattr(MODELS, "segment", lambda _: seg)
    check = check_profile90(rgb)
    assert check.status != "reject", check.extra.get("reason")
    trace = check.extra["trace"]
    assert trace.facing == facing
    nose_x = truth["mesh_1"][0] if facing == "right" else rgb.shape[1] - 1 - truth["mesh_1"][0]
    assert trace.landmarks["prn"][0] == pytest.approx(nose_x, abs=4)
    assert check.extra["face_h_px"] < 500  # neck labels do not supply native face resolution


def test_skin_hidden_behind_foreground_is_an_outline_failure(monkeypatch):
    rgb, seg, _ = synthetic_profile()
    # Skin is present, but a foreground occluder covers the entire anterior boundary.
    seg[:, 550:] = SEG_CLOTHES
    seg[620:, :] = SEG_CLOTHES
    monkeypatch.setattr(MODELS, "faces", lambda _: [])
    monkeypatch.setattr(MODELS, "segment", lambda _: seg)
    check = check_profile90(rgb)
    assert check.rejects == {"profile_unclear"}
    assert check.extra["reason"] == "landmarks_unclear"
    assert check.extra["reason_detail"] == {"stage": "anterior_face_skin"}


@pytest.mark.parametrize("facing", ["left", "right"])
def test_frontal_false_detection_on_ear_does_not_reject_a_true_profile(monkeypatch, facing):
    from aesthetic_passport.cv import Face

    rgb, seg, truth = synthetic_profile(facing=facing)
    # The real FEI failure is a small, low-yaw mesh on the ear, wholly behind the cheek.
    # The detector returns no usable facial landmarks there; the existing silhouette still has the full face.
    lm = np.zeros((478, 3))
    lm[:, :2] = (230, 335)
    lm[0, :2], lm[1, :2], lm[2, :2] = (210, 310), (240, 340), (260, 370)
    if facing == "left":
        lm[:, 0] = rgb.shape[1] - 1 - lm[:, 0]
    monkeypatch.setattr(MODELS, "faces", lambda _: [Face(lm, np.eye(4))])
    monkeypatch.setattr(MODELS, "segment", lambda _: seg)
    check = check_profile90(rgb)
    assert check.status != "reject", check.extra.get("reason")
    assert check.face is None and check.yaw is None and check.face_box_px is None
    trace = check.extra["trace"]
    assert trace.facing == facing and trace.nose_gap is None
    assert trace.landmarks["prn"][0] == pytest.approx(truth["mesh_1"][0], abs=4)


def test_frontal_mesh_spanning_the_face_is_still_rejected(monkeypatch):
    from aesthetic_passport.cv import Face

    rgb, seg, truth = synthetic_profile()
    lm = np.zeros((478, 3))
    lm[:, :2] = (390, 350)
    lm[0, :2], lm[1, :2], lm[2, :2] = (240, 230), truth["mesh_1"], (540, 510)
    monkeypatch.setattr(MODELS, "faces", lambda _: [Face(lm, np.eye(4))])
    monkeypatch.setattr(MODELS, "segment", lambda _: seg)
    check = check_profile90(rgb)
    assert check.rejects == {"wrong_angle_for_role"}
    assert check.face is not None and check.yaw == 0


def test_posterior_meshes_do_not_bypass_multiple_face_rejection(monkeypatch):
    from aesthetic_passport.cv import Face

    rgb, seg, _ = synthetic_profile()
    lm = np.zeros((478, 3))
    lm[:, :2] = (230, 335)
    lm[0, :2], lm[1, :2], lm[2, :2] = (210, 310), (240, 340), (260, 370)
    monkeypatch.setattr(MODELS, "faces", lambda _: [Face(lm, np.eye(4)), Face(lm.copy(), np.eye(4))])
    monkeypatch.setattr(MODELS, "segment", lambda _: seg)
    check = check_profile90(rgb)
    assert "multiple_faces" in check.rejects
    assert check.face is not None
