"""QC v2.1 (D28): relative face size + effective resolution; sharpness on features at a down-only scale.

Synthetic tests (always run) place a fake MediaPipe face on generated images, so the gate logic is tested without
photos. Real-face tests use data/test_faces/ (git-ignored) like tests/test_cv.py and are skipped without one.
"""
from pathlib import Path

import cv2
import numpy as np
import pytest
from PIL import Image, ImageFilter

from aesthetic_passport import qc as qc_mod
from aesthetic_passport.cv import Face

FACES = Path(__file__).resolve().parents[1] / "data" / "test_faces"


def _synthetic_face(cx: float, cy: float, fw: float, fh: float) -> Face:
    """Landmarks on an ellipse of size fw × fh around (cx, cy), with eyes / brows / lips placed plausibly."""
    lm = np.zeros((478, 3), np.float64)
    t = np.linspace(0, 2 * np.pi, 478, endpoint=False)
    lm[:, 0] = cx + fw / 2 * np.cos(t)
    lm[:, 1] = cy + fh / 2 * np.sin(t)
    from aesthetic_passport.cv import LEFT_BROW, LEFT_EYE, LIPS_OUTER, RIGHT_BROW, RIGHT_EYE

    def place(idx, x, y, w, h):
        a = np.linspace(0, 2 * np.pi, len(idx), endpoint=False)
        for i, k in enumerate(idx):
            lm[k, :2] = (cx + (x + w / 2 * np.cos(a[i])) * fw, cy + (y + h / 2 * np.sin(a[i])) * fh)

    place(RIGHT_EYE, -0.2, -0.08, 0.2, 0.06)
    place(LEFT_EYE, 0.2, -0.08, 0.2, 0.06)
    place(RIGHT_BROW, -0.2, -0.18, 0.24, 0.04)
    place(LEFT_BROW, 0.2, -0.18, 0.24, 0.04)
    place(LIPS_OUTER, 0.0, 0.25, 0.3, 0.08)
    for k, (x, y) in {234: (-0.5, 0), 454: (0.5, 0), 33: (-0.3, -0.08), 263: (0.3, -0.08), 61: (-0.15, 0.25),
                      291: (0.15, 0.25)}.items():
        lm[k, :2] = (cx + x * fw, cy + y * fh)
    return Face(landmarks=lm, matrix=None)


