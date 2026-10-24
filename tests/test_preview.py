"""Recommended Look: deterministic prompt, Qwen adapter request/response handling, the identity guarantee of the
composite, failure fallback, and the API preview flow. No network, no keys."""
import copy
import io
import json
from pathlib import Path

import cv2
import httpx
import numpy as np
import pytest
from PIL import Image

from aesthetic_passport import cv
from aesthetic_passport.preview import PreviewError, build_prompt, render_preview, usable_preview_recs
from aesthetic_passport.providers.base import load_models_config
from aesthetic_passport.providers.image import (
    FakeImageEditProvider,
    ImageEditError,
    QwenImageEditProvider,
    image_from_config,
    resolve_base_url,
)
from aesthetic_passport.providers.image.qwen import fit_for_model

ROOT = Path(__file__).resolve().parents[1]
PASSPORT = json.loads((ROOT / "examples" / "sample_passport.json").read_text(encoding="utf-8"))
FACES = ROOT / "data" / "test_faces"


def _face_image():
    if not cv.available() or not FACES.exists():
        return None
    from aesthetic_passport.qc import check_photo

    for p in sorted(FACES.glob("*")):
        if p.suffix.lower() not in (".jpg", ".jpeg", ".png"):
            continue
        im = Image.open(p).convert("RGB")
        im.thumbnail((1600, 1600))
        if check_photo(im, "front").face_count == 1:
            return im
    return None


FACE = _face_image()
needs_face = pytest.mark.skipif(FACE is None, reason="no face photo in data/test_faces or MediaPipe models missing")
SPEC = PASSPORT["analysis"]["recommendations"][0]["visual_edit_spec"]


# --- prompt ---------------------------------------------------------------------------------

def test_prompt_is_deterministic():
    assert build_prompt(SPEC) == build_prompt(copy.deepcopy(SPEC))


def test_prompt_content():
    p = build_prompt(SPEC)
    assert p.startswith("Edit only the hair in this photo of a real person.")
    assert SPEC["target_description"] in p
    assert "barber or hairstylist" in p and "No beautification" in p
    assert p.lower().count("background") == 1          # preserve items the template already guarantees are not repeated
    assert "\n" not in p and "  " not in p


@pytest.mark.parametrize("region,phrase", [("brows", "eyebrows"), ("glasses", "eyeglasses"),
                                           ("facial_hair", "facial hair"), ("clothing_top", "top (shirt")])
def test_prompt_names_each_region(region, phrase):
    spec = dict(SPEC, region=region, preserve=["face shape"])
    assert f"Edit only the {phrase}" in build_prompt(spec)


def test_usable_preview_recs_respects_c7_and_exclusions():
    ids = usable_preview_recs(PASSPORT)
    assert ids[:1] == ["r1"] and "r5" not in ids     # r5 has no edit spec
    p = copy.deepcopy(PASSPORT)
    p["derived"]["consistency_flags"].append({"code": "C7", "severity": "warn", "message": "x", "affected": ["r1"]})
    assert "r1" not in usable_preview_recs(p)


# --- Qwen adapter (mocked HTTP) -------------------------------------------------------------------

