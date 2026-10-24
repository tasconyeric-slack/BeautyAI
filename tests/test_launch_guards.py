"""Public-launch guards (PR #25 review): no silent mock fallback or fake charging in production; strict photo TTL."""
import io
import json
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from aesthetic_passport.api.app import create_app
from aesthetic_passport.api.settings import Settings
from aesthetic_passport.api.store import iso, now
from aesthetic_passport.payments import PaymentError, payment_from_env
from aesthetic_passport.pipeline import qc_mode
from aesthetic_passport.providers import ProviderError, from_config, resolve_provider_name
from aesthetic_passport.providers.image import ImageEditError, image_from_config, resolve_image_provider


@pytest.fixture
def prod(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    for k in ("DEEPSEEK_API_KEY", "DASHSCOPE_API_KEY", "ALLOW_MOCK_PROVIDERS"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr("dotenv.load_dotenv", lambda *a, **k: None, raising=False)


def test_production_auto_never_falls_back_to_fakes(prod, monkeypatch):
    monkeypatch.setenv("ANALYSIS_PROVIDER", "auto")
    monkeypatch.setenv("IMAGE_EDIT_PROVIDER", "auto")
    assert resolve_provider_name("deepseek") == "deepseek"        # fails on its missing key, never the fixture
    assert resolve_image_provider() == "qwen"


def test_production_refuses_explicit_fakes(prod, monkeypatch):
    monkeypatch.setenv("ANALYSIS_PROVIDER", "fake")
    monkeypatch.setenv("IMAGE_EDIT_PROVIDER", "fake")
    monkeypatch.setenv("QC_MODE", "stub")
    with pytest.raises(ProviderError):
        from_config("analysis")
    with pytest.raises(ImageEditError):
        image_from_config()
    with pytest.raises(PaymentError):
        payment_from_env()
    assert qc_mode() == "real"


def test_demo_escape_hatch(prod, monkeypatch):
    monkeypatch.setenv("ALLOW_MOCK_PROVIDERS", "1")
    monkeypatch.setenv("ANALYSIS_PROVIDER", "auto")
    assert resolve_provider_name("deepseek") == "fake"
    assert payment_from_env().name == "fake"


def _jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (400, 500), (180, 150, 130)).save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def client(tmp_path, monkeypatch):
    for k, v in {"ANALYSIS_PROVIDER": "fake", "FAKE_ANALYSIS_DELAY_S": "0", "QC_MODE": "stub",
                 "IMAGE_EDIT_PROVIDER": "fake", "PAYMENT_PROVIDER": "fake"}.items():
        monkeypatch.setenv(k, v)
    s = Settings(runs_dir=tmp_path / "runs", run_jobs_inline=True, invite_unlock_codes={"FRIEND39"})
    with TestClient(create_app(s)) as c:
        c.settings = s
        yield c


def _passport(client) -> str:
    r = client.post("/api/passport", files={"front": ("f.jpg", _jpeg(), "image/jpeg")},
                    data={"context": json.dumps({"user_context": {"presentation": "feminine"}}), "consent": "true"})
    return r.json()["id"]


def test_health_flags_demo_mode(client):
    h = client.get("/api/health").json()
    assert h["demo"] is True and h["environment"] == "development"


def test_production_checkout_disabled_but_invite_works(client, monkeypatch):
    pid = _passport(client)
    monkeypatch.setenv("APP_ENV", "production")
    r = client.post("/api/checkout", json={"passport_id": pid})
    assert r.status_code == 503 and r.json()["error"]["code"] == "payment_unavailable"
    assert client.get("/api/health").json()["payment_provider"] == "unavailable"
    r = client.post("/api/checkout", json={"passport_id": pid, "invite_code": "FRIEND39"})
    assert r.json()["entitlement"]["paid"] is True


def test_photo_ttl_enforced_on_read_before_purge(client):
    pid = _passport(client)
    geo = {"width": 600, "height": 750}
    (client.settings.runs_dir / pid / "media" / "geometry.json").write_text(json.dumps(geo))
    assert client.get(f"/api/media/{pid}/front.jpg").status_code == 200
    assert client.get(f"/api/passport/{pid}/geometry").status_code == 200
    store = client.app.state.store
    store._exec("UPDATE passports SET media_expires_at=? WHERE id=?", (iso(now() - timedelta(seconds=1)), pid))
    # The hourly purge has not run (media_deleted is still 0), yet nothing photo-derived is served any more.
    assert store.get(pid)["media_deleted"] == 0
    assert client.get(f"/api/media/{pid}/front.jpg").status_code == 410
    assert client.get(f"/api/passport/{pid}/geometry").status_code == 404
    body = client.get(f"/api/passport/{pid}").json()
    assert body["media"]["expired"] is True and body["media"]["front"] is None
    r = client.post(f"/api/passport/{pid}/previews", json={"kind": "hair", "target_ids": ["safe"]})
    assert r.status_code == 410
