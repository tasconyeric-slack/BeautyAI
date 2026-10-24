"""V2 CV additions on synthetic data (no face photos needed): beauty-filter texture signal, geometry export."""
import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from aesthetic_passport.cv import Face

ROOT = Path(__file__).resolve().parents[1]


def _face(w=600, h=750):
    """A Face whose landmarks are spread on an ellipse, with the indices the V2 code reads placed plausibly."""
    lm = np.zeros((478, 3), np.float32)
    t = np.linspace(0, 2 * np.pi, 478, endpoint=False)
    lm[:, 0] = 300 + 150 * np.cos(t)
    lm[:, 1] = 380 + 190 * np.sin(t)
    fixed = {234: (150, 400), 454: (450, 400), 33: (230, 360), 263: (370, 360), 133: (275, 362), 362: (325, 362),
             61: (255, 520), 291: (345, 520), 13: (300, 512), 14: (300, 528), 152: (300, 590), 172: (190, 520),
             397: (410, 520), 469: (240, 360), 471: (216, 360), 474: (384, 360), 476: (360, 360)}
    for i, (x, y) in fixed.items():
        lm[i, :2] = (x, y)
    return Face(landmarks=lm, matrix=None), (h, w)


def test_skin_texture_drops_on_a_smoothed_photo():
    from aesthetic_passport.qc import load_qc_config, skin_texture

    face, (h, w) = _face()
    rng = np.random.default_rng(7)
    base = np.full((h, w, 3), 170, np.uint8)
    noisy = np.clip(base + rng.normal(0, 9, base.shape), 0, 255).astype(np.uint8)   # skin-like fine texture
    smooth = cv2.bilateralFilter(noisy, 15, 60, 15)
    smooth = cv2.GaussianBlur(smooth, (0, 0), 3)
    raw_t, smooth_t = skin_texture(noisy, face), skin_texture(smooth, face)
    limit = load_qc_config()["gate"]["beauty_filter_cheek_texture_min"]
    assert raw_t > limit > smooth_t


def test_qc_reason_codes_have_retake_messages_and_web_copy():
    from aesthetic_passport.qc import QC_REASON_CODES, load_qc_config

    msgs = load_qc_config()["retake_messages_zh"]
    assert set(QC_REASON_CODES) <= set(msgs)
    copy_ts = (ROOT / "web" / "lib" / "copy" / "zh.ts").read_text(encoding="utf-8")
    for code in QC_REASON_CODES:
        assert f"{code}:" in copy_ts or f'"{code}"' in copy_ts, code


def test_export_geometry_is_normalized_and_complete():
    from aesthetic_passport.anchors import export_geometry

    face, shape = _face()
    g = export_geometry(face, shape)
    sample = json.loads((ROOT / "web" / "lib" / "fixtures" / "sample_geometry.json").read_text(encoding="utf-8"))
    assert set(sample) - {"source", "points", "views"} <= set(g)  # points / views come from face_metrics (pipeline)
    for k in ("lip_outer", "lip_inner", "eye_l", "eye_r", "brow_l", "brow_r", "cheek_l", "cheek_r", "jaw", "neck"):
        pts = np.asarray(g[k])
        assert pts.ndim == 2 and pts.shape[1] == 2 and len(pts) >= 4, k
        assert (pts >= 0).all() and (pts <= 1).all(), k
    assert g["eye_l"][0][0] < g["eye_r"][0][0]          # eye_l is the image-left eye
    assert g["flags"]["mouth_open"] is True              # 16 px gap / 90 px mouth width > 0.08


@pytest.mark.parametrize("gap,expected", [(2, False), (16, True)])
def test_mouth_open_flag(gap, expected):
    from aesthetic_passport.anchors import export_geometry

    face, shape = _face()
    face.landmarks[14, 1] = face.landmarks[13, 1] + gap
    assert export_geometry(face, shape)["flags"]["mouth_open"] is expected