def _png(size=(64, 80), color=(10, 20, 30)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def _qwen(handler):
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return QwenImageEditProvider("qwen-image-edit-plus", base_url="https://dashscope-intl.aliyuncs.com/api/v1",
                                 client=client, seed=7, price_per_image=0.03)


def test_qwen_request_shape_and_response_parsing():
    seen = {}

    def handler(req: httpx.Request):
        if req.method == "POST":
            seen["url"] = str(req.url)
            seen["body"] = json.loads(req.content)
            return httpx.Response(200, json={"output": {"choices": [{"finish_reason": "stop", "message": {
                "role": "assistant", "content": [{"image": "https://result.example/x.png"}]}}]},
                "usage": {"image_count": 1}, "request_id": "r"})
        return httpx.Response(200, content=_png((500, 600)))

    res = _qwen(handler).edit(Image.new("RGB", (300, 400)), "PROMPT", negative_prompt="NEG")
    assert seen["url"].endswith("/api/v1/services/aigc/multimodal-generation/generation")
    body = seen["body"]
    assert body["model"] == "qwen-image-edit-plus"
    content = body["input"]["messages"][0]["content"]
    assert len(body["input"]["messages"]) == 1 and body["input"]["messages"][0]["role"] == "user"
    assert content[0]["image"].startswith("data:image/jpeg;base64,") and content[1] == {"text": "PROMPT"}
    assert body["parameters"] == {"n": 1, "prompt_extend": False, "watermark": False, "negative_prompt": "NEG", "seed": 7}
    assert res.image.size == (500, 600) and res.cost_usd_est == 0.03


@pytest.mark.parametrize("response", [
    httpx.Response(400, json={"code": "DataInspectionFailed", "message": "refused"}),
    httpx.Response(200, json={"output": {"choices": [{"message": {"content": [{"text": "no image"}]}}]}}),
    httpx.Response(500, text="oops"),
])
def test_qwen_failures_raise_image_edit_error(response):
    with pytest.raises(ImageEditError):
        _qwen(lambda req: response).edit(Image.new("RGB", (400, 400)), "P")


@pytest.mark.parametrize("response, retryable", [
    (httpx.Response(404, json={"code": "InvalidParameter", "message": "Model not exist."}), False),
    (httpx.Response(404, text="<html>404 page not found</html>"), False),      # wrong host / path: no JSON body
    (httpx.Response(400, json={"code": "InvalidParameter", "message": "Model not exist."}), False),
    (httpx.Response(400, json={"code": "InvalidParameter", "message": "the image size is invalid"}), True),
    (httpx.Response(400, json={"code": "DataInspectionFailed", "message": "refused"}), True),
    (httpx.Response(429, json={"code": "Throttling", "message": "slow down"}), True),
    (httpx.Response(500, text="oops"), True),
])
def test_qwen_only_unroutable_failures_are_not_retryable(response, retryable):
    with pytest.raises(ImageEditError) as exc:
        _qwen(lambda req: response).edit(Image.new("RGB", (400, 400)), "P")
    assert exc.value.retryable is retryable


CONFIGURED = "https://dashscope.aliyuncs.com/api/v1"
WORKSPACE = "https://ws123.cn-beijing.maas.aliyuncs.com/api/v1"


@pytest.mark.parametrize("override, expected", [
    (None, CONFIGURED), ("", CONFIGURED), ("   ", CONFIGURED),
    (WORKSPACE, WORKSPACE),
    (f"  {WORKSPACE}\n", WORKSPACE),
    ("https://ws123.cn-beijing.maas.aliyuncs.com", WORKSPACE),                  # bare host → DashScope path
    ("https://ws123.cn-beijing.maas.aliyuncs.com/", WORKSPACE),
    ("ws123.cn-beijing.maas.aliyuncs.com", WORKSPACE),                          # pasted without the scheme
    ("ws123.cn-beijing.maas.aliyuncs.com/api/v1", WORKSPACE),
    ("https://proxy.example/dashscope/api/v1", "https://proxy.example/dashscope/api/v1"),   # explicit path kept
])
def test_resolve_base_url(override, expected):
    assert resolve_base_url(CONFIGURED, override) == expected


def test_image_from_config_base_url_env_override(monkeypatch):
    monkeypatch.setattr("dotenv.load_dotenv", lambda *a, **k: None, raising=False)
    monkeypatch.setenv("IMAGE_EDIT_PROVIDER", "qwen")
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
    configured = load_models_config()["providers"]["qwen"]["base_url"]
    monkeypatch.delenv("DASHSCOPE_BASE_URL", raising=False)
    assert image_from_config().base_url == configured.rstrip("/")               # fallback: the configured URL
    monkeypatch.setenv("DASHSCOPE_BASE_URL", "")
    assert image_from_config().base_url == configured.rstrip("/")               # blank counts as unset
    monkeypatch.setenv("DASHSCOPE_BASE_URL", WORKSPACE)
    provider = image_from_config()
    model = load_models_config()["production"]["image_edit"]["model"]
    assert provider.base_url == WORKSPACE and provider.model == model                 # model is unchanged


def test_qwen_posts_to_the_overridden_host():
    seen = []

    def handler(req: httpx.Request):
        seen.append(str(req.url))
        return httpx.Response(404, json={"code": "InvalidParameter", "message": "Model not exist."})

    provider = QwenImageEditProvider("qwen-image-edit-plus", base_url=resolve_base_url(CONFIGURED, WORKSPACE),
                                     client=httpx.Client(transport=httpx.MockTransport(handler)))
    with pytest.raises(ImageEditError):
        provider.edit(Image.new("RGB", (400, 400)), "P")
    assert seen == [f"{WORKSPACE}/services/aigc/multimodal-generation/generation"]


def test_qwen_requires_key(monkeypatch):
    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
    with pytest.raises(ImageEditError):
        QwenImageEditProvider("m", base_url="https://x")


def test_fit_for_model_respects_size_limits():
    assert fit_for_model(Image.new("RGB", (200, 300))).size == (384, 576)
    assert max(fit_for_model(Image.new("RGB", (4000, 2000))).size) == 3072
    im = Image.new("RGB", (800, 1000))
    assert fit_for_model(im) is im


@pytest.mark.parametrize("size", [(800, 1200), (1200, 800), (400, 400), (3072, 3072)])
def test_qwen_2_requests_output_in_the_input_geometry(size):
    provider = QwenImageEditProvider("qwen-image-2.0", base_url=CONFIGURED,
                                     client=httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(500))))
    body = provider.request_body(Image.new("RGB", size), "P", None)
    w, h = map(int, body["parameters"]["size"].split("*"))
    assert w % 16 == h % 16 == 0
    assert 512 ** 2 <= w * h <= 2048 ** 2
    assert w / h == pytest.approx(size[0] / size[1], rel=0.02)


# --- composite: the identity guarantee ----------------------------------------------------------------

@needs_face
def test_protected_face_pixels_are_unchanged(tmp_path):
    from aesthetic_passport.preview import core_region

    r = render_preview(FACE, PASSPORT, "r1", provider=FakeImageEditProvider(), out_path=tmp_path / "preview_r1.jpg")
    before = np.asarray(FACE)
    face = cv.MODELS.faces(before)[0]
    from aesthetic_passport.qc import load_qc_config

    prot = core_region(face, before.shape[:2], "hair", load_qc_config()["preview_masks"]["core_pad_px"])
    assert prot.sum() > 1_000 and r.protected_pixels == prot.sum()
    # Exact: the fake editor changes every pixel (face included), yet the face is the original.
    assert np.array_equal(r.composite[prot], before[prot])
    hair = cv.MODELS.segment(before) == cv.SEG_HAIR
    changed = np.abs(r.composite.astype(int) - before.astype(int)).mean(axis=2)
    assert changed[hair & ~prot].mean() > 8            # the edit is visible on the hair
    # Served pair: matched 4:5 head crops; on the protected pixels they differ only by JPEG noise.
    after_img, before_img = Image.open(tmp_path / "preview_r1.jpg"), Image.open(tmp_path / "before_r1.jpg")
    assert r.before_path.name == "before_r1.jpg" and after_img.size == before_img.size
    assert abs(after_img.width / after_img.height - 0.8) < 0.02
    a, b = np.asarray(after_img).astype(int), np.asarray(before_img).astype(int)
    from aesthetic_passport.masks import head_crop_box
    from aesthetic_passport.preview import display_box

    x0, y0, x1, y1 = display_box(head_crop_box(face, before.shape[:2], "hair", seg=cv.MODELS.segment(before)),
                                before.shape[:2])
    pc = prot[y0:y1, x0:x1]
    assert np.abs(a - b).mean(axis=2)[pc].mean() < 1.0


