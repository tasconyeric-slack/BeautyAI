"""Issue #56: a generated hairstyle must never shift the face or show a second pair of brows, eyes or ears.

Deterministic regression fixture (no keys, no photos): a drawn portrait with distinct colours for hair, skin, ears,
brows and eyes, a colour-keyed stand-in for the segmenter, and a landmark stand-in that locates the eyes and brows
from their pixels, so a ghosted feature moves the detected landmarks the way it would confuse a real detector.
The "drifting model" returns the requested haircut with the whole head moved up — the reported failure.
Real-photo visual acceptance still needs consented portraits and provider access.
"""
import json
from pathlib import Path

import cv2
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
    # A ghost ear is a blob. An isolated hair/skin blend pixel can land in the ear colour window by coincidence.
    ear = cv2.morphologyEx(ear.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
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


def _moved_face(face, scale, dy_frac=0.0, cover_cheeks_frac=0.0, reshape_eyes_frac=0.0):
    """`face` as a model that returned the head `scale` times smaller (about the nose bridge) and `dy_frac` cheek
    widths lower would show it. New side hair over the cheek edge pulls the two cheek-contour landmarks inward;
    `reshape_eyes_frac` pushes the eye corners apart without moving the rest (a non-rigid change)."""
    lm = face.landmarks.copy()
    cheek = float(np.linalg.norm(face.pts(234) - face.pts(454)))
    centre = face.pts(168)
    lm[:, :2] = centre + (lm[:, :2] - centre) / scale + (0.0, dy_frac * cheek)
    lm[234, 0] += cover_cheeks_frac * cheek
    lm[454, 0] -= cover_cheeks_frac * cheek
    lm[[33, 133], 0] -= reshape_eyes_frac * cheek
    lm[[362, 263], 0] += reshape_eyes_frac * cheek
    return cv.Face(lm, None)


@pytest.mark.parametrize("scale,dy", [(1.09, 0.115), (1.155, 0.127), (1.14, 0.134)], ids=["a", "b", "c"])
def test_live_qwen_head_shrink_is_registered(stand_ins, monkeypatch, scale, dy):
    """Live qwen-image-2.0 on a full-frame portrait (Issue #1, 4 real generations): the model returns the same face
    9–15.5 % smaller and ~0.12 cheek widths off, with the new side hair over the cheek edge. Three of the four were
    rejected as "moved too far" although the inner face was a rigid copy (residual ≤ 0.008); rigid moves of that size
    register."""
    face, cfg = faces(ORIGINAL)[0], pv.load_qc_config()
    gen = _moved_face(face, scale, dy_frac=dy / 4, cover_cheeks_frac=0.04)
    monkeypatch.setattr(pv, "_faces_in_window", lambda *a, **k: [gen])
    window = np.ones((H, W), bool)
    _out, _win, aligned = pv.register_edit(ORIGINAL, scene(0, haircut="new"), face, window, cfg)
    assert np.abs(aligned.pts(pv.REGISTRATION_POINTS) - face.pts(pv.REGISTRATION_POINTS)).max() < 1.0


@pytest.mark.parametrize("kw", [{"scale": 1.30}, {"scale": 1.0, "reshape_eyes_frac": 0.05}], ids=["reframed", "reshaped"])
def test_larger_zoom_or_non_rigid_face_is_still_rejected(stand_ins, monkeypatch, kw):
    face, cfg = faces(ORIGINAL)[0], pv.load_qc_config()
    gen = _moved_face(face, cover_cheeks_frac=0.04, **kw)
    monkeypatch.setattr(pv, "_faces_in_window", lambda *a, **k: [gen])
    with pytest.raises(pv.MisalignedEdit):
        pv.register_edit(ORIGINAL, scene(0, haircut="new"), face, np.ones((H, W), bool), cfg)


class WarmerSkin(Drift):
    """The generated skin drifts a little warm (a normal model colour shift); the wall does not."""

    def edit(self, image, prompt, *, negative_prompt=None):
        res = super().edit(image, prompt, negative_prompt=negative_prompt)
        px = np.asarray(res.image).astype(np.float32)
        px[np.all(np.abs(px - SKIN) < 14, axis=2)] += (14, -2, -12)
        return ImageEditResult(Image.fromarray(px.clip(0, 255).astype(np.uint8)), "warm", 1, 0.0)


def test_revealed_wall_is_not_tinted_by_the_skin_correction(stand_ins, tmp_path):
    """Issue #1, live: a shorter cut reveals wall where long hair was. The skin-derived Lab correction had been
    applied to those pixels too and turned the neutral wall pink (+7 R / −7 B on a 172-grey wall)."""
    out = _render(WarmerSkin(0), tmp_path).composite
    revealed = out[250:350, 118:140].reshape(-1, 3).mean(axis=0)     # old curtain, wall in the new cut
    assert np.abs(revealed - BG).max() < 2.5, revealed.round(1)


# --- Issue #1: compositor defects seen on live qwen-image-2.0 output (Person-002) -------------------------------------
# Each test has a control that switches the rule off and shows the defect, so the fixture cannot pass vacuously.

@pytest.fixture
def true_oval(monkeypatch):
    """The fixture's FACE_OVAL landmarks are a distorted star (four are pinned elsewhere for the cheek/chin measure),
    so the polygon misses the left cheek. These tests need the face oval the portrait actually draws."""
    yy, xx = np.mgrid[0:H, 0:W]
    ellipse = ((xx - 300) / 150) ** 2 + ((yy - 400) / 200) ** 2 <= 1
    monkeypatch.setattr(pv, "_face_oval", lambda face, shape: ellipse)


def _composite(original, generated, segmenter=segment):
    """composite_edit on the whole frame (no registration or final face check: those are covered above)."""
    return pv.composite_edit(original, generated, faces(original)[0], segmenter(original), "hair",
                             np.ones((H, W), bool), pv.load_qc_config())


def _thin_blind_segment(rgb: np.ndarray) -> np.ndarray:
    """MediaPipe's segmenter misses hair strands a few pixels wide; the colour-keyed stand-in finds them."""
    seg = segment(rgb)
    hair = (seg == cv.SEG_HAIR).astype(np.uint8)
    thin = (seg == cv.SEG_HAIR) & (cv2.morphologyEx(hair, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)) == 0)
    seg[thin] = cv.SEG_BACKGROUND
    return seg


