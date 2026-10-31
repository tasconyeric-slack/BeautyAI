"""Production photo comparisons need their own exact, private permission receipt."""
import copy
import hashlib
import json
from types import SimpleNamespace

import pytest
from test_attractiveness_rank import manifest, prediction

from aesthetic_passport.attractiveness import service
from aesthetic_passport.attractiveness_rank import rank_prediction
from aesthetic_passport.attractiveness_rank.ingest import build_image_reference
from aesthetic_passport.face_metrics.synthetic import synthetic_face
from aesthetic_passport.scoring import score_face


def image_registry():
    m = manifest()
    m.update(reference_unit="image", cohort_label="Named test photo sample")
    m["provenance"].update(data_kind="research_only", research_authorized=True,
                           adults_confirmed=False, model_production_authorized=False)
    return build_image_reference(m, [i / 100 for i in range(1000)])


def test_photo_permission_is_explicit_and_does_not_bypass_model_or_qc():
    ref = image_registry()
    kwargs = {"cohort_id": "test-only", "distribution_version": "test-1"}
    assert rank_prediction(prediction(), ref, **kwargs).status == "unavailable"
    result = rank_prediction(prediction(), ref, **kwargs, image_reference_authorized=True)
    assert result.status == "available"
    assert result.reference_unit == "image" and result.n_reference == 1000
    assert result.n_unique_subjects is None and result.research_only is False
    assert "image_independence_and_ages_unverified" in result.limitations
    for p in (prediction(status="research_only"), prediction(production_authorized=False),
              prediction(quality_flags=["blur"])):
        assert rank_prediction(p, ref, **kwargs, image_reference_authorized=True).status == "unavailable"
    for field, value in (("qc", {"status": "failed", "evidence_reference": "test", "deduplication_version": "test"}),
                         ("identity", dict(ref["cohorts"][0]["identity"], checkpoint_id="other"))):
        broken = copy.deepcopy(ref)
        broken["cohorts"][0][field] = value
        assert rank_prediction(prediction(), broken, **kwargs, image_reference_authorized=True).status == "unavailable"
    broken = copy.deepcopy(ref)
    broken["cohorts"][0]["provenance"]["data_kind"] = "synthetic_test"
    assert rank_prediction(prediction(), broken, **kwargs, image_reference_authorized=True).status == "unavailable"


@pytest.fixture
def reference_permission(tmp_path, monkeypatch):
    cfg = service.load_config()
    receipt = {"contract_version": "image-reference-permission-1", "scope": "production_image_reference_comparison",
                   "identity": service.identity(cfg), "reference_sha256": cfg["reference_sha256"],
                   "cohort_id": cfg["reference_id"], "distribution_version": cfg["reference_version"],
                   "ranking_authorized": True, "aggregate_retention_authorized": True,
                   "permission_reference": "synthetic-test-owner-attestation"}
    path = tmp_path / "permission.json"
    monkeypatch.setenv("BEAUTYAI_RIDGE_REFERENCE_AUTHORIZATION", str(path))
    return cfg, receipt, path


def test_private_reference_permission_binding_and_malformed_inputs(reference_permission):
    cfg, receipt, path = reference_permission
    path.write_text(json.dumps(receipt), encoding="utf-8")
    assert service.production_reference_authorized(cfg)
    for key in receipt:
        bad = copy.deepcopy(receipt)
        bad[key] = " " if key == "permission_reference" else False if isinstance(bad[key], bool) else "wrong"
        path.write_text(json.dumps(bad), encoding="utf-8")
        assert not service.production_reference_authorized(cfg), key
    for malformed in ({}, [], None, {"scoring_authorized": True}, receipt | {"permission_reference": "  "}):
        path.write_text(json.dumps(malformed), encoding="utf-8")
        assert not service.production_reference_authorized(cfg)
    path.unlink()
    assert not service.production_reference_authorized(cfg)


def test_service_production_photo_rank_requires_both_permissions(reference_permission, tmp_path, monkeypatch):
    from aesthetic_passport.attractiveness.artifact import make_artifact

    cfg, receipt, path = reference_permission
    artifact = make_artifact({"mu": [0]*17, "sd": [1]*17, "w": [0]*17, "b": 3, "alpha": 1, "n_train": 100},
                             dataset="test", label_name="test", label_range=(1., 5.))
    model_path = tmp_path / "model.json"
    model_path.write_text(json.dumps(artifact), encoding="utf-8")
    cfg.update(artifact_sha256=hashlib.sha256(model_path.read_bytes()).hexdigest())
    ref = image_registry()
    cohort = ref["cohorts"][0]
    cohort.update(identity=service.identity(cfg), native_score_bounds=[1., 5.],
                  cohort_id=cfg["reference_id"], distribution_version=cfg["reference_version"])
    cohort["distribution"] = [{"score": 2. + i / 1000, "count": 1} for i in range(2000)]
    cohort.update(n_observations=2000, import_summary={"records_received": 2000, "duplicates_removed": 0})
    ref_path = tmp_path / "reference.json"
    ref_path.write_text(json.dumps(ref), encoding="utf-8")
    cfg["reference_sha256"] = hashlib.sha256(ref_path.read_bytes()).hexdigest()
    scoring_path = tmp_path / "scoring.json"
    scoring_path.write_text(json.dumps({"identity": service.identity(cfg), "scoring_authorized": True,
                                           "permission_reference": "test-only"}), encoding="utf-8")
    monkeypatch.setattr(service, "load_config", lambda: cfg)
    for key, value in {"APP_ENV": "production", "BEAUTYAI_RIDGE_MODE": "production",
                           "BEAUTYAI_RIDGE_ARTIFACT": str(model_path), "BEAUTYAI_RIDGE_REFERENCE": str(ref_path),
                           "BEAUTYAI_RIDGE_AUTHORIZATION": str(scoring_path)}.items():
        monkeypatch.setenv(key, value)
    face, _ = synthetic_face()
    front = SimpleNamespace(face=face, yaw=0., pitch=0., status="pass", issues=[])
    geometry = score_face(face.landmarks, yaw=0., pitch=0.)
    score, rank = service.evaluate(front, geometry)
    assert score["status"] == "ok" and rank["status"] == "unavailable"
    receipt.update(identity=service.identity(cfg), reference_sha256=cfg["reference_sha256"])
    path.write_text(json.dumps(receipt), encoding="utf-8")
    score, rank = service.evaluate(front, geometry)
    assert score["status"] == "ok" and rank["status"] == "available"
    assert rank["distribution"]["n"] == 2000 and rank["research_only"] is False
    scoring_path.unlink()
    score, rank = service.evaluate(front, geometry)
    assert score["status"] == rank["status"] == "unavailable"