def _textured(w: int, h: int, seed: int = 3) -> np.ndarray:
    """Mid-grey 'skin' with fine noise and many sharp-edged dark/light blocks (feature-like edges)."""
    rng = np.random.default_rng(seed)
    img = np.full((h, w, 3), 165, np.float32) + rng.normal(0, 6, (h, w, 1))
    for _ in range(w * h // 900):
        x, y = rng.integers(0, w - 24), rng.integers(0, h - 16)
        img[y:y + rng.integers(6, 16), x:x + rng.integers(8, 24)] = rng.choice([40, 230])
    return np.clip(img, 0, 255).astype(np.uint8)


@pytest.fixture
def fake_faces(monkeypatch):
    """Make check_photo see exactly the faces we give it (no MediaPipe)."""
    box = {}

    def faces(_rgb):
        if "faces" in box:
            return box["faces"]
        return [box["face"]] if "face" in box else []

    monkeypatch.setattr(qc_mod.MODELS, "faces", faces)
    monkeypatch.setattr(qc_mod, "skin_texture", lambda *a, **k: 3.0)   # texture has its own test
    return box


def test_id_style_portrait_passes_size_and_sharpness(fake_faces):
    # 358×441 (Chinese ID photo size); the face fills ~60% of the height but is only ~200 px wide.
    rgb = _textured(358, 441)
    fake_faces["face"] = _synthetic_face(179, 230, 200, 265)
    pc = qc_mod.check_photo(rgb, "front")
    assert "face_too_small" not in pc.issues
    assert "blurry" not in pc.issues
    assert pc.edge_width is not None and pc.edge_width < qc_mod.load_qc_config()["gate"]["edge_width_warn"]


def test_jpeg_and_resampled_id_portrait_still_pass(fake_faces):
    import io

    rgb = _textured(413, 531)
    small = Image.fromarray(rgb).resize((358, 460), Image.Resampling.LANCZOS)    # resampled once, like most uploads
    buf = io.BytesIO()
    small.save(buf, "JPEG", quality=65)
    im = Image.open(io.BytesIO(buf.getvalue())).convert("RGB")
    fake_faces["face"] = _synthetic_face(179, 240, 200, 275)
    pc = qc_mod.check_photo(im, "front")
    assert "blurry" not in pc.issues and "face_too_small" not in pc.issues


def test_genuinely_blurred_portrait_is_flagged(fake_faces):
    rgb = np.asarray(Image.fromarray(_textured(358, 441)).filter(ImageFilter.GaussianBlur(4)))
    fake_faces["face"] = _synthetic_face(179, 230, 200, 265)
    pc = qc_mod.check_photo(rgb, "front")
    assert "blurry" in pc.issues


def test_horizontal_motion_blur_is_flagged(fake_faces):
    k = 41   # synthetic edges are isotropic, so the x-direction allowance (sharp_x_factor) needs a longer shake here
    kernel = np.zeros((k, k), np.float32)
    kernel[k // 2, :] = 1 / k
    lens = cv2.GaussianBlur(_textured(600, 750), (0, 0), 1.0)   # real optics: synthetic blocks are unrealistically crisp
    rgb = cv2.filter2D(lens, -1, kernel)
    fake_faces["face"] = _synthetic_face(300, 380, 300, 380)
    pc = qc_mod.check_photo(rgb, "front")
    assert "blurry" in pc.issues


def test_small_face_in_a_large_frame_warns_and_tiny_face_rejects(fake_faces):
    rgb = _textured(1200, 1500)
    fake_faces["face"] = _synthetic_face(600, 700, 150, 190)          # 13% of the height, 150 px: usable, but small
    pc = qc_mod.check_photo(rgb, "front")
    assert "face_too_small" in pc.issues and "face_too_small" not in pc.rejects
    guidance = qc_mod.input_quality([pc])["retake_guidance"][0]
    assert "占比偏小" in guidance and "裁" in guidance
    fake_faces["face"] = _synthetic_face(600, 700, 60, 75)             # 60 px: cannot be measured
    pc = qc_mod.check_photo(rgb, "front")
    assert "face_too_small" in pc.rejects and pc.status == "reject"


def test_large_sharp_photo_is_evaluated_without_upsampling(fake_faces):
    """A 1600 px photo is scaled down to the evaluation size; a small face is never scaled up."""
    cfg = qc_mod.load_qc_config()["gate"]
    face = _synthetic_face(800, 900, 700, 880)
    crop, s, _ = qc_mod._eval_crop(_textured(1600, 1800), face, cfg["sharp_eval_face_px"])
    assert s < 1 and crop.shape[1] <= cfg["sharp_eval_face_px"] * 1.25
    small = _synthetic_face(100, 120, 120, 150)
    _, s2, _ = qc_mod._eval_crop(_textured(200, 250), small, cfg["sharp_eval_face_px"])
    assert s2 == 1.0


@pytest.mark.parametrize("width,status", [(79, "reject"), (80, "warn"), (100, "warn"), (119, "warn"), (120, "ok")])
def test_close_up_native_resolution_has_detail_guidance_not_framing(fake_faces, width, status):
    # A sharp face fills 80% of either dimension, but may have too few native pixels.
    rgb = _textured(150, 200)
    fake_faces["face"] = _synthetic_face(10 + width / 2, 100, width, 160)
    result = qc_mod.check_photo_with_messages(rgb, "front")
    assert result["status"] == status, result
    assert "face_too_small" not in result["issues"]
    if status != "ok":
        assert "blurry" in result["issues"]  # existing schema's detail-quality code
        assert "分辨率" in result["messages"][0] and "原图" in result["messages"][0]
        assert "裁" not in result["messages"][0] and "靠近" not in result["messages"][0]
        pc = qc_mod.check_photo(rgb, "front")
        guidance = qc_mod.input_quality([pc])["retake_guidance"][0]
        assert "分辨率" in guidance and "裁" not in guidance


def test_sharp_close_crop_with_landmarks_beyond_frame_is_usable(fake_faces):
    rgb = _textured(358, 441)
    fake_faces["face"] = _synthetic_face(179, 220, 390, 475)
    pc = qc_mod.check_photo(rgb, "front")
    assert pc.status == "ok", pc.issues
    assert pc.face_box_px == 358  # pixels outside the photo do not count


def test_clipped_box_cannot_invent_face_resolution(fake_faces):
    rgb = _textured(100, 140)
    fake_faces["face"] = _synthetic_face(50, 70, 160, 200)
    result = qc_mod.check_photo_with_messages(rgb, "front")
    assert result["face_box_px"] == 100
    assert "face_too_small" not in result["issues"]
    assert "blurry" in result["issues"]
    assert "分辨率" in result["messages"][0]


@pytest.mark.parametrize("bad", ["nonfinite", "degenerate", "off_frame"])
def test_unusable_detector_geometry_rejects_without_crashing(fake_faces, bad):
    face = _synthetic_face(179, 220, 200, 275)
    if bad == "nonfinite":
        face.landmarks[0, 0] = np.nan
    elif bad == "degenerate":
        face.landmarks[:, :2] = 100
    else:
        face.landmarks[:, :2] += 2000
    fake_faces["face"] = face
    pc = qc_mod.check_photo(_textured(358, 441), "front")
    assert pc.status == "reject" and pc.issues == ["no_face"]
    assert pc.face is None and pc.face_count == 0


def test_face_selection_ignores_unusable_out_of_frame_box(fake_faces):
    good = _synthetic_face(179, 220, 200, 275)
    fake_faces["faces"] = [_synthetic_face(3000, 3000, 1000, 1200), good]
    pc = qc_mod.check_photo(_textured(358, 441), "front")
    assert pc.face is good and pc.face_count == 1 and pc.status == "ok"


def test_unmeasurable_features_do_not_silently_pass(fake_faces):
    fake_faces["face"] = _synthetic_face(179, 220, 200, 275)
    pc = qc_mod.check_photo(np.full((441, 358, 3), 165, np.uint8), "front")
    assert pc.blur_score is None
    assert pc.status == "reject" and "no_face" in pc.rejects


def test_missing_required_face_still_rejects(fake_faces):
    pc = qc_mod.check_photo(_textured(358, 441), "front")
    assert pc.status == "reject" and pc.issues == ["no_face"]


def test_multiple_visible_faces_still_reject(fake_faces):
    fake_faces["faces"] = [_synthetic_face(100, 220, 150, 190), _synthetic_face(270, 220, 150, 190)]
    pc = qc_mod.check_photo(_textured(400, 441), "front")
    assert pc.status == "reject" and "multiple_faces" in pc.rejects and pc.face_count == 2


def test_cropped_front_jpeg_reaches_real_qc_and_preserves_native_resolution(fake_faces, tmp_path, monkeypatch):
    import io

    from fastapi.testclient import TestClient

    from aesthetic_passport.api.app import create_app
    from aesthetic_passport.api.settings import Settings

    monkeypatch.setenv("QC_MODE", "real")
    # Same native-pixel 2x zoom as the editor: 320x400 -> 160x200, never upscaled.
    source = Image.fromarray(_textured(320, 400))
    crop = source.crop((80, 100, 240, 300))
    buf = io.BytesIO()
    crop.save(buf, "JPEG", quality=92)

    def detect(rgb):
        assert rgb.shape == (200, 160, 3)
        assert np.array_equal(rgb, np.asarray(Image.open(io.BytesIO(buf.getvalue())).convert("RGB")))
        return [_synthetic_face(80, 100, 100, 160)]

    monkeypatch.setattr(qc_mod.MODELS, "faces", detect)
    with TestClient(create_app(Settings(runs_dir=tmp_path / "runs"))) as client:
        response = client.post("/api/qc", data={"role": "front"}, files={"file": ("crop.jpg", buf.getvalue(), "image/jpeg")})
    assert response.status_code == 200
    result = response.json()
    assert result["mode"] == "real" and result["status"] == "warn", result
    assert result["face_box_px"] == 100 and "face_too_small" not in result["issues"]
    assert "分辨率" in result["messages"][0] and "裁" not in result["messages"][0]


# --- real faces (skipped without data/test_faces) -------------------------------------------------------------

def _real_face():
    from aesthetic_passport import cv

    if not FACES.exists() or not cv.available():
        return None
    for p in sorted(FACES.glob("*")):
        if p.suffix.lower() not in (".jpg", ".jpeg", ".png"):
            continue
        im = Image.open(p).convert("RGB")
        faces = cv.MODELS.faces(np.asarray(im))
        if len(faces) == 1:
            return im, faces[0]
    return None


REAL = _real_face()


@pytest.mark.skipif(REAL is None, reason="no face photo in data/test_faces or MediaPipe models missing")
@pytest.mark.parametrize("size", [(358, 441), (413, 531), (300, 370)])
def test_real_id_crop_is_not_flagged_small_or_blurry(size):
    im, face = REAL
    x0, y0, x1, y1 = face.box
    H = (y1 - y0) / 0.62
    W = H * size[0] / size[1]
    cx, top = (x0 + x1) / 2, y0 - 0.22 * H
    crop = im.crop((int(cx - W / 2), int(top), int(cx + W / 2), int(top + H))).resize(size, Image.Resampling.LANCZOS)
    pc = qc_mod.check_photo(crop, "front")
    assert "face_too_small" not in pc.issues and "blurry" not in pc.issues, (pc.issues, pc.edge_width)
    blurred = qc_mod.check_photo(crop.filter(ImageFilter.GaussianBlur(3.5)), "front")
    assert "blurry" in blurred.issues


def test_every_photo_reason_code_is_allowed_by_the_passport_schema():
    """Regression (V2.1): beauty_filter_suspect was emitted by QC but rejected by the schema, crashing assembly."""
    import json

    from aesthetic_passport.qc import QC_REASON_CODES

    schema = json.loads((Path(__file__).resolve().parents[1] / "schema" / "passport.schema.json").read_text())
    allowed = set(schema["properties"]["input_quality"]["properties"]["photos"]["items"]["properties"]["issues"]["items"]["enum"])
    per_photo = set(QC_REASON_CODES) - {"lighting_inconsistent"}   # a run-level note, never a photo issue
    assert per_photo <= allowed, per_photo - allowed