def _line(p0, p1) -> np.ndarray:
    m = np.zeros((H, W), np.uint8)
    cv2.line(m, p0, p1, 1, 1)
    return m > 0


def test_old_flyaways_are_removed_and_generated_ones_are_not_imported(stand_ins, true_oval, monkeypatch):
    """A shorter cut left the original's thin flyaways floating on the wall (faint arcs around the old silhouette)."""
    monkeypatch.setattr(pv.MODELS, "segment", _thin_blind_segment)
    original = ORIGINAL.copy()
    cv2.line(original, (45, 140), (75, 210), tuple(int(c) for c in OLD_HAIR), 1)       # beside the old cut
    generated = scene(0, haircut="new")
    cv2.line(generated, (525, 120), (555, 190), (235, 235, 235), 1)                    # a light strand the model made up
    old, invented = _line((45, 140), (75, 210)), _line((525, 120), (555, 190))
    off_wall = lambda out, where: np.abs(out[where].astype(int) - BG).max(axis=1).mean()

    out, _core, _mask = _composite(original, generated, _thin_blind_segment)
    assert off_wall(out, old) < 8 and off_wall(out, invented) < 8       # old one gone; the invented one not pasted in

    monkeypatch.setattr(pv, "stray_strands", lambda face, rgb, *a, **k: np.zeros(rgb.shape[:2], bool))
    control, _core, _mask = _composite(original, generated, _thin_blind_segment)
    assert off_wall(control, old) > 60                                  # without the rule the strand stays


def test_flyaway_rule_never_touches_the_face(stand_ins, true_oval, monkeypatch):
    """The face edge is a thin, dark line against the wall too: it must not be treated as a strand (ragged jaw)."""
    monkeypatch.setattr(pv.MODELS, "segment", _thin_blind_segment)
    seen = {}
    real = pv.stray_strands

    def spy(*args, **kwargs):
        seen["mask"] = real(*args, **kwargs)
        return seen["mask"]

    monkeypatch.setattr(pv, "stray_strands", spy)
    generated = scene(0, haircut="new")
    cv2.line(generated, (165, 360), (150, 440), (235, 235, 235), 1)
    _composite(ORIGINAL, generated, _thin_blind_segment)
    skin = (segment(ORIGINAL) == cv.SEG_FACE_SKIN) | (segment(ORIGINAL) == cv.SEG_BODY_SKIN)
    assert not (seen["mask"] & (skin | pv._face_oval(faces(ORIGINAL)[0], (H, W)))).any()


