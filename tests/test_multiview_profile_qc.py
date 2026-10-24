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
