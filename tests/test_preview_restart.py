"""A process restart must not strand a paid preview as permanently pending.

No personal images, credentials, external providers, or network are required.
"""
from aesthetic_passport.api.store import Store


def test_concurrent_report_reads_never_appear_missing(tmp_path):
    from concurrent.futures import ThreadPoolExecutor

    store = Store(tmp_path / "app.db")
    for n in range(8):
        store.create(str(n), None, 24)

    def read(n):
        for _ in range(1000):
            row = store.get(str(n))
            assert row is not None and row["id"] == str(n)

    with ThreadPoolExecutor(8) as pool:
        list(pool.map(read, range(8)))


def test_api_restart_preserves_report_entitlement_and_expiry(tmp_path):
    import json
    from pathlib import Path

    from fastapi.testclient import TestClient

    from aesthetic_passport.api.app import create_app
    from aesthetic_passport.api.settings import Settings

    settings = Settings(runs_dir=tmp_path)
    original = create_app(settings)
    store = original.state.store
    pid = "ap_0123456789ab"
    passport = json.loads((Path(__file__).resolve().parents[1] / "examples/sample_passport.json").read_text("utf-8"))
    passport["passport_id"] = pid
    store.create(pid, None, 24)
    store.finish(pid, passport)
    store.set_paid(pid)
    expiry = store.get(pid)["media_expires_at"]
    store.upsert_preview(pid, "hair", "safe", "pending", paid=True)
    restarted = create_app(settings)
    with TestClient(restarted) as client:
        body = client.get(f"/api/passport/{pid}").json()
        assert body["status"] == "full_ready"
        assert body["entitlement"]["paid"] is True
        assert body["partial"]["previews"][0]["status"] == "fallback"
        assert "重启" in body["partial"]["previews"][0]["error"]
        assert body["passport"]["previews"][0]["status"] == "fallback"
        assert restarted.state.store.get(pid)["media_expires_at"] == expiry


def test_restart_marks_only_pending_previews_retryable(tmp_path):
    store = Store(tmp_path / "app.db")
    pid = "ap_0123456789ab"
    store.create(pid, None, media_ttl_hours=24, json_ttl_days=7)
    store.upsert_preview(pid, "hair", "bold", "pending", paid=True, attempts=1)
    store.upsert_preview(pid, "hair", "safe", "succeeded", paid=False,
                         after_name="preview_hair_safe.jpg", attempts=1)

    assert store.recover_pending_previews() == [pid]
    entries = {p["target_id"]: p for p in store.previews(pid)}
    assert entries["bold"]["status"] == "fallback"
    assert entries["bold"]["paid"] == 1
    assert "服务重启" in entries["bold"]["error"]
    assert entries["safe"]["status"] == "succeeded"
    assert entries["safe"]["after_name"] == "preview_hair_safe.jpg"
    assert store.recover_pending_previews() == []

    # A retry can reserve the same target; the paid passport is not revoked.
    store.upsert_preview(pid, "hair", "bold", "pending", paid=True, attempts=0)
    again = {p["target_id"]: p for p in store.previews(pid)}
    assert again["bold"]["status"] == "pending"
    assert again["bold"]["paid"] == 1
