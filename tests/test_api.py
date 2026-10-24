"""API v0.3 tests: fake analysis provider, stub QC, jobs run inline. No keys, no network.

Each endpoint has at least one success and one failure case; every passport response validates against
schema/api.schema.json (and, when paid, the passport against passport.schema.json)."""
import io
import json
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from aesthetic_passport.api.app import create_app
from aesthetic_passport.api.retention import purge_expired_media, purge_expired_passports
from aesthetic_passport.api.settings import Settings
from aesthetic_passport.api.store import now
from aesthetic_passport.schema_io import validate_api_response, validate_passport

EX = Path(__file__).resolve().parents[1] / "examples"
CTX = json.loads((EX / "sample_context.json").read_text(encoding="utf-8"))["user_context"]


def jpeg(color=(180, 150, 130), size=(400, 500)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ANALYSIS_PROVIDER", "fake")
    monkeypatch.setenv("FAKE_ANALYSIS_DELAY_S", "0")
    monkeypatch.setenv("QC_MODE", "stub")
    monkeypatch.setenv("IMAGE_EDIT_PROVIDER", "fake")
    monkeypatch.setenv("PAYMENT_PROVIDER", "fake")
    settings = Settings(runs_dir=tmp_path / "runs", run_jobs_inline=True, ip_passports_per_hour=5,
                        invite_unlock_codes={"FRIEND39"})
    with TestClient(create_app(settings)) as c:
        c.settings = settings
        yield c


def submit(client, *, photos=("front",), context=None, consent="true", **extra):
    files = {role: (f"{role}.jpg", jpeg(), "image/jpeg") for role in photos}
    data = {"context": json.dumps(context or {"user_context": CTX}), "consent": consent, **extra}
    return client.post("/api/passport", files=files, data=data)


def ready(client, **kw) -> str:
    r = submit(client, **kw)
    assert r.status_code == 202, r.text
    return r.json()["id"]


def get(client, pid):
    body = client.get(f"/api/passport/{pid}").json()
    assert validate_api_response(body) == [], validate_api_response(body)[:3]
    return body


# --- create / get ---------------------------------------------------------------------------------------

def test_health_reports_fake_providers(client):
    h = client.get("/api/health").json()
    assert h["analysis_provider"] == "fake" and h["qc_mode"] == "stub" and h["payment_provider"] == "fake"
    assert h["price_cny"] == 39


def test_front_only_flow_partials_and_retention(client):
    pid = ready(client)
    body = get(client, pid)
    assert body["status"] == "full_ready", body["error"]
    assert body["partial"]["anchors"] is None and body["partial"]["input_quality"]["passed"]   # stub QC: no anchors
    assert body["partial"]["quick"]["summary_zh"] and body["partial"]["analysis"] == "ready"
    assert body["passport"]["meta"]["analysis_model"] == "fake-fixture"
    run_dir = client.settings.runs_dir / pid
    assert not (run_dir / "uploads").exists()
    assert {"front.jpg", "thumb.jpg"} <= {p.name for p in (run_dir / "media").iterdir()}
    assert client.get(body["media"]["thumb"]).status_code == 200
    kinds = [json.loads(line).get("kind") for line in (run_dir / "calls.jsonl").read_text().splitlines()]
    assert kinds[:2] == ["quick", "analysis"]
    # D33: photorealistic previews are paid only — nothing is generated automatically for a free passport.
    assert body["partial"]["previews"] == [] and body["entitlement"]["free_previews_left"] == 0


def test_free_view_trims_paid_content_server_side(client):
    body = get(client, ready(client))
    p, ent = body["passport"], body["entitlement"]
    assert ent["paid"] is False and ent["unlock_scope"] == "free"
    assert sorted(o["tier"] for o in p["analysis"]["hair_options"]) == ["bold", "easy", "safe"]   # D33: text is free
    assert len(p["analysis"]["outfit_direction"]["formulas"]) == 2 and p["analysis"]["outfit_direction"]["occasions"] == []
    assert len(p["analysis"]["color_profile"]["lip_families"]) == 2
    assert p["derived"]["glasses_size"] is None and not any(p["derived"]["plan"].values())
    assert {"plan", "glasses_size"} <= set(ent["locked"]) and not any(x.startswith("hair_options.") for x in ent["locked"])
    raw = json.dumps(body, ensure_ascii=False)
    assert "occasions" in raw and "法式慵懒卷" in raw                # all three hair directions reach a free client as text
    # D36: the score is free and never trimmed (QC stub here → an explicit unavailable score, never a number)
    assert p["aesthetic_score"]["status"] == "unavailable" and p["aesthetic_score"]["overall_score"] is None
    assert not any("score" in x for x in ent["locked"])


def test_missing_front_rejected(client):
    r = submit(client, photos=("profile45",))
    assert r.status_code == 422 and r.json()["error"]["code"] == "missing_photos"


def test_presentation_only_context_is_enough(client):
    pid = ready(client, context={"user_context": {"presentation": "masculine", "topic": "hair", "ref": "xhs_01"}})
    p = get(client, pid)["passport"]
    assert p["user_context"]["topic"] == "hair" and p["user_context"]["ref"] == "xhs_01"
    assert p["analysis"]["makeup_direction"]["mode"] == "grooming"
    ev = client.app.state.store.events()
    assert ev[0]["name"] == "upload_start" and ev[0]["topic"] == "hair" and ev[0]["ref"] == "xhs_01"


def test_consent_required(client):
    assert submit(client, consent="false").json()["error"]["code"] == "consent_required"


def test_bad_context_rejected(client):
    r = submit(client, context={"user_context": dict(CTX, presentation="unknown")})
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_context"
    r = submit(client, context={"user_context": {"topic": "hair"}})
    assert r.status_code == 422


def test_unreadable_image_rejected(client):
    files = {"front": ("front.jpg", b"not an image", "image/jpeg")}
    r = client.post("/api/passport", files=files, data={"context": json.dumps(CTX), "consent": "true"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "unreadable_image"


def test_upload_size_cap(client):
    client.settings.max_upload_mb = 0
    assert submit(client).status_code == 413


def test_invite_code(client):
    client.settings.invite_codes = {"letmein"}
    assert submit(client).status_code == 403
    assert submit(client, invite_code="letmein").status_code == 202


def test_per_ip_rate_limit(client):
    for _ in range(5):
        assert submit(client).status_code == 202
    r = submit(client)
    assert r.status_code == 429 and r.json()["error"]["code"] == "rate_limited"


def test_unknown_and_malformed_ids(client):
    assert client.get("/api/passport/ap_000000000000").status_code == 404
    assert client.get("/api/passport/../../etc").status_code == 404


def test_media_names_are_whitelisted(client):
    pid = ready(client)
    assert client.get(f"/api/media/{pid}/app.db").status_code == 404
    assert client.get(f"/api/media/{pid}/geometry.json").status_code == 404


# --- feedback / rerank / enrich --------------------------------------------------------------------------------

def test_feedback_is_idempotent_and_rerank_keeps_analysis(client):
    pid = ready(client)
    store = client.app.state.store
    before = store.get(pid)["passport"]
    ev = {"target_type": "recommendation", "target_id": "r1", "reaction": "dislike", "reason_tags": ["超出预算"],
          "client_event_id": "e-1"}
    r1 = client.post(f"/api/passport/{pid}/feedback", json=ev).json()
    r2 = client.post(f"/api/passport/{pid}/feedback", json=ev).json()
    assert r1["duplicate"] is False and r2["duplicate"] is True and r2["event_count"] == 1
    body = client.post(f"/api/passport/{pid}/rerank", json={}).json()
    assert validate_api_response(body) == []
    after = store.get(pid)["passport"]
    assert json.dumps(after["analysis"], sort_keys=True) == json.dumps(before["analysis"], sort_keys=True)
    assert after["derived"]["derived_version"] == 2
    assert after["aesthetic_score"] == before["aesthetic_score"]          # a rules rerank never touches the score
    assert {"rec_id": "r1", "reason": "user_hidden"} in after["derived"]["excluded_recommendations"]
    assert body["passport"]["derived"]["feedback_applied"]["note_zh"]
    assert validate_passport(after) == []


def test_feedback_validation(client):
    pid = ready(client)
    bad = {"target_type": "nope", "target_id": "r1", "reaction": "like"}
    assert client.post(f"/api/passport/{pid}/feedback", json=bad).status_code == 422
    bad = {"target_type": "style", "target_id": "../x", "reaction": "like"}
    assert client.post(f"/api/passport/{pid}/feedback", json=bad).status_code == 422


def test_feedback_with_inline_rerank_and_style_target(client):
    pid = ready(client)
    ev = {"target_type": "style", "target_id": "dramatic", "reaction": "target"}
    body = client.post(f"/api/passport/{pid}/feedback?rerank=1", json=ev).json()
    sp = body["passport"]["derived"]["style_profile"]
    assert sp["preference_overlay"]["target"] == "dramatic" and sp["face_only"] == {"x": 2.9, "y": 0.7}


def test_rerank_with_context_patch_and_failure(client):
    pid = ready(client)
    body = client.post(f"/api/passport/{pid}/rerank", json={"user_context": {"constraints": {"accepts_perm": False}}}).json()
    checks = {c["tier"]: c["status"] for c in body["passport"]["derived"]["hair_option_checks"]}
    assert checks["bold"] == "excluded"
    assert "已按新的条件重新排序" in body["passport"]["derived"]["feedback_applied"]["note_zh"]
    r = client.post(f"/api/passport/{pid}/rerank", json={"user_context": {"budget": "x", "hair": {"texture": "zigzag"}}})
    assert r.status_code == 422
    r = client.post(f"/api/passport/{pid}/rerank", json={"user_context": {"presentation": "masculine"}})
    assert r.status_code == 409 and r.json()["error"]["code"] == "needs_reanalysis"


def test_enrich_context_only_reranks_and_photo_reanalyzes(client):
    pid = ready(client)
    r = client.post(f"/api/passport/{pid}/enrich",
                    data={"context": json.dumps({"body": {"frame": "straight", "height_cm": 168}, "target_style": "classic"})})
    body = r.json()
    assert r.status_code == 200 and body["mode"] == "rerank"
    sp = body["passport"]["derived"]["style_profile"]
    assert sp["overall"] != sp["face_only"] and sp["preference_overlay"]["target"] == "classic"
    r = client.post(f"/api/passport/{pid}/enrich", files={"profile45": ("p.jpg", jpeg(), "image/jpeg")})
    assert r.status_code == 200 and r.json()["mode"] == "reanalyze"
    p = client.app.state.store.get(pid)["passport"]
    assert p["user_context"]["body"]["frame"] == "straight"                      # kept across re-analysis
    assert not (client.settings.runs_dir / pid / "uploads").exists()            # new photo deleted after the job
    assert client.post(f"/api/passport/{pid}/enrich", data={"context": "[1]"}).status_code == 422


# --- previews / geometry -------------------------------------------------------------------------------------

def test_previews_free_quota_then_payment_required(client):
    pid = ready(client)
    for tier in ("safe", "bold"):                                    # D33: no free photorealistic preview
        r = client.post(f"/api/passport/{pid}/previews", json={"kind": "hair", "target_ids": [tier]})
        assert r.status_code == 402 and r.json()["error"]["code"] == "payment_required"
    r = client.post(f"/api/passport/{pid}/previews", json={"kind": "hair", "target_ids": ["x/../y"]})
    assert r.status_code == 422
    r = client.post(f"/api/passport/{pid}/previews", json={"kind": "hair", "target_ids": ["r4"]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "not_previewable"


def test_paid_passport_gets_three_hair_previews(client):
    pid = ready(client)
    assert client.post("/api/checkout", json={"passport_id": pid}).json()["payment"]["status"] == "paid"
    r = client.post(f"/api/passport/{pid}/previews", json={"kind": "hair", "target_ids": ["safe", "bold", "easy"]})
    assert r.status_code == 202
    states = {(p["kind"], p["target_id"]) for p in get(client, pid)["partial"]["previews"]}
    assert {("hair", "safe"), ("hair", "bold"), ("hair", "easy")} <= states
    p = client.app.state.store.get(pid)["passport"]
    assert {(e["kind"], e["target_id"]) for e in p["previews"]} >= {("hair", "bold"), ("hair", "easy")}
    assert validate_passport(p) == []


def test_geometry_endpoint_and_expiry(client):
    pid = ready(client)
    # stub QC measures nothing → no geometry
    assert client.get(f"/api/passport/{pid}/geometry").status_code == 404
    geo = json.loads((EX.parent / "web" / "lib" / "fixtures" / "sample_geometry.json").read_text())
    (client.settings.runs_dir / pid / "media" / "geometry.json").write_text(json.dumps(geo))
    assert client.get(f"/api/passport/{pid}/geometry").json()["width"] == 600
    store = client.app.state.store
    store._exec("UPDATE passports SET media_expires_at=? WHERE id=?", ((now() - timedelta(minutes=1)).isoformat(), pid))
    assert purge_expired_media(store, client.settings.runs_dir) == [pid]
    assert client.get(f"/api/passport/{pid}/geometry").status_code == 404
    body = get(client, pid)
    assert body["media"]["expired"] and body["media"]["front"] is None and body["passport"] is not None
    assert client.get(f"/api/media/{pid}/front.jpg").status_code == 410


# --- share / delete / retention --------------------------------------------------------------------------------

def test_share_link_is_read_only_without_photos(client):
    pid = ready(client)
    s = client.post(f"/api/passport/{pid}/share").json()
    assert s["url"].endswith(s["share_token"]) and client.post(f"/api/passport/{pid}/share").json() == s
    view = client.get(f"/api/share/{s['share_token']}").json()
    assert view["passport"]["previews"] == [] and "/api/media/" not in json.dumps(view)
    assert client.get("/api/share/not-a-real-token").status_code == 404


def test_delete_erases_everything(client):
    pid = ready(client)
    client.post(f"/api/passport/{pid}/feedback", json={"target_type": "recommendation", "target_id": "r2",
                                                       "reaction": "like"})
    token = client.post(f"/api/passport/{pid}/share").json()["share_token"]
    r = client.delete(f"/api/passport/{pid}")
    assert r.status_code == 200 and r.json()["deleted_at"]
    assert not (client.settings.runs_dir / pid).exists()
    g = client.get(f"/api/passport/{pid}")
    assert g.status_code == 410 and g.json()["error"]["code"] == "deleted" and g.json()["error"]["deleted_at"]
    assert client.get(f"/api/media/{pid}/front.jpg").status_code == 410
    assert client.get(f"/api/share/{token}").status_code == 404
    store = client.app.state.store
    assert store.preference_events(pid) == [] and store.previews(pid) == []
    assert client.delete(f"/api/passport/{pid}").json()["already_deleted"] is True
    assert client.delete("/api/passport/ap_000000000000").status_code == 404


def test_unsaved_passport_json_expires(client):
    pid = ready(client)
    store = client.app.state.store
    store._exec("UPDATE passports SET json_expires_at=? WHERE id=?", ((now() - timedelta(minutes=1)).isoformat(), pid))
    assert purge_expired_passports(store, client.settings.runs_dir) == [pid]
    assert client.get(f"/api/passport/{pid}").status_code == 410


# --- events / payments ---------------------------------------------------------------------------------------

def test_events_whitelist(client):
    assert client.post("/api/events", json={"name": "score_teaser_click", "topic": "face", "ref": "xhs"}).status_code == 204
    assert client.post("/api/events", json={"name": "photo_pixels", "data": "x"}).status_code == 422
    ev = client.app.state.store.events()[-1]
    assert ev == {"name": "score_teaser_click", "pid_hash": None, "topic": "face", "ref": "xhs", "ts": ev["ts"]}


def test_checkout_fake_and_webhook_idempotent(client):
    pid = ready(client)
    body = client.post("/api/checkout", json={"passport_id": pid}).json()
    assert body["payment"]["status"] == "paid" and body["entitlement"]["paid"] and body["entitlement"]["locked"] == []
    assert validate_passport(body["passport"]) == []                    # paid view = the full passport
    order = body["payment"]["order_id"]
    w = client.post("/api/payments/webhook", json={"order_id": order, "status": "paid"}).json()
    assert w == {"ok": True, "changed": False}                          # replay: nothing counted twice
    assert len(client.app.state.store.payments(pid)) == 1
    assert client.post("/api/payments/webhook", json={"order_id": "x", "status": "paid"}).status_code == 400


def test_invite_unlock(client):
    pid = ready(client)
    assert client.post("/api/checkout", json={"passport_id": pid, "invite_code": "nope"}).status_code == 403
    assert client.post("/api/checkout", json={"passport_id": pid, "invite_code": "FRIEND39"}).json()["payment"]["status"] == "paid"
    assert get(client, pid)["entitlement"]["paid"] is True


def test_qc_endpoint_stub(client):
    r = client.post("/api/qc", data={"role": "front"}, files={"file": ("f.jpg", jpeg(), "image/jpeg")})
    assert r.status_code == 200 and r.json()["status"] == "ok"
    r = client.post("/api/qc", data={"role": "nope"}, files={"file": ("f.jpg", jpeg(), "image/jpeg")})
    assert r.status_code == 422