@needs_face
def test_editor_failure_becomes_preview_error(tmp_path):
    with pytest.raises(PreviewError):
        render_preview(FACE, PASSPORT, "r1", provider=FakeImageEditProvider(fail=True), out_path=tmp_path / "a.jpg")
    assert not (tmp_path / "a.jpg").exists()


def test_not_previewable_rec_rejected(tmp_path):
    with pytest.raises(PreviewError):
        render_preview(Image.new("RGB", (400, 500)), PASSPORT, "r5", provider=FakeImageEditProvider(),
                       out_path=tmp_path / "a.jpg")


# --- V2 engine on synthetic data (B1) ------------------------------------------------------------------

def _synthetic():
    """A 600×750 image, a Face with landmarks on simple shapes, and a segmentation with hair above and beside it."""
    from aesthetic_passport.cv import (
        FACE_OVAL,
        LEFT_BROW,
        LEFT_EYE,
        LIPS_OUTER,
        RIGHT_BROW,
        RIGHT_EYE,
        SEG_BACKGROUND,
        SEG_FACE_SKIN,
        SEG_HAIR,
        Face,
    )
    from aesthetic_passport.masks import NOSE_HULL

    h, w = 750, 600
    lm = np.zeros((478, 3), np.float32)
    lm[:, :2] = (300, 400)
    ring = lambda idx, cx, cy, rx, ry: [lm.__setitem__((i, slice(0, 2)), (cx + rx * np.cos(a), cy + ry * np.sin(a)))
                                         for i, a in zip(idx, np.linspace(0, 2 * np.pi, len(idx), endpoint=False), strict=True)]
    ring(FACE_OVAL, 300, 400, 150, 200)
    ring(RIGHT_EYE, 240, 360, 30, 10)
    ring(LEFT_EYE, 360, 360, 30, 10)
    ring(RIGHT_BROW, 240, 325, 35, 6)
    ring(LEFT_BROW, 360, 325, 35, 6)
    ring(LIPS_OUTER, 300, 520, 50, 18)
    ring(NOSE_HULL, 300, 440, 22, 40)
    for i, xy in {234: (150, 400), 454: (450, 400), 152: (300, 600), 10: (300, 200), 172: (190, 520), 397: (410, 520)}.items():
        lm[i, :2] = xy
    face = Face(landmarks=lm, matrix=None)
    seg = np.full((h, w), SEG_BACKGROUND, np.uint8)
    yy, xx = np.mgrid[0:h, 0:w]
    seg[((xx - 300) / 150) ** 2 + ((yy - 400) / 200) ** 2 <= 1] = SEG_FACE_SKIN
    seg[(yy < 230) & (abs(xx - 300) < 190)] = SEG_HAIR
    rng = np.random.default_rng(3)
    rgb = np.clip(rng.normal(150, 20, (h, w, 3)), 0, 255).astype(np.uint8)
    hair = seg == SEG_HAIR
    rgb[hair] = np.clip(rng.normal(35, 10, (int(hair.sum()), 3)), 0, 255).astype(np.uint8)   # dark hair, like photos
    return rgb, face, seg


@pytest.fixture
def synthetic(monkeypatch):
    rgb, face, seg = _synthetic()
    from aesthetic_passport import preview as pv

    # The "result" has long hair falling over the cheek outline (edge zone) on the image-left side.
    result_seg = seg.copy()
    result_seg[300:620, 140:200] = cv.SEG_HAIR
    calls = {"n": 0}

    def segment(img):
        calls["n"] += 1
        return seg if calls["n"] == 1 else result_seg

    monkeypatch.setattr(pv.MODELS, "faces", lambda img: [face])
    monkeypatch.setattr(pv.MODELS, "segment", segment)
    return rgb, face, seg, result_seg


def test_v2_core_pixels_identical_and_edge_hair_kept(synthetic, tmp_path):
    from aesthetic_passport.preview import core_region, read_aigc, render_target

    rgb, face, seg, result_seg = synthetic
    res = render_target(Image.fromarray(rgb), PASSPORT, "hair", "safe", provider=FakeImageEditProvider(), out_dir=tmp_path)
    core = core_region(face, rgb.shape[:2], "hair", 6)
    assert core.sum() > 5_000
    assert np.array_equal(res.composite[core], rgb[core])            # identity: eyes, nose, mouth untouched
    edge_hair = (result_seg == cv.SEG_HAIR) & (seg != cv.SEG_HAIR) & ~core
    edge_hair[:, 200:] = False
    changed = np.abs(res.composite.astype(int) - rgb.astype(int)).mean(axis=2)
    assert changed[edge_hair].mean() > 3                              # soft protection: long hair over the cheek kept
    assert res.after_path.name == "preview_hair_safe.jpg" and res.before_path.exists()
    meta = read_aigc(res.after_path)
    assert meta["Label"] == "1" and meta["ProduceID"].endswith("hair:safe")


