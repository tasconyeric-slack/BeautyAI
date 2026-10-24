"""Issue #56: a generated hairstyle must never shift the face or show a second pair of brows, eyes or ears.

Deterministic regression fixture (no keys, no photos): a drawn portrait with distinct colours for hair, skin, ears,
brows and eyes, a colour-keyed stand-in for the segmenter, and a landmark stand-in that locates the eyes and brows
from their pixels, so a ghosted feature moves the detected landmarks the way it would confuse a real detector.
The "drifting model" returns the requested haircut with the whole head moved up — the reported failure.
Real-photo visual acceptance still needs consented portraits and provider access.
"""
import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from aesthetic_passport import cv
from aesthetic_passport import preview as pv
from aesthetic_passport.masks import NOSE_HULL, head_crop_box
from aesthetic_passport.providers.image.base import ImageEditResult

ROOT = Path(__file__).resolve().parents[1]
PASSPORT = json.loads((ROOT / "examples" / "sample_passport.json").read_text(encoding="utf-8"))
H, W = 750, 600
BG, SKIN, EAR = (150, 150, 150), (195, 150, 130), (160, 105, 95)
BROW, EYE, MOUTH = (70, 50, 40), (25, 25, 25), (170, 70, 80)
OLD_HAIR, NEW_HAIR = (40, 35, 95), (110, 60, 150)
EAR_X, EAR_Y, EAR_RX, EAR_RY = (140, 460), 395, 22, 40
BROW_Y, EYE_Y = 325, 360


def _ellipse(cx, cy, rx, ry):
    yy, xx = np.mgrid[0:H, 0:W]
    return ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1


def scene(dy: int = 0, dx: int = 0, haircut: str = "old", eye_gap: int = 0, extra_brows: bool = False) -> np.ndarray:
    """The portrait with every facial feature moved by (dx, dy). `old`: long side curtains over the upper ears;
    `new`: a fringe that stops just above the brows and a short cut that reveals the ears."""
    rng = np.random.default_rng(5)
    img = np.empty((H, W, 3), np.float32)
    img[:] = BG
    paint = lambda m, c: img.__setitem__(m, c)
    for x in EAR_X:
        paint(_ellipse(x + dx, EAR_Y + dy, EAR_RX, EAR_RY), EAR)
    paint(_ellipse(300 + dx, 400 + dy, 150, 200), SKIN)
    for x in (240, 360):
        paint(_ellipse(x + dx, BROW_Y + dy, 35, 6), BROW)
        off = -eye_gap if x < 300 else eye_gap
        paint(_ellipse(x + dx + off, EYE_Y + dy, 30, 10), EYE)
    paint(_ellipse(300 + dx, 520 + dy, 50, 18), MOUTH)
    yy, xx = np.mgrid[0:H, 0:W]
    if haircut == "old":
        cap = (yy < 230 + dy) & (abs(xx - 300 - dx) < 190)
        curtains = (yy >= 200 + dy) & (yy < 385 + dy) & (
            ((xx >= 112 + dx) & (xx < 170 + dx)) | ((xx >= 430 + dx) & (xx < 488 + dx)))
        paint(cap | curtains, OLD_HAIR)
    else:
        cap = (yy < 225 + dy) & (abs(xx - 300 - dx) < 185)
        fringe = (yy >= 225 + dy) & (yy < BROW_Y - 9 + dy) & (abs(xx - 300 - dx) < 110)
        paint(cap | fringe, NEW_HAIR)
    if extra_brows:   # a hallucinated second pair, painted over the fringe
        for x in (240, 360):
            paint(_ellipse(x + dx, BROW_Y + dy - 38, 35, 6), BROW)
    img += rng.normal(0, 3, img.shape)
    return img.clip(0, 255).astype(np.uint8)


def segment(rgb: np.ndarray) -> np.ndarray:
    """Colour-keyed stand-in for MediaPipe's multiclass segmenter."""
    r, b = rgb[..., 0].astype(int), rgb[..., 2].astype(int)
    out = np.full(rgb.shape[:2], cv.SEG_BACKGROUND, np.uint8)
    out[(r - b > 20) | (rgb.max(axis=2) < 60)] = cv.SEG_FACE_SKIN
    out[b - r > 25] = cv.SEG_HAIR
    return out


def base_landmarks() -> np.ndarray:
    lm = np.zeros((478, 3), np.float64)
    lm[:, :2] = (300, 400)

    def ring(idx, cx, cy, rx, ry):
        for i, a in zip(idx, np.linspace(0, 2 * np.pi, len(idx), endpoint=False), strict=True):
            lm[i, :2] = (cx + rx * np.cos(a), cy + ry * np.sin(a))

    ring(cv.FACE_OVAL, 300, 400, 150, 200)
    ring(cv.RIGHT_EYE, 240, EYE_Y, 30, 10)
    ring(cv.LEFT_EYE, 360, EYE_Y, 30, 10)
    ring(cv.RIGHT_BROW, 240, BROW_Y, 35, 6)
    ring(cv.LEFT_BROW, 360, BROW_Y, 35, 6)
    ring(cv.LIPS_OUTER, 300, 520, 50, 18)
    ring(NOSE_HULL, 300, 440, 22, 40)
    for i, xy in {234: (150, 400), 454: (450, 400), 152: (300, 600), 10: (300, 200)}.items():
        lm[i, :2] = xy
    return lm


