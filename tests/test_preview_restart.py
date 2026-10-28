"""A process restart must not strand a paid preview as permanently pending.

No personal images, credentials, external providers, or network are required.
"""
from aesthetic_passport.api.store import Store


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