def test_v2_hard_protection_when_soft_disabled(synthetic, tmp_path, monkeypatch):
    from aesthetic_passport import preview as pv
    from aesthetic_passport.masks import protected_region

    rgb, face, _seg, _result_seg = synthetic
    cfg = copy.deepcopy(pv.load_qc_config())
    cfg["preview_masks"]["soft_protection"] = False
    monkeypatch.setattr(pv, "load_qc_config", lambda: cfg)
    res = pv.render_target(Image.fromarray(rgb), PASSPORT, "hair", "safe", provider=FakeImageEditProvider(), out_dir=tmp_path)
    prot = protected_region(face, rgb.shape[:2], "hair", cfg)
    assert np.array_equal(res.composite[prot], rgb[prot])


def test_v2_quality_gate_raises_low_change(synthetic, tmp_path):
    from aesthetic_passport.preview import LowChange, render_target
    from aesthetic_passport.providers.image.base import ImageEditResult

    class Identity:
        name, model = "id", "identity"

        def edit(self, image, prompt, *, negative_prompt=None):
            return ImageEditResult(image, "identity", 1, 0.0)

    rgb, *_ = synthetic
    with pytest.raises(LowChange):
        render_target(Image.fromarray(rgb), PASSPORT, "hair", "safe", provider=Identity(), out_dir=tmp_path)


def test_hair_composite_keeps_distant_background_and_ears(monkeypatch):
    from aesthetic_passport import preview as pv

    rgb, face, seg = _synthetic()
    edited = np.full_like(rgb, 220)
    cfg = copy.deepcopy(pv.load_qc_config())
    cfg["preview_masks"]["color_transfer"] = False
    monkeypatch.setattr(pv.MODELS, "segment", lambda img: seg)
    out, core, _ = pv.composite_edit(rgb, edited, face, seg, "hair", np.ones(seg.shape, bool), cfg)
    # These lie inside the old head-shaped edit band, far from actual hair.
    assert np.array_equal(out[420:460, 70:110], rgb[420:460, 70:110])
    assert np.array_equal(out[400:430, 470:500], rgb[400:430, 470:500])
    assert np.array_equal(out[core], rgb[core])


def test_short_cut_can_reveal_temples_previously_covered_by_hair(monkeypatch):
    from aesthetic_passport import preview as pv

    rgb, face, seg = _synthetic()
    seg[340:430, 155:195] = cv.SEG_HAIR
    result_seg = seg.copy()
    result_seg[340:430, 155:195] = cv.SEG_FACE_SKIN
    edited = np.full_like(rgb, 210)
    cfg = copy.deepcopy(pv.load_qc_config())
    cfg["preview_masks"]["color_transfer"] = False
    monkeypatch.setattr(pv.MODELS, "segment", lambda img: result_seg)
    out, core, _ = pv.composite_edit(rgb, edited, face, seg, "hair", np.ones(seg.shape, bool), cfg)
    assert np.abs(out[370:400, 170:180].astype(int) - 210).mean() < 1
    assert np.array_equal(out[core], rgb[core])


def test_fringe_can_cover_brows_while_eyes_nose_and_mouth_stay_original(monkeypatch):
    from aesthetic_passport import preview as pv

    rgb, face, seg = _synthetic()
    result_seg = seg.copy()
    result_seg[290:345, 200:280] = cv.SEG_HAIR
    edited = rgb.copy()
    edited[290:345, 200:280] = 30
    cfg = copy.deepcopy(pv.load_qc_config())
    cfg["preview_masks"]["color_transfer"] = False
    monkeypatch.setattr(pv.MODELS, "segment", lambda img: result_seg)
    out, core, _ = pv.composite_edit(rgb, edited, face, seg, "hair", np.ones(seg.shape, bool), cfg)
    assert np.abs(out[320:330, 230:250].astype(int) - 30).mean() < 1
    assert np.array_equal(out[core], rgb[core])
    assert core[360, 240] and core[440, 300] and core[520, 300]


def test_blend_eases_into_protected_face_instead_of_cutting_at_it():
    from aesthetic_passport.masks import feathered_alpha

    edit = np.ones((100, 100), bool)
    protected = np.zeros_like(edit)
    protected[40:60, 40:60] = True
    alpha = feathered_alpha(edit, protected, 10)
    assert alpha[50, 39] < 0.15
    assert alpha[50, 25] > 0.95
    assert not alpha[protected].any()


def test_hair_lighting_matches_stable_skin_without_replacing_hair_color(monkeypatch):
    from aesthetic_passport import preview as pv

    _, face, seg = _synthetic()
    original_lab = np.full((*seg.shape, 3), (155, 140, 142), np.uint8)
    original_lab[seg == cv.SEG_HAIR] = (70, 135, 145)
    original = cv2.cvtColor(original_lab, cv2.COLOR_LAB2RGB)
    # The model intentionally recolors the hair, but also adds a global lighting/color cast.
    target_lab = original_lab.copy()
    target_lab[seg == cv.SEG_HAIR] = (110, 145, 155)
    shifted_lab = target_lab.copy()
    shifted_lab[..., 0] += 16
    shifted_lab[..., 1] += 5
    edited = cv2.cvtColor(shifted_lab, cv2.COLOR_LAB2RGB)
    monkeypatch.setattr(pv.MODELS, "segment", lambda img: seg)
    out, core, _ = pv.composite_edit(original, edited, face, seg, "hair", np.ones(seg.shape, bool), pv.load_qc_config())
    result = cv2.cvtColor(out, cv2.COLOR_RGB2LAB)
    assert np.max(np.abs(result[100, 300].astype(int) - [110, 145, 155])) <= 3
    assert np.array_equal(out[core], original[core])


def test_hair_crop_includes_long_hair_outside_landmark_box():
    from aesthetic_passport.masks import head_crop_box

    _, face, _ = _synthetic()
    seg = np.full((1400, 1400), cv.SEG_BACKGROUND, np.uint8)
    seg[150:1300, 20:650] = cv.SEG_HAIR
    x0, y0, x1, y1 = head_crop_box(face, seg.shape, "hair", seg=seg)
    assert x0 <= 20 and y0 <= 150 and x1 >= 650 and y1 > 1300


