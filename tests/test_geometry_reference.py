"""Synthetic distributions only; no personal records or production authorization."""
import copy
import hashlib
import json

from aesthetic_passport.attractiveness_rank.ingest import build_image_reference
from aesthetic_passport.scoring.reference import evaluate_geometry_reference, geometry_identity, rank_geometry


def reference():
    manifest = {
        "cohort_id": "geometry-test", "cohort_label": "Synthetic test photos",
        "distribution_version": "test-v1", "reference_unit": "image",
        "definition": "Synthetic tests", "sampling": "convenience",
        "identity": geometry_identity(), "native_score_bounds": [0, 100],
        "provenance": {"data_kind": "research_only", "source_reference": "test",
            "license_id": "test", "permission_reference": "test", "ranking_authorized": True,
            "research_authorized": True, "aggregate_retention_authorized": True,
            "model_production_authorized": False, "adults_confirmed": False},
        "qc": {"status": "passed", "evidence_reference": "test", "deduplication_version": "test"},
    }
    return build_image_reference(manifest, [20.] * 10 + [50.] * 180 + [80.] * 10)


def test_geometry_uses_nonlinear_empirical_distribution_and_preserves_input():
    score = {"overall_score": 50., "status": "full", "scoring_version": "aes-geo-1.0"}
    original = copy.deepcopy(score)
    result = rank_geometry(score, reference(), research=True)
    assert result["percentile"] == 50
    assert result["top_percent"] == 50
    assert result["distribution"]["bounds"] == [0, 10]
    assert score == original
    # Same score interval, very different mass: not a linear score-to-percent mapping.
    assert rank_geometry(score | {"overall_score": 40}, reference(), research=True)["percentile"] == 10


def test_geometry_fails_closed_for_quality_identity_missing_reference_and_tails():
    score = {"overall_score": 50., "status": "full", "scoring_version": "aes-geo-1.0"}
    for update in ({"status": "limited"}, {"overall_score": None}, {"scoring_version": "other"}):
        assert rank_geometry(score | update, reference(), research=True)["top_percent"] is None
    assert rank_geometry(score, None, research=True)["top_percent"] is None
    assert rank_geometry(score, reference())["top_percent"] is None
    assert rank_geometry(score | {"overall_score": 0}, reference(), research=True)["top_percent"] is None


def test_private_receipt_binds_exact_geometry_reference(tmp_path, monkeypatch):
    content = json.dumps(reference()).encode()
    path = tmp_path / "reference.json"
    path.write_bytes(content)
    receipt_path = tmp_path / "receipt.json"
    monkeypatch.setenv("BEAUTYAI_GEOMETRY_REFERENCE", str(path))
    monkeypatch.setenv("BEAUTYAI_GEOMETRY_REFERENCE_AUTHORIZATION", str(receipt_path))
    monkeypatch.delenv("BEAUTYAI_GEOMETRY_REFERENCE_MODE", raising=False)
    score = {"overall_score": 50., "status": "full", "scoring_version": "aes-geo-1.0"}
    assert evaluate_geometry_reference(score)["top_percent"] is None
    receipt = {"scope": "production_geometry_photo_sample_comparison", "identity": geometry_identity(),
        "reference_sha256": hashlib.sha256(content).hexdigest(), "cohort_id": "geometry-test",
        "distribution_version": "test-v1", "ranking_authorized": True,
        "aggregate_retention_authorized": True, "permission_reference": "synthetic-test-only"}
    receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
    rank = evaluate_geometry_reference(score)
    assert rank["top_percent"] == 50
    from pathlib import Path

    from jsonschema import Draft202012Validator

    schema = json.loads((Path(__file__).parents[1] / "schema/passport.schema.json").read_text(encoding="utf-8"))
    Draft202012Validator({"$ref": "#/$defs/geometry_reference_rank", "$defs": schema["$defs"]}).validate(rank)
    path.write_bytes(content + b" ")
    assert evaluate_geometry_reference(score)["top_percent"] is None
    path.write_text("invalid", encoding="utf-8")
    assert evaluate_geometry_reference(score)["top_percent"] is None