BASE = base_landmarks()


def faces(rgb: np.ndarray) -> list[cv.Face]:
    """Landmark stand-in: each eye and brow is located from its own pixels; the rest of the mesh follows the eyes."""
    eye = rgb.max(axis=2) < 50
    brow = np.all(np.abs(rgb.astype(int) - BROW) < 14, axis=2)
    if eye.sum() < 50:
        return []
    ys, xs = np.nonzero(eye)
    shift = np.array([xs.mean() - 300, ys.mean() - EYE_Y])
    lm = BASE.copy()
    lm[:, :2] += shift
    mid = round(300 + shift[0])
    for idx, cx, cy, mask in ((cv.RIGHT_EYE, 240, EYE_Y, eye), (cv.LEFT_EYE, 360, EYE_Y, eye),
                              (cv.RIGHT_BROW, 240, BROW_Y, brow), (cv.LEFT_BROW, 360, BROW_Y, brow)):
        side = mask.copy()
        if cx < 300:
            side[:, mid:] = False
        else:
            side[:, :mid] = False
        if side.sum() < 20:
            continue
        ys, xs = np.nonzero(side)
        lm[idx, :2] = BASE[idx, :2] + (xs.mean() - cx, ys.mean() - cy)
    return [cv.Face(landmarks=lm, matrix=None)]


ORIGINAL = scene(0, haircut="old")


class Drift:
    """A model that returns the new haircut with the whole head moved by (dx, dy) and optionally a reshaped face."""

    name = model = "drift"

    def __init__(self, dy=0, dx=0, **kw):
        self.dy, self.dx, self.kw = dy, dx, kw
        self.calls = 0

    def edit(self, image, prompt, *, negative_prompt=None):
        self.calls += 1
        out = np.asarray(image).copy()
        out[:H, :W] = scene(self.dy, self.dx, haircut="new", **self.kw)    # the crop is the whole frame here
        return ImageEditResult(Image.fromarray(out), "drift", 1, 0.0)


@pytest.fixture
def stand_ins(monkeypatch):
    monkeypatch.setattr(pv.MODELS, "faces", faces)
    monkeypatch.setattr(pv.MODELS, "segment", segment)


def _render(provider, tmp_path):
    return pv.render_target(Image.fromarray(ORIGINAL), PASSPORT, "hair", "safe", provider=provider, out_dir=tmp_path)


def _ghosts(img: np.ndarray) -> tuple[int, int]:
    """(dark non-hair pixels on the forehead between the new fringe and the brows, ear pixels above the real ears)."""
    strip = img[285:312, 200:400].astype(int)
    lum = strip.mean(axis=2)
    brownish = strip[..., 0] - strip[..., 2] > 10           # brows and skin are warm; the hair colours are blue
    brow_like = int(((lum < np.mean(SKIN) - 35) & brownish).sum())
    ear = np.all(np.abs(img.astype(int) - EAR) < 18, axis=2)
    ear_above = int(ear[: EAR_Y - EAR_RY - 4, 100:175].sum() + ear[: EAR_Y - EAR_RY - 4, 425:500].sum())
    return brow_like, ear_above


def test_fixture_crop_is_the_whole_frame():
    face = faces(ORIGINAL)[0]
    assert head_crop_box(face, ORIGINAL.shape[:2], "hair", pv.load_qc_config(), seg=segment(ORIGINAL)) == (0, 0, W, H)
    assert np.allclose(face.landmarks, BASE)


def test_unregistered_drift_reproduces_doubled_brows_and_ears(stand_ins):
    """The reported defect, on the pre-#56 path: compositing the moved head without registration."""
    window = np.ones((H, W), bool)
    edited = scene(-40, haircut="new")
    face = faces(ORIGINAL)[0]
    out, _core, _ = pv.composite_edit(ORIGINAL, edited, face, segment(ORIGINAL), "hair", window, pv.load_qc_config())
    brows, ears = _ghosts(out)
    assert brows > 300 and ears > 300