def test_hair_segmentation_failure_does_not_paste_a_head_shaped_patch(monkeypatch):
    from aesthetic_passport import preview as pv

    rgb, face, seg = _synthetic()

    def unavailable(img):
        raise cv.CVUnavailable("segmenter unavailable")

    monkeypatch.setattr(pv.MODELS, "segment", unavailable)
    with pytest.raises(PreviewError):
        pv.composite_edit(rgb, np.full_like(rgb, 200), face, seg, "hair", np.ones(seg.shape, bool), pv.load_qc_config())


def test_preview_rejects_reframed_output_instead_of_stretching_face(synthetic, tmp_path):
    from aesthetic_passport.preview import MisalignedEdit, render_target
    from aesthetic_passport.providers.image.base import ImageEditResult

    class SquareOutput:
        def edit(self, image, prompt, *, negative_prompt=None):
            return ImageEditResult(Image.new("RGB", (1024, 1024)), "reframed", 1, 0.0)

    rgb, *_ = synthetic
    with pytest.raises(MisalignedEdit):
        render_target(Image.fromarray(rgb), PASSPORT, "hair", "safe", provider=SquareOutput(), out_dir=tmp_path)
    assert not list(tmp_path.glob("*.jpg"))


def test_v2_targets_respect_constraints():
    from aesthetic_passport.preview import preview_targets, target_spec

    t = preview_targets(PASSPORT)
    assert t["hair"][:3] == ["safe", "bold", "easy"] and "r1" in t["hair"]
    assert t["neckline"] == ["r3"]
    p = copy.deepcopy(PASSPORT)
    for c in p["derived"]["hair_option_checks"]:
        if c["tier"] == "bold":
            c["status"] = "excluded"
    with pytest.raises(PreviewError):
        target_spec(p, "hair", "bold")


def test_ai_label_is_drawn_bottom_left():
    from aesthetic_passport.preview import add_ai_label

    img = Image.new("RGB", (400, 500), (200, 200, 200))
    out = np.asarray(add_ai_label(img)).astype(int)
    assert np.abs(out[-40:, :120] - 200).sum() > 0 and np.abs(out[:100, -100:] - 200).sum() == 0


# --- API flow ---------------------------------------------------------------------------------------

