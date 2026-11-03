"""Production CV-first billing boundary: no DeepSeek until payment confirmation."""
import io
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from aesthetic_passport.api.app import create_app
from aesthetic_passport.api.settings import Settings
from aesthetic_passport.schema_io import validate_api_response


def jpeg():
    b = io.BytesIO()
    Image.new("RGB", (400, 500), (170, 140, 110)).save(b, format="JPEG")
    return b.getvalue()


@pytest.fixture
def client(tmp_path, monkeypatch):
    for k, v in {"ANALYSIS_PROVIDER": "fake", "FAKE_ANALYSIS_DELAY_S": "0",
                 "QC_MODE": "stub", "IMAGE_EDIT_PROVIDER": "fake",
                 "PAYMENT_PROVIDER": "fake"}.items():
        monkeypatch.setenv(k, v)
    settings = Settings(runs_dir=tmp_path / "runs", run_jobs_inline=True, free_cv_only=True)
    with TestClient(create_app(settings)) as c:
        c.settings = settings
        yield c


def create(client):
    result = client.post("/api/passport",
                         files={"front": ("front.jpg", jpeg(), "image/jpeg")},
                         data={"context": json.dumps({"user_context": {"presentation": "feminine"}}),
                               "consent": "true"})
    assert result.status_code == 202
    return result.json()["id"]


def test_free_cv_does_not_invoke_any_deepseek_or_qwen(client, monkeypatch):
    from aesthetic_passport import pipeline

    def prohibited(*args, **kwargs):
        raise AssertionError("The free CV path must never invoke the LLM")

    monkeypatch.setattr(pipeline, "run_quick", prohibited)
    monkeypatch.setattr(pipeline, "run_analysis", prohibited)
    pid = create(client)
    response = client.get("/api/passport/" + pid)
    assert response.status_code == 200
    data = response.json()
    assert validate_api_response(data) == []
    assert data["status"] == "free_ready"
    assert data["passport"] is None
    assert data["free_result"]["score"]["value"] is None  # stub CV never invents a score
    assert len(data["free_result"]["metrics"]) == 6
    assert all(m["value"] is None for m in data["free_result"]["metrics"])
    assert data["free_result"]["rank"]["percentile"] is None
    assert data["partial"]["quick"] is None
    assert data["partial"]["previews"] == []
    assert "analysis" not in json.dumps(data["free_result"])
    assert not (client.settings.runs_dir / pid / "calls.jsonl").exists()
    assert client.get("/api/passport/" + pid + "/geometry").status_code == 402
    assert client.post("/api/passport/" + pid + "/previews",
                       json={"kind": "hair", "target_ids": ["safe"]}).status_code == 402
    assert client.post("/api/passport/" + pid + "/complete").status_code == 402


def test_paid_checkout_generates_real_passport_without_quick(client):
    pid = create(client)
    free = client.get("/api/passport/" + pid).json()
    assert free["status"] == "free_ready"
    assert free["free_result"] is not None and free["passport"] is None

    paid = client.post("/api/checkout", json={"passport_id": pid})
    assert paid.status_code == 200, paid.text
    body = paid.json()
    assert body["payment"]["status"] == "paid"
    assert body["entitlement"]["paid"] is True
    assert body["status"] == "full_ready"
    assert body["passport"] is not None and body["passport"]["analysis"]
    calls = [json.loads(x)["kind"] for x in
             (client.settings.runs_dir / pid / "calls.jsonl").read_text().splitlines()]
    assert calls == ["analysis"]
    assert client.settings.preview_cap == 3
    assert client.post("/api/checkout", json={"passport_id": pid}).status_code == 200


def test_invite_unlock_starts_paid_analysis(client):
    client.settings.invite_unlock_codes = {"FRIEND39"}
    pid = create(client)
    r = client.post("/api/checkout", json={"passport_id": pid, "invite_code": "FRIEND39"})
    assert r.status_code == 200
    assert r.json()["passport"]["analysis"]
    assert r.json()["entitlement"]["paid"] is True


def test_expired_media_cannot_be_charged_for_unfulfillable_report(client):
    from datetime import timedelta

    from aesthetic_passport.api.store import iso, now

    pid = create(client)
    client.app.state.store._exec("UPDATE passports SET media_expires_at=? WHERE id=?",
                                 (iso(now() - timedelta(seconds=1)), pid))
    r = client.post("/api/checkout", json={"passport_id": pid})
    assert r.status_code == 410
    assert client.app.state.store.get(pid)["paid"] == 0


def test_free_score_never_falls_back_to_geometry():
    from aesthetic_passport.api.entitlement import cv_teaser

    stored = {
        "measurement_profile": {"metrics": []},
        "aesthetic_score": {"status": "full", "overall_score": 94.5},
        "reference_percentiles": {"rank": {"status": "ok", "percentile_estimate": 96}},
        "learned_attractiveness": {"status": "unavailable", "production_authorized": False},
        "learned_reference_rank": {"status": "unavailable"},
    }
    free = cv_teaser(stored)
    assert free["score"] == {"kind": "learned", "value": None, "scale": 10,
                              "status": "unavailable", "label": "颜值参考分"}
    assert free["rank"]["percentile"] is None
    assert len(free["metrics"]) == 6
    stored["learned_attractiveness"] = {"status": "ok", "production_authorized": True, "display_score": 7.3}
    stored["learned_reference_rank"] = {"status": "available", "percentile": 86.7,
                                       "cohort_label": "经匹配的 Ridge 参考照片"}
    free = cv_teaser(stored)
    assert free["score"]["value"] == 7.3
    assert free["rank"] == {"status": "available", "percentile": 86.7,
                            "label": "经匹配的 Ridge 参考照片", "distribution": None}
    stored["learned_reference_rank"] = {"status": "unavailable", "percentile": 99.9}
    assert cv_teaser(stored)["rank"]["percentile"] is None


def test_free_score_charts_use_only_matching_reference_and_existing_geometry():
    from aesthetic_passport.api.entitlement import cv_teaser

    distribution = {
        "method": "gaussian_kde_scott_v1", "n": 100, "bounds": [1, 10],
        "mean": 5.3, "points": [[1, 0.01], [5, 0.2], [10, 0.01]],
    }
    stored = {
        "measurement_profile": {"metrics": []},
        "aesthetic_score": {
            "components": [{"key": "symmetry", "measured": {
                "features": {"eyes": 70, "brows": 60, "nose": 55, "mouth": 65, "jaw": 80}}}],
            "component_scores": {"thirds": 62, "fifths": 72, "golden_ratio": 82},
        },
        "learned_attractiveness": {"status": "ok", "production_authorized": True,
                                   "display_score": 5.3},
        "learned_reference_rank": {"status": "available", "percentile": 45,
                                   "cohort_label": "测试参考照片", "distribution": distribution},
    }
    result = cv_teaser(stored)
    assert result["rank"]["distribution"] == distribution
    assert len(result["harmony"]) == 8
    assert result["harmony"][0] == {"id": "eyes", "label": "眼部对称", "value": 70}
    assert result["score"]["value"] == 5.3
    stored["learned_reference_rank"]["status"] = "unavailable"
    assert cv_teaser(stored)["rank"]["distribution"] is None
    stored["learned_attractiveness"]["production_authorized"] = False
    assert cv_teaser(stored)["score"]["value"] is None
    assert cv_teaser(stored)["rank"]["distribution"] is None
