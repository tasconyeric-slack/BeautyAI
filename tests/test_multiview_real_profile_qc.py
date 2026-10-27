"""Opt-in FEI regressions; research photos stay in ignored data/ and never enter CI artifacts.

Set BEAUTYAI_FEI_DIR to the directory containing the selected original JPEGs. See multiview.md.
"""
import os
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from aesthetic_passport.cv import MODELS, available
from aesthetic_passport.face_metrics.profile import profile_masks
from aesthetic_passport.qc import check_profile90

ROOT = Path(__file__).resolve().parents[1]


def _photo(filename):
    path = Path(os.environ.get("BEAUTYAI_FEI_DIR", ROOT / "data/fei")) / filename
    if not path.exists() or not available():
        pytest.skip("Selected local FEI research photo and MediaPipe models required")
    return np.asarray(Image.open(path).convert("RGB"))


@pytest.mark.parametrize("filename,pad,facing", [
    ("1-10.jpg", 0.08, "right"), ("1-10.jpg", 0.2, "right"),
    ("2-01.jpg", 0.2, "left"), ("3-01.jpg", 0.2, "left"),
    ("3-10.jpg", 0.08, "right"), ("3-10.jpg", 0.2, "right"),
])
def test_real_face_dominant_profile_survives_neck_misclassification(filename, pad, facing):
    rgb = _photo(filename)
    _, skin = profile_masks(MODELS.segment(rgb))
    ys, xs = np.nonzero(skin)
    h = int(ys.max() - ys.min())
    x0, x1 = max(0, int(xs.min() - h * pad)), min(rgb.shape[1], int(xs.max() + h * pad))
    y0, y1 = max(0, int(ys.min() - h * pad)), min(rgb.shape[0], int(ys.max() + h * pad))
    # Native pixels only; cropping does not create resolution. All these crops retain forehead, nose and chin.
    check = check_profile90(rgb[y0:y1, x0:x1].copy())
    assert check.status != "reject", check.extra.get("reason")
    assert check.extra["trace"].facing == facing


@pytest.mark.parametrize("filename", ["1-03.jpg", "1-08.jpg"])
def test_real_three_quarter_is_not_accepted_as_profile(filename):
    check = check_profile90(_photo(filename))
    assert check.status == "reject"
    assert check.rejects & {"wrong_angle_for_role", "profile_unclear"}


@pytest.mark.parametrize("filename,facing", [
    ("9-01.jpg", "left"), ("9-10.jpg", "right"),
    ("10-01.jpg", "left"), ("10-10.jpg", "right"),
    ("11-01.jpg", "left"), ("11-10.jpg", "right"),
])
def test_real_original_profile_uses_face_instead_of_shoulder(filename, facing):
    check = check_profile90(_photo(filename))
    assert check.status != "reject", check.extra.get("reason")
    assert check.extra["trace"].facing == facing