def _hull_brow_rule(faces_, rgb, edited, seg, result_seg, pm):
    """The pre-#1 rule: the whole padded landmark hull of every brow stays original wherever the segmenter says
    "not hair"."""
    out = np.zeros(rgb.shape[:2], bool)
    for f in faces_:
        for brow in (cv.LEFT_BROW, cv.RIGHT_BROW):
            out |= pv._dilate(cv.hull_mask(rgb.shape[:2], f.pts(brow)) > 0, pm["core_pad_px"])
    return out & (result_seg != cv.SEG_HAIR)


def test_brow_guard_freezes_the_brow_not_the_skin_under_it_or_the_fringe_over_it(stand_ins):
    """Live: a fringe covering the outer brow came out with a skin-coloured hole. The brow's landmark hull is a lens
    that also holds plain skin, and the segmenter called the fringe's thin strands "not hair", so the whole hull was
    frozen to the original. The brow itself, and a displaced second brow, stay protected; strands that run into the
    generated hair do not."""
    face, cfg = faces(ORIGINAL)[0], pv.load_qc_config()
    pm = cfg["preview_masks"]
    generated = scene(0, haircut="new")
    strands = np.zeros((H, W), bool)
    for k in range(12):                                                  # a bundle running out of the fringe over the brow
        cv2.line(generated, (205 + 3 * k, 300), (208 + 3 * k, 350), tuple(int(c) for c in NEW_HAIR), 1)
        strands |= _line((205 + 3 * k, 300), (208 + 3 * k, 350))
    seg, result_seg = _thin_blind_segment(ORIGINAL), _thin_blind_segment(generated)
    guard = pv.protected_brows((face, face), ORIGINAL, generated, seg, result_seg, pm)

    def brow(cx):
        return np.all(np.abs(ORIGINAL.astype(int) - BROW) < 14, axis=2) & (np.abs(np.arange(W)[None, :] - cx) < 36)

    right, left = brow(360), brow(240)
    hull = cv.hull_mask((H, W), face.pts(cv.LEFT_BROW)) > 0
    skin_in_hull = hull & ~pv._dilate(left, 8)                          # plain skin under the arch
    assert guard[right].mean() > 0.95                                   # an isolated brow stays the user's own
    assert not (guard & strands).any() and not (guard & skin_in_hull & (np.arange(W)[None, :] < 232)).any()

    old = _hull_brow_rule((face, face), ORIGINAL, generated, seg, result_seg, pm)
    assert (old & strands).sum() > 20 and (old & skin_in_hull).sum() > 50     # control: the old hull froze both


def _shadowed_original(depth: int) -> np.ndarray:
    """The old fringe covers the right forehead and its shadow darkens the skin beside it (up to `depth` levels)."""
    o = ORIGINAL.astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    rows = (yy >= 225) & (yy < BROW_Y - 9)
    o[rows & (xx >= 300) & (xx < 410)] = OLD_HAIR
    penumbra = rows & (xx >= 250) & (xx < 300)
    o[penumbra] -= (depth * (xx[penumbra] - 250) / 50)[:, None]
    return o.clip(0, 255).astype(np.uint8)


def _clean_forehead_generated() -> np.ndarray:
    """The model's result: the fringe is gone and the forehead is clean, evenly lit skin."""
    g = scene(0, haircut="new").astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    region = (yy >= 225) & (yy < BROW_Y - 9) & (abs(xx - 300) < 110)
    g[region] = np.array(SKIN) + np.random.default_rng(1).normal(0, 3, (int(region.sum()), 3))
    return g.clip(0, 255).astype(np.uint8)


def _seam_contrast(original, generated) -> float:
    """Luminance difference between the revealed skin just inside the edit-mask edge and the original skin just outside."""
    out, _core, mask = _composite(original, generated)
    lum = out.astype(float).mean(axis=2)
    rows = range(255, 295)
    edge = int(np.median([np.nonzero(mask[y, 200:330])[0].min() + 200 for y in rows if mask[y, 200:330].any()]))
    return abs(lum[255:295, edge + 3: edge + 8].mean() - lum[255:295, edge - 8: edge - 3].mean())


def test_skin_shadowed_by_the_removed_hair_is_replaced_not_matched(stand_ins, true_oval, monkeypatch):
    """Live: the old fringe's shadow left the original forehead ~50 levels darker than the clean, evenly lit skin the
    model generated, so the seam drew the fringe's outline. The shadowed original skin beside the removed hair is
    replaced too, so the seam moves out to where the two images agree."""
    original, generated = _shadowed_original(100), _clean_forehead_generated()
    assert _seam_contrast(original, generated) < 9

    monkeypatch.setattr(pv, "shadow_halo", lambda face, rgb, *a, **k: np.zeros(rgb.shape[:2], bool))
    assert _seam_contrast(original, generated) > 14                      # control: the visible seam