@pytest.fixture
def api(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from aesthetic_passport.api.app import create_app
    from aesthetic_passport.api.settings import Settings

    monkeypatch.setenv("ANALYSIS_PROVIDER", "fake")
    monkeypatch.setenv("FAKE_ANALYSIS_DELAY_S", "0")
    monkeypatch.setenv("QC_MODE", "stub")
    monkeypatch.setenv("IMAGE_EDIT_PROVIDER", "fake")
    # These tests exercise the preview engine through the automatic first preview; pricing policy (D33: no free
    # preview) is tested in test_api.py.
    from aesthetic_passport.api import entitlement as entitlement_mod
    from aesthetic_passport.api import previews as previews_mod

    policy = {**previews_mod.pricing(), "free_previews": 1}
    monkeypatch.setattr(previews_mod, "pricing", lambda: policy)
    monkeypatch.setattr(entitlement_mod, "pricing", lambda: policy)
    settings = Settings(runs_dir=tmp_path / "runs", run_jobs_inline=True)
    with TestClient(create_app(settings)) as c:
        yield c


def _submit(api, face: Image.Image):
    buf = io.BytesIO()
    face.save(buf, format="JPEG")
    files = {"front": ("front.jpg", buf.getvalue(), "image/jpeg")}
    ctx = json.loads((ROOT / "examples" / "sample_context.json").read_text(encoding="utf-8"))
    r = api.post("/api/passport", files=files, data={"context": json.dumps(ctx), "consent": "true"})
    assert r.status_code == 202
    return r.json()["id"]


def test_api_free_preview_with_synthetic_face(api, synthetic):
    rgb, *_ = synthetic
    pid = _submit(api, Image.fromarray(rgb))
    body = api.get(f"/api/passport/{pid}").json()
    assert body["status"] == "full_ready"
    pv = body["partial"]["previews"][0]
    assert (pv["kind"], pv["target_id"], pv["status"]) == ("hair", "safe", "succeeded"), pv
    assert pv["ai_label"] == "AI 试看" and api.get(pv["after_url"]).status_code == 200
    entry = next(e for e in body["passport"]["previews"] if e["target_id"] == "safe")
    assert entry["status"] == "succeeded" and entry["after_ref"] == "preview_hair_safe.jpg"
    assert body["entitlement"]["free_previews_left"] == 0


def test_api_preview_failure_becomes_fallback(api, synthetic, monkeypatch):
    from aesthetic_passport.api import previews

    rgb, *_ = synthetic
    monkeypatch.setattr(previews, "image_from_config", lambda: FakeImageEditProvider(fail=True))
    pid = _submit(api, Image.fromarray(rgb))
    body = api.get(f"/api/passport/{pid}").json()
    assert body["status"] == "full_ready" and body["partial"]["previews"][0]["status"] == "fallback"
    calls = [json.loads(x) for x in (Path(api.app.state.settings.runs_dir) / pid / "calls.jsonl").read_text().splitlines()]
    assert sum(1 for c in calls if c["kind"] == "image_edit") == 2           # one retry, then fallback


def test_failed_free_preview_keeps_entitlement_and_can_be_retried(api, synthetic, monkeypatch):
    from aesthetic_passport.api import previews

    rgb, *_ = synthetic
    monkeypatch.setattr(previews, "image_from_config", lambda: FakeImageEditProvider(fail=True))
    pid = _submit(api, Image.fromarray(rgb))
    body = api.get(f"/api/passport/{pid}").json()
    failed = body["partial"]["previews"][0]
    assert failed["status"] == "fallback" and failed["after_url"] is None
    assert body["entitlement"]["free_previews_left"] == 1
    monkeypatch.setattr(previews, "image_from_config", lambda: FakeImageEditProvider())
    retry = api.post(f"/api/passport/{pid}/previews", json={"kind": "hair", "target_ids": ["safe"]})
    assert retry.status_code == 202, retry.json()
    body = api.get(f"/api/passport/{pid}").json()
    assert body["partial"]["previews"][0]["status"] == "succeeded"
    assert body["entitlement"]["free_previews_left"] == 0


def test_failed_paid_preview_releases_cap_for_retry(api, synthetic, monkeypatch):
    from aesthetic_passport.api import previews

    rgb, *_ = synthetic
    pid = _submit(api, Image.fromarray(rgb))
    api.post("/api/checkout", json={"passport_id": pid})
    api.app.state.settings.preview_cap = 1
    monkeypatch.setattr(previews, "image_from_config", lambda: FakeImageEditProvider(fail=True))
    payload = {"kind": "hair", "target_ids": ["bold"]}
    assert api.post(f"/api/passport/{pid}/previews", json=payload).status_code == 202
    monkeypatch.setattr(previews, "image_from_config", lambda: FakeImageEditProvider())
    retry = api.post(f"/api/passport/{pid}/previews", json=payload)
    assert retry.status_code == 202, retry.json()
    assert next(p for p in api.get(f"/api/passport/{pid}").json()["partial"]["previews"]
                if p["target_id"] == "bold")["status"] == "succeeded"
    # Success still spends the cap; the fix must not make successful generations unlimited.
    assert api.post(f"/api/passport/{pid}/previews",
                    json={"kind": "hair", "target_ids": ["easy"]}).status_code == 429


def test_preview_trace_reaches_served_image_without_photo_data(api, synthetic, monkeypatch):
    from aesthetic_passport.api import previews

    def handler(req):
        if req.method == "POST":
            body = json.loads(req.content)
            uri = body["input"]["messages"][0]["content"][0]["image"]
            import base64

            original = Image.open(io.BytesIO(base64.b64decode(uri.split(",", 1)[1])))
            edited = FakeImageEditProvider().edit(original, "synthetic test").image
            image_bytes = io.BytesIO()
            edited.save(image_bytes, format="PNG")
            handler.image = image_bytes.getvalue()
            return httpx.Response(200, json={"output": {"choices": [{"message": {"content": [
                {"image": "https://result.example/edited.png?Signature=private"}]}}]}})
        assert req.headers.get("authorization") is None
        return httpx.Response(200, content=handler.image)

    monkeypatch.setattr(previews, "image_from_config", lambda: _qwen(handler))
    rgb, *_ = synthetic
    pid = _submit(api, Image.fromarray(rgb))
    calls = [json.loads(x) for x in (api.app.state.settings.runs_dir / pid / "calls.jsonl").read_text().splitlines()]
    edit = next(c for c in calls if c["kind"] == "image_edit")
    trace = edit["trace"]
    assert [s["stage"] for s in trace] == ["input_ready", "provider_request", "provider_completed",
                                         "registration_completed", "composite_completed", "quality_passed", "preview_saved"]
    times = [s["elapsed_ms"] for s in trace]
    assert times == sorted(times) and edit["latency_ms"] >= times[-1]
    assert edit["provider_latency_ms"] >= 0 and edit["cost_usd_est"] == 0.03
    assert "prompt" not in edit and "change" not in edit
    assert "Signature" not in json.dumps(edit)
    preview = api.get(f"/api/passport/{pid}").json()["partial"]["previews"][0]
    assert api.get(preview["after_url"]).status_code == 200


@pytest.mark.parametrize("recover", [True, False], ids=["recovers", "rejects_both"])
def test_reframed_qwen_output_gets_one_quality_retry(api, synthetic, monkeypatch, recover):
    from aesthetic_passport.api import previews

    seeds, images = [], []

    def handler(req):
        if req.method == "POST":
            import base64

            body = json.loads(req.content)
            seeds.append(body["parameters"]["seed"])
            uri = body["input"]["messages"][0]["content"][0]["image"]
            original = Image.open(io.BytesIO(base64.b64decode(uri.split(",", 1)[1])))
            # A square, reframed response must never be stretched onto this portrait.
            edited = (FakeImageEditProvider().edit(original, "synthetic test").image
                      if recover and len(seeds) == 2 else Image.new("RGB", (1024, 1024)))
            buf = io.BytesIO()
            edited.save(buf, format="PNG")
            images.append(buf.getvalue())
            return httpx.Response(200, json={"output": {"choices": [{"finish_reason": "stop", "message": {
                "role": "assistant", "content": [{"image": "https://result.example/edit.png?Signature=private"}]}}]},
                "usage": {"image_count": 1}})
        assert req.headers.get("authorization") is None
        return httpx.Response(200, content=images[-1])

    monkeypatch.setattr(previews, "image_from_config", lambda: _qwen(handler))
    rgb, *_ = synthetic
    pid = _submit(api, Image.fromarray(rgb))
    body = api.get(f"/api/passport/{pid}").json()
    preview = body["partial"]["previews"][0]
    assert seeds == [7, 8]        # the existing bounded retry uses a different seed
    assert preview["status"] == ("succeeded" if recover else "fallback")
    assert body["entitlement"]["free_previews_left"] == (0 if recover else 1)
    calls = [json.loads(x) for x in (api.app.state.settings.runs_dir / pid / "calls.jsonl").read_text().splitlines()]
    edits = [c for c in calls if c["kind"] == "image_edit"]
    assert len(edits) == 2 and all(c["cost_usd_est"] == 0.03 for c in edits)
    assert edits[0]["error"] == "MisalignedEdit" and edits[0]["ok"] is False
    assert edits[0]["trace"][-1]["stage"] == "provider_completed"
    assert "Signature" not in json.dumps(edits)
    if recover:
        assert edits[1]["ok"] is True
        assert api.get(preview["after_url"]).status_code == 200
        assert api.get(preview["before_url"]).status_code == 200
    else:
        assert edits[1]["error"] == "MisalignedEdit" and edits[1]["ok"] is False
        assert preview["error"] and preview["after_url"] is None and preview["before_url"] is None
        assert not list((api.app.state.settings.runs_dir / pid).rglob("preview_*.jpg"))


@pytest.mark.parametrize("category", ["MisalignedEdit", "RuntimeError"])
def test_rejected_generation_keeps_cost_and_safe_failure_category(api, synthetic, monkeypatch, caplog, category):
    from aesthetic_passport import preview as pv

    rgb, *_ = synthetic

    def reject(*args, **kwargs):
        error = pv.MisalignedEdit if category == "MisalignedEdit" else RuntimeError
        raise error("private landmark drift 0.123")

    monkeypatch.setattr(pv, "verify_composite", reject)
    pid = _submit(api, Image.fromarray(rgb))
    calls = [json.loads(x) for x in (api.app.state.settings.runs_dir / pid / "calls.jsonl").read_text().splitlines()]
    edits = [c for c in calls if c["kind"] == "image_edit"]
    assert len(edits) == 2 and all(c["cost_usd_est"] == 0 for c in edits)
    assert all(c["model"] == "fake-image-edit" and c["error"] == category for c in edits)
    assert "private landmark" not in json.dumps(edits)
    assert "private landmark" not in caplog.text
    assert api.get(f"/api/passport/{pid}").json()["partial"]["previews"][0]["after_url"] is None


def test_provider_diagnostics_drop_echoed_prompts_and_untrusted_fields():
    private = "private short face description"

    def handler(req):
        return httpx.Response(400, json={"code": private, "request_id": private, "message": private})

    with pytest.raises(ImageEditError) as exc:
        _qwen(handler).edit(Image.new("RGB", (400, 400)), private)
    diagnostic = exc.value.diagnostics()
    assert private not in json.dumps(diagnostic)
    assert diagnostic["code"] == "unknown_provider_code" and diagnostic["request_id"] is None


def test_api_model_not_exist_is_not_retried(api, synthetic, monkeypatch):
    """The real Qwen adapter against a 404 "Model not exist": exactly one request, then the text fallback."""
    from aesthetic_passport.api import previews

    rgb, *_ = synthetic
    hits: list[str] = []

    def handler(req: httpx.Request):
        hits.append(str(req.url))
        return httpx.Response(404, json={"code": "InvalidParameter", "message": "Model not exist.",
                                         "request_id": "r1"})

    provider = QwenImageEditProvider("qwen-image-edit-plus", base_url=CONFIGURED,
                                     client=httpx.Client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(previews, "image_from_config", lambda: provider)
    pid = _submit(api, Image.fromarray(rgb))
    body = api.get(f"/api/passport/{pid}").json()
    pv = body["partial"]["previews"][0]
    assert body["status"] == "full_ready" and pv["status"] == "fallback"
    assert len(hits) == 1                                                       # no duplicate request
    calls = [json.loads(x) for x in (Path(api.app.state.settings.runs_dir) / pid / "calls.jsonl").read_text().splitlines()]
    edits = [c for c in calls if c["kind"] == "image_edit"]
    assert len(edits) == 1 and edits[0]["ok"] is False
    diag = edits[0]["diag"]
    assert (diag["stage"], diag["http_status"], diag["code"], diag["retryable"]) == ("response", 404, "InvalidParameter", False)
    assert "message" not in diag                 # provider prose may echo the private prompt
    assert pv["error"] == "试看服务暂不可用，先看款式插画"


def test_api_previews_disabled_are_skipped(api, monkeypatch):
    monkeypatch.setenv("IMAGE_EDIT_PROVIDER", "none")
    pid = _submit(api, Image.new("RGB", (400, 500), (180, 160, 140)))
    body = api.get(f"/api/passport/{pid}").json()
    assert body["partial"]["previews"][0]["status"] == "skipped"
    assert body["passport"]["previews"][0]["status"] == "skipped"


# --- image-edit diagnostics (Render logs) -----------------------------------------------------------

def test_qwen_key_only_on_dashscope_call_not_on_result_download():
    """The result URL is a pre-signed OSS URL: an Authorization header there is rejected (and leaks the key)."""
    seen = {}

    def handler(req: httpx.Request):
        seen[req.method] = req.headers.get("authorization")
        if req.method == "POST":
            return httpx.Response(200, json={"output": {"choices": [{"message": {"content": [
                {"image": "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/x.png?Signature=s"}]}}]},
                "request_id": "rid-1"})
        return httpx.Response(200, content=_png())

    client = httpx.Client(transport=httpx.MockTransport(handler))
    QwenImageEditProvider("qwen-image-edit-plus", base_url="https://dashscope.aliyuncs.com/api/v1",
                          api_key="sk-test", client=client).edit(Image.new("RGB", (400, 400)), "P")
    assert seen == {"POST": "Bearer sk-test", "GET": None}


@pytest.mark.parametrize("handler, expect", [
    (lambda r: httpx.Response(400, json={"code": "InvalidParameter", "request_id": "a1b2c3d4-1234-4321-9876-abcdef123456",
                                         "message": "bad image data:image/jpeg;base64,AAAA"}),
     {"stage": "response", "http_status": 400, "code": "InvalidParameter",
      "request_id": "a1b2c3d4-1234-4321-9876-abcdef123456",
      "category": "api_error"}),
    (lambda r: httpx.Response(502, text="<html>gateway</html>", headers={"x-request-id": "gw-1"}),
     {"stage": "response", "http_status": 502, "request_id": None, "category": "invalid_json"}),
    (lambda r: (_ for _ in ()).throw(httpx.ConnectTimeout("t", request=r)),
     {"stage": "request", "category": "ConnectTimeout"}),
    (lambda r: httpx.Response(200, json={"output": {"choices": [{"message": {"content": [{"image": "https://o/x"}]}}]},
                                         "request_id": "rid-3"}) if r.method == "POST"
     else httpx.Response(403, text="<Error>AccessDenied</Error>"),
     {"stage": "download", "http_status": 403, "request_id": None, "category": "download_http_error"}),
])
def test_qwen_failure_diagnostics(handler, expect):
    with pytest.raises(ImageEditError) as ei:
        _qwen(handler).edit(Image.new("RGB", (400, 400)), "SECRET PROMPT")
    d = ei.value.diagnostics()
    assert {k: d[k] for k in expect} == expect and isinstance(d["elapsed_ms"], int)
    assert "base64" not in json.dumps(d) and "SECRET PROMPT" not in json.dumps(d)


def test_preview_job_logs_edit_failure_to_stdout_with_cause(tmp_path, monkeypatch, caplog):
    import logging

    from aesthetic_passport.api import previews as pj
    from aesthetic_passport.preview import PreviewError

    def boom(*a, **k):
        try:
            raise ImageEditError("image edit refused: Throttling", stage="response", http_status=429,
                                 code="Throttling", request_id="rid-9", elapsed_ms=12, category="api_error")
        except ImageEditError as e:
            raise PreviewError("图像模型这次没有返回可用的结果") from e

    class FakeStore:
        def __init__(self):
            self.rows = []

        def get(self, pid):
            return {"passport": {"id": pid}, "status": "done", "media_deleted": False, "media_expires_at": None}

        def upsert_preview(self, *a, **k):
            self.rows.append((a, k))

    settings = type("S", (), {"runs_dir": tmp_path, "preview_debug": False})()
    (tmp_path / "p1" / "media").mkdir(parents=True)
    monkeypatch.setattr(pj, "media_dir", lambda runs, pid: runs / pid / "media")
    (tmp_path / "p1" / "media" / "front.jpg").write_bytes(b"x")
    monkeypatch.setattr(pj, "media_expired", lambda job: False)
    monkeypatch.setattr(pj, "image_from_config", lambda: object())
    monkeypatch.setattr(pj, "render_target", boom)
    with caplog.at_level(logging.WARNING, logger="aesthetic_passport.previews"):
        assert pj.run_preview_job(settings, FakeStore(), "p1", "hair", "safe") == "fallback"
    line = next(r.getMessage() for r in caplog.records if "image_edit_failed" in r.getMessage())
    for part in ("passport=p1", "target=hair:safe", "stage=response", "http_status=429", "code=Throttling",
                 "request_id=rid-9", "elapsed_ms=12", "category=api_error"):
        assert part in line
    rec = json.loads((tmp_path / "p1" / "calls.jsonl").read_text().splitlines()[0])
    assert rec["diag"]["code"] == "Throttling" and rec["error"] == "PreviewError"


# --- V2.1 Look Studio targets (D30) -----------------------------------------------------------------------------

def test_hair_color_combo_targets_build_one_edit_from_the_original():
    from aesthetic_passport.preview import PreviewError, is_previewable, target_spec

    p = json.loads(json.dumps(PASSPORT))
    colors = p["analysis"]["color_profile"]["hair_color_directions"]
    spec = target_spec(p, "hair", "bold_hc1")
    assert spec["region"] == "hair" and colors[1]["hex"] in spec["target_description"]
    assert spec["target_description"].startswith(target_spec(p, "hair", "bold")["target_description"].rstrip(". "))
    keep = target_spec(p, "hair", "current_hc2")
    assert "keep the current length" in keep["target_description"] and colors[2]["hex"] in keep["target_description"]
    assert not is_previewable(p, "hair", "current")          # keeping everything is not an edit
    assert not is_previewable(p, "hair", "bold_hc9")         # no such colour
    with pytest.raises(PreviewError):
        target_spec(p, "glasses", "bold_hc1")


def test_api_combo_preview_has_crop_box_and_media(api, synthetic):
    rgb, *_ = synthetic
    pid = _submit(api, Image.fromarray(rgb))
    assert api.post(f"/api/passport/{pid}/previews", json={"kind": "hair", "target_ids": ["bold_hc1"]}).status_code == 402
    assert api.post("/api/checkout", json={"passport_id": pid}).json()["payment"]["status"] == "paid"
    r = api.post(f"/api/passport/{pid}/previews", json={"kind": "hair", "target_ids": ["safe_hc1", "current_hc2"]})
    assert r.status_code == 202, r.json()
    body = api.get(f"/api/passport/{pid}").json()
    got = {p["target_id"]: p for p in body["partial"]["previews"]}
    for t in ("safe_hc1", "current_hc2"):
        pv = got[t]
        assert pv["status"] == "succeeded", pv
        x0, y0, x1, y1 = pv["crop_box"]
        assert 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1
        assert api.get(pv["after_url"]).status_code == 200
    bad = api.post(f"/api/passport/{pid}/previews", json={"kind": "hair", "target_ids": ["current"]})
    assert bad.status_code == 422
