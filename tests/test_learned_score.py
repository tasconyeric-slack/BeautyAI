"""Authorization and artifact boundaries, using non-person synthetic parameters."""
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

from aesthetic_passport.attractiveness import service
from aesthetic_passport.attractiveness.artifact import FEATURES, make_artifact, predict_features


@pytest.fixture
def configured(tmp_path, monkeypatch):
    cfg = yaml.safe_load(Path("config/attractiveness.yaml").read_text(encoding="utf-8"))
    n = len(FEATURES)
    artifact = make_artifact({"mu": [0]*n, "sd": [1]*n, "w": [0]*n, "b": 3, "alpha": 100, "n_train": 300},
                             dataset="synthetic-test", label_name="test-only", label_range=(1., 5.))
    path = tmp_path / "artifact.json"
    path.write_text(json.dumps(artifact), encoding="utf-8")
    cfg.update(artifact_path=str(path), artifact_sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    monkeypatch.setenv("BEAUTYAI_RIDGE_MODE", "research")
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setattr(service, "load_config", lambda: cfg)
    return cfg, path


def test_explicit_display_scale_and_feature_order():
    assert service.display_score(1, [1, 5], [1, 10]) == 1
    assert service.display_score(3, [1, 5], [1, 10]) == 5.5
    assert service.display_score(5, [1, 5], [1, 10]) == 10
    from experiments.aesthetics.preprocess import GEOMETRY_FEATURES
    assert tuple(FEATURES) == GEOMETRY_FEATURES


def test_verified_artifact_and_missing_model(configured):
    cfg, path = configured
    assert predict_features([0]*17, service.verified_artifact(cfg)) == 3
    path.unlink()
    score, rank = service.evaluate(None, None)
    assert score["raw_score"] is None
    assert score["unavailable_reason"] == "model_missing"
    assert rank["percentile"] is None


def test_wrong_hash_and_order_rejected(configured):
    cfg, path = configured
    path.write_text("{}", encoding="utf-8")
    with pytest.raises(ValueError, match="hash"):
        service.verified_artifact(cfg)
    a = make_artifact({"mu": [0]*17, "sd": [1]*17, "w": [0]*17, "b": 3, "alpha": 1, "n_train": 100},
                      dataset="test", label_name="test", label_range=(1., 5.))
    a["features"].reverse()
    path.write_text(json.dumps(a), encoding="utf-8")
    cfg["artifact_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    with pytest.raises(ValueError, match="order"):
        service.verified_artifact(cfg)


def test_reference_hash_mismatch(configured, monkeypatch):
    cfg, path = configured
    monkeypatch.setenv("BEAUTYAI_RIDGE_REFERENCE", str(path))
    with pytest.raises(ValueError, match="reference_hash_mismatch"):
        service.verified_reference(cfg)


def test_old_passport_and_invalid_new_fields():
    from aesthetic_passport.schema_io import validate_passport
    old = json.loads(Path("examples/sample_passport.json").read_text(encoding="utf-8"))
    old.pop("learned_attractiveness", None)
    old.pop("learned_reference_rank", None)
    old["schema_version"] = "0.7"
    assert validate_passport(old) == []
    old["learned_reference_rank"] = {"status": "available", "percentile": 999}
    assert validate_passport(old)


def test_research_never_runs_on_production(configured, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    score, rank = service.evaluate(None, None)
    assert score["unavailable_reason"] == "research_disabled_in_production"
    assert score["raw_score"] is rank["percentile"] is None
    monkeypatch.setenv("BEAUTYAI_RIDGE_MODE", "production")
    score, _ = service.evaluate(None, None)
    assert score["unavailable_reason"] == "model_not_authorized"


def test_permission_receipt_is_bound_to_full_identity(configured, monkeypatch, tmp_path):
    cfg, _ = configured
    receipt = {"identity": service.identity(cfg), "scoring_authorized": True,
               "permission_reference": "synthetic-permission-test-only"}
    path = tmp_path / "permission.json"
    path.write_text(json.dumps(receipt), encoding="utf-8")
    monkeypatch.setenv("BEAUTYAI_RIDGE_AUTHORIZATION", str(path))
    assert service.production_authorized(cfg)
    receipt["identity"]["checkpoint_id"] = "another-model"
    path.write_text(json.dumps(receipt), encoding="utf-8")
    assert not service.production_authorized(cfg)


def test_same_geometry_features_and_qc_fallback(configured):
    from aesthetic_passport.attractiveness.features import from_geometry
    from aesthetic_passport.face_metrics.synthetic import synthetic_face
    from aesthetic_passport.scoring import score_face
    from experiments.aesthetics.preprocess import geometry

    face, _ = synthetic_face()
    front = SimpleNamespace(face=face, yaw=0., pitch=0., status="pass", issues=[])
    measured = score_face(face.landmarks, yaw=0., pitch=0.)
    _, experimental = geometry(SimpleNamespace(landmarks=face.landmarks, yaw=0., pitch=0.))
    assert from_geometry(measured, front.yaw, front.pitch) == experimental
    score, _ = service.evaluate(front, measured)
    assert score["raw_score"] == 3
    assert score["display_score"] == 5.5
    assert score["status"] == "research_only"
    front.issues = ["low_resolution"]
    score, rank = service.evaluate(front, measured)
    assert score["unavailable_reason"] == "image_quality_limited"
    assert score["raw_score"] is rank["percentile"] is None