def _ears_displaced(shift: int) -> np.ndarray:
    """The generated head with both ears `shift` px off their real position (the registration fits the inner face)."""
    ears = tuple(x + s for x, s in zip(EAR_X, (-shift, shift), strict=True))
    return _with_ears(ears)


def _with_ears(ears) -> np.ndarray:
    saved = globals()["EAR_X"]
    globals()["EAR_X"] = ears
    try:
        return scene(0, haircut="new")
    finally:
        globals()["EAR_X"] = saved


def test_displaced_generated_ear_never_ghosts_or_erodes_the_real_one(stand_ins, true_oval, monkeypatch):
    """Live: blending the generated ear over the real one drew a second, semi-transparent ear contour."""
    generated = _ears_displaced(20)
    face, seg = faces(ORIGINAL)[0], segment(ORIGINAL)
    visible_ear = np.all(np.abs(ORIGINAL.astype(int) - EAR) < 18, axis=2)
    visible_ear[:386] = False                          # the old curtain still covers the upper ear (revealed as before)

    def ear_pixels(out):
        ear = np.all(np.abs(out.astype(int) - EAR) < 18, axis=2)
        ghost = cv2.morphologyEx((ear & ~visible_ear).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
        ghost[:386] = False
        return int((ear & visible_ear).sum()), int(ghost.sum())

    out, _core, _mask = _composite(ORIGINAL, generated)
    kept, ghosts = ear_pixels(out)
    assert (kept, ghosts) == (int(visible_ear.sum()), 0)
    guard = pv.keep_original_ears_neck(face, (H, W), ORIGINAL, seg, segment(generated))
    assert guard[visible_ear].all() and np.array_equal(out[guard], ORIGINAL[guard])

    monkeypatch.setattr(pv, "keep_original_ears_neck", lambda face, shape, *a, **k: np.zeros(shape, bool))
    kept, ghosts = ear_pixels(_composite(ORIGINAL, generated)[0])
    assert kept < visible_ear.sum() - 100 and ghosts > 0               # control: the real ear is eaten, a ghost appears


def test_ear_guard_leaves_foreheads_and_revealed_ears_alone(stand_ins, true_oval):
    face, seg = faces(ORIGINAL)[0], segment(ORIGINAL)
    guard = pv.keep_original_ears_neck(face, (H, W), ORIGINAL, seg, segment(scene(0, haircut="new")))
    brow = int(pv.brow_line_y(face))
    assert not guard[:brow].any()                                      # the forehead above the brows is never frozen
    assert not guard[(seg == cv.SEG_HAIR)].any()                       # ears the old hair covered are revealed
    covered = segment(scene(0, haircut="new"))
    covered[EAR_Y - 5: EAR_Y + 30, 112:170] = cv.SEG_HAIR              # ...and generated hair in front of an ear wins
    assert not pv.keep_original_ears_neck(face, (H, W), ORIGINAL, seg, covered)[EAR_Y - 5: EAR_Y + 30, 112:170].any()


def test_ear_guard_does_not_keep_a_dark_sideburn_the_segmenter_calls_skin(stand_ins, true_oval):
    """The guard first kept the old sideburn's tip: the segmenter labelled those dark pixels "skin", so a short dark
    streak survived at the temple of a cut that removes the sideburn (live Qwen, Person-002)."""
    original = ORIGINAL.copy()
    tip = (slice(386, 395), slice(100, 116))
    original[tip] = (60, 30, 25)                                       # dark, left of the ear, outside the oval
    seg = segment(original)
    assert (seg[tip] == cv.SEG_FACE_SKIN).all()                        # the segmenter's mistake
    face, generated_seg = faces(original)[0], segment(scene(0, haircut="new"))
    guard = pv.keep_original_ears_neck(face, (H, W), original, seg, generated_seg)
    assert not guard[tip].any()                                        # replaced like any other old hair
    assert guard[np.all(np.abs(original.astype(int) - EAR) < 18, axis=2) & (np.arange(H)[:, None] > 386)].all()   # ears stay

    skin = (seg == cv.SEG_FACE_SKIN) | (seg == cv.SEG_BODY_SKIN)
    outside = ~pv._face_oval(face, (H, W)) & (np.arange(H)[:, None] >= pv.brow_line_y(face))
    assert (outside & skin & (generated_seg != cv.SEG_HAIR))[tip].all()   # control: without the luminance test it is kept


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