@pytest.mark.parametrize("dy,dx", [(-40, 0), (25, 0), (-30, 12)])
def test_moved_head_is_registered_without_doubled_or_shifted_features(stand_ins, tmp_path, dy, dx):
    reference = _render(Drift(0), tmp_path / "ref").composite          # what a perfectly registered model gives
    res = _render(Drift(dy, dx), tmp_path / "drift")
    out = res.composite
    assert _ghosts(out) == (0, 0)
    core = res.core
    assert np.array_equal(out[core], ORIGINAL[core])                     # identity guarantee unchanged
    detected = faces(out)[0]
    for group in pv.FEATURE_GROUPS:                                       # one face, features where they were
        assert np.abs(detected.pts(group) - BASE[group, :2]).max() < 1.5
    # The haircut is still the generated one, laid on the original head.
    hair, ref_hair = segment(out) == cv.SEG_HAIR, segment(reference) == cv.SEG_HAIR
    assert (hair & ref_hair).sum() / (hair | ref_hair).sum() > 0.97 and res.change > 10


def test_tiny_offsets_are_not_resampled(stand_ins, monkeypatch):
    cfg = pv.load_qc_config()
    face = faces(ORIGINAL)[0]
    edited = scene(0, haircut="new")
    window = np.ones((H, W), bool)
    out, win, gen = pv.register_edit(ORIGINAL, edited, face, window, cfg)
    assert out is edited and win is window and gen.landmarks is not None
    moved = scene(-12, haircut="new")
    out, win, gen = pv.register_edit(ORIGINAL, moved, face, window, cfg)
    assert out is not moved and not win[:12].any() and win[12:].all()   # the top rows were never generated
    assert np.abs(gen.pts(pv.REGISTRATION_POINTS) - face.pts(pv.REGISTRATION_POINTS)).max() < 1e-3


@pytest.mark.parametrize("provider", [Drift(0, eye_gap=22), Drift(-170)], ids=["reshaped", "reframed"])
def test_reshaped_or_reframed_face_is_rejected(stand_ins, tmp_path, provider):
    with pytest.raises(pv.MisalignedEdit):
        _render(provider, tmp_path)
    assert not list(tmp_path.glob("*.jpg"))


@pytest.mark.parametrize("found", [0, 2])
def test_missing_or_duplicated_generated_face_is_rejected(stand_ins, monkeypatch, tmp_path, found):
    def detect(img):
        if np.array_equal(img, ORIGINAL):
            return faces(img)
        return faces(img) * found

    monkeypatch.setattr(pv.MODELS, "faces", detect)
    with pytest.raises(pv.MisalignedEdit):
        _render(Drift(0), tmp_path)


def test_hallucinated_extra_brows_fail_the_final_composite_check(stand_ins, tmp_path):
    """Aligned head, but the model painted a second pair of brows over the fringe: never a successful preview."""
    with pytest.raises(pv.MisalignedEdit, match="composite"):
        _render(Drift(0, extra_brows=True), tmp_path)


def test_each_retry_gets_its_own_seed():
    import httpx

    from aesthetic_passport.providers.image import FakeImageEditProvider, QwenImageEditProvider

    qwen = QwenImageEditProvider("qwen-image-2.0", base_url="https://x/api/v1", seed=1234,
                                 client=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(500))))
    assert pv.provider_for_attempt(qwen, 0) is qwen
    retry = pv.provider_for_attempt(qwen, 1)
    assert retry.seed == 1235 and qwen.seed == 1234 and retry.request_body(Image.new("RGB", (512, 512)), "p", None)[
        "parameters"]["seed"] == 1235
    fake = FakeImageEditProvider()
    assert pv.provider_for_attempt(fake, 1) is fake


def test_api_misaligned_preview_retries_then_falls_back(tmp_path, monkeypatch, stand_ins):
    import io

    from fastapi.testclient import TestClient

    from aesthetic_passport.api import previews
    from aesthetic_passport.api.app import create_app
    from aesthetic_passport.api.settings import Settings

    monkeypatch.setenv("ANALYSIS_PROVIDER", "fake")
    monkeypatch.setenv("FAKE_ANALYSIS_DELAY_S", "0")
    monkeypatch.setenv("QC_MODE", "stub")
    policy = {**previews.pricing(), "free_previews": 1}
    monkeypatch.setattr(previews, "pricing", lambda: policy)
    provider = Drift(0, eye_gap=22)
    monkeypatch.setattr(previews, "image_from_config", lambda: provider)
    settings = Settings(runs_dir=tmp_path / "runs", run_jobs_inline=True)
    buf = io.BytesIO()
    Image.fromarray(ORIGINAL).save(buf, format="PNG")
    ctx = (ROOT / "examples" / "sample_context.json").read_text(encoding="utf-8")
    with TestClient(create_app(settings)) as api:
        r = api.post("/api/passport", files={"front": ("front.png", buf.getvalue(), "image/png")},
                     data={"context": ctx, "consent": "true"})
        assert r.status_code == 202
        pid = r.json()["id"]
        body = api.get(f"/api/passport/{pid}").json()
    row = body["partial"]["previews"][0]
    assert (row["status"], row["error"]) == ("fallback", pv.MisalignedEdit.detail), row
    assert provider.calls == 2
    assert not list((settings.runs_dir / pid).rglob("preview_*.jpg"))
