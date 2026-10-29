"""Independent HTTP batches must share the memory-heavy preview budget."""
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from aesthetic_passport.api import previews as pj
from aesthetic_passport.api.settings import Settings
from aesthetic_passport.api.store import Store
from aesthetic_passport.preview import LowChange


@pytest.mark.parametrize("expire_queued", [False, True])
def test_independent_batches_share_preview_limit(tmp_path, monkeypatch, expire_queued):
    settings = Settings(runs_dir=tmp_path)
    store = Store(settings.db_path)
    for pid in ("first", "second"):
        store.create(pid, None, 24)
        store.finish(pid, {"passport_id": pid, "previews": []})
        media = tmp_path / pid / "media"
        media.mkdir(parents=True)
        (media / "front.jpg").touch()
        store.upsert_preview(pid, "hair", "safe", "pending", paid=True)
    entered, overlap, release = threading.Event(), threading.Event(), threading.Event()

    def render(front: Path, *args, **kwargs):
        if front.parent.parent.name == "first":
            entered.set()
            assert release.wait(5)
        else:
            overlap.set()
        raise LowChange()

    config = pj.load_qc_config()
    monkeypatch.setattr(pj, "load_qc_config", lambda: {**config, "preview_masks": {
        **config["preview_masks"], "concurrency": 1, "max_attempts": 1}})
    monkeypatch.setattr(pj, "image_from_config", lambda: object())
    monkeypatch.setattr(pj, "render_target", render)
    with ThreadPoolExecutor(2) as pool:
        first = pool.submit(pj.run_preview_batch, settings, store, "first", [("hair", "safe")])
        assert entered.wait(5)
        second = pool.submit(pj.run_preview_batch, settings, store, "second", [("hair", "safe")])
        try:
            assert not overlap.wait(0.25), "separate batches ran memory-heavy renders together"
            if expire_queued:
                store.mark_media_deleted("second")
        finally:
            release.set()
            first.result(timeout=5)
            second.result(timeout=5)
    assert overlap.is_set() is not expire_queued, store.previews("second")
    assert store.previews("first")[0]["status"] == "fallback"
    assert store.previews("second")[0]["status"] == ("failed" if expire_queued else "fallback")
