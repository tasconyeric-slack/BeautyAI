"""Local hair masks must never use the broad generative edit support."""
import numpy as np

pytest_plugins = ["test_api"]

from aesthetic_passport.api.hair_masks import hair_alpha
from aesthetic_passport.cv import SEG_FACE_SKIN, SEG_HAIR


def test_hair_alpha_has_soft_inward_edges_and_never_paints_skin():
    rgb = np.full((50, 60, 3), 100, np.uint8)
    seg = np.full((50, 60), SEG_FACE_SKIN, np.uint8)
    seg[5:40, 10:50] = SEG_HAIR
    alpha = hair_alpha(rgb, seg, [])
    assert alpha[20, 30] == 255
    assert 0 < alpha[5, 20] < 255
    assert not alpha[seg != SEG_HAIR].any()


def test_mask_route_caches_exact_composite_and_expires(client, monkeypatch):
    import io
    from datetime import timedelta
    from types import SimpleNamespace

    from PIL import Image
    from test_api import ready

    from aesthetic_passport.api.retention import purge_expired_media
    from aesthetic_passport.api.store import now
    from aesthetic_passport.cv import MODELS

    pid = ready(client)
    directory = client.settings.runs_dir / pid / 'media'
    seen = []
    face = SimpleNamespace(pts=lambda _: np.array([[1, 1], [2, 1], [1, 2]], np.float32))
    monkeypatch.setattr(MODELS, 'faces', lambda _: [face])

    def segment(rgb):
        seen.append(rgb.copy())
        seg = np.zeros(rgb.shape[:2], np.uint8)
        # Stand-in segmentation follows the dark pixels, including a changed silhouette.
        seg[np.mean(rgb, axis=2) < 70] = SEG_HAIR
        return seg

    monkeypatch.setattr(MODELS, 'segment', segment)
    original = np.full((500, 400, 3), 180, np.uint8)
    original[20:100, 120:280] = 30
    Image.fromarray(original).save(directory / 'front.jpg')
    url = f'/api/passport/{pid}/hair-mask'
    first = client.get(url)
    assert first.status_code == 200
    assert first.headers['cache-control'] == 'no-store'
    mask = np.asarray(Image.open(io.BytesIO(first.content)))
    assert mask[50, 150] > 200 and mask[150, 80] == 0
    assert client.get(url).content == first.content
    assert len(seen) == 1
    # A generated crop replaces the old hair, reveals the old crown, and adds new side hair.
    crop = np.full((200, 240, 3), 180, np.uint8)
    crop[100:180, 10:60] = 30
    name = 'preview_hair_bold.jpg'
    Image.fromarray(crop).save(directory / name)
    (directory / 'preview_hair_bold.json').write_text('{"crop_box": [0.2, 0, 0.8, 0.4]}')
    client.app.state.store.upsert_preview(pid, 'hair', 'bold', 'succeeded', after_name=name)
    result = client.get(url + '?target=bold')
    assert result.status_code == 200
    changed = np.asarray(Image.open(io.BytesIO(result.content)))
    assert changed[150, 100] > 200 and changed[50, 150] == 0
    assert len(seen) == 2
    assert client.get(url + '?target=easy').status_code == 404
    assert client.get(url + '?target=../../front').status_code == 422
    # Regeneration at the same URL must invalidate server mask cache.
    crop[100:180, 10:60] = 180
    crop[100:180, 160:220] = 30
    Image.fromarray(crop).save(directory / name)
    regenerated = client.get(url + '?target=bold')
    assert regenerated.content != result.content and len(seen) == 3
    store = client.app.state.store
    store._exec('UPDATE passports SET media_expires_at=? WHERE id=?', ((now() - timedelta(seconds=1)).isoformat(), pid))
    assert client.get(url).status_code == 410  # strict TTL even before purge
    assert purge_expired_media(store, client.settings.runs_dir) == [pid]
    assert not directory.exists()
    assert store.previews(pid)[0]['attempts'] == 0  # mask requests never start generation


def test_mask_route_fails_closed_without_segmentation(client, monkeypatch):
    from test_api import ready

    from aesthetic_passport.cv import MODELS

    pid = ready(client)
    monkeypatch.setattr(MODELS, 'faces', lambda _: [])
    assert client.get(f'/api/passport/{pid}/hair-mask').status_code == 422
    assert client.get('/api/passport/ap_000000000000/hair-mask').status_code == 404
    client.delete(f'/api/passport/{pid}')
    assert client.get(f'/api/passport/{pid}/hair-mask').status_code == 410


def test_mask_protects_facial_features_even_if_segmenter_calls_them_hair():
    from types import SimpleNamespace

    rgb = np.full((40, 40, 3), 80, np.uint8)
    seg = np.full((40, 40), SEG_HAIR, np.uint8)
    face = SimpleNamespace(pts=lambda _: np.array([[10, 10], [30, 10], [30, 30], [10, 30]], np.float32))
    alpha = hair_alpha(rgb, seg, [face])
    assert not alpha[10:31, 10:31].any()
    assert alpha[4, 4] == 255
