"""All values below are deterministic non-person fixtures, never a production cohort."""

from __future__ import annotations

import copy
import json
import subprocess
import sys
from pathlib import Path

import pytest

from aesthetic_passport.attractiveness_rank import (
    ReferenceDataError,
    build_reference,
    empirical_quantile,
    load_registry,
    rank_prediction,
    validate_registry,
)


def identity():
    return {
        "model_id": "test-model",
        "checkpoint_id": "sha256:test-only",
        "preprocessing_version": "prep-1",
        "crop_version": "crop-1",
        "native_scale_id": "test-scale-0-10",
        "calibration_version": None,
    }


def prediction(score=5.0, **updates):
    return (
        dict(
            contract_version="learned-attractiveness-1",
            **identity(),
            status="ok",
            raw_score=score,
            production_authorized=True,
            quality_flags=[],
            unavailable_reason=None,
        )
        | updates
    )


def manifest():
    # A hypothetical authorized manifest exercises the gates; no real people or license are represented.
    return {
        "cohort_id": "test-only",
        "cohort_label": "Non-person test values",
        "distribution_version": "test-1",
        "definition": "Deterministic test values; never publish as real sample ranks",
        "sampling": "self_selected",
        "identity": identity(),
        "native_score_bounds": [0, 10],
        "provenance": {
            "data_kind": "real_adult",
            "source_reference": "test-fixture-only",
            "license_id": "hypothetical-test-permission",
            "permission_reference": "test-fixture-only",
            "ranking_authorized": True,
            "aggregate_retention_authorized": True,
            "model_production_authorized": True,
            "adults_confirmed": True,
        },
        "qc": {
            "status": "passed",
            "evidence_reference": "test-fixture-only",
            "deduplication_version": "test-subject-and-near-duplicate-v1",
        },
    }


def rows(n=200):
    return [
        {
            "subject_key": f"subject-{i}",
            "duplicate_cluster": f"cluster-{i}",
            "observation_key": f"obs-{i:04}",
            "adult_confirmed": True,
            "prediction": prediction(i // 20),
        }
        for i in range(n)
    ]


def registry(n=200):
    return build_reference(manifest(), rows(n))


def rank(score=5, ref=None, **updates):
    return rank_prediction(
        prediction(score, **updates),
        ref if ref is not None else registry(),
        cohort_id="test-only",
        distribution_version="test-1",
    )


def test_midrank_ties_and_step_cdf_without_interpolation():
    # 100 below 5 + half of the 20 ties = 110/200 = 55%, displayed coarsely at 60%.
    result = rank(5)
    assert result.status == "available"
    assert result.percentile == 60
    assert result.top_percent == 40
    assert result.n_unique_subjects == 200
    assert result.percentile_interval[0] <= 55 <= result.percentile_interval[1]
    assert result.display_step_percent == 10
    assert rank(4.01).percentile == rank(4.99).percentile == 50
    assert "self_selected" in result.limitations


def test_monotonicity_and_empirical_quantiles():
    ref = registry()
    results = [rank(x / 10, ref) for x in range(1, 90)]
    available = [r.percentile for r in results if r.status == "available"]
    assert available == sorted(available)
    cohort = ref["cohorts"][0]
    assert [empirical_quantile(cohort, q) for q in (0, 0.25, 0.5, 0.75, 1)] == [0, 2, 4, 7, 9]
    with pytest.raises(ReferenceDataError):
        empirical_quantile(cohort, float("nan"))


@pytest.mark.parametrize(
    "field,value",
    [
        ("model_id", "other"),
        ("checkpoint_id", "other"),
        ("preprocessing_version", "other"),
        ("crop_version", "other"),
        ("native_scale_id", "other"),
        ("calibration_version", "other"),
    ],
)
def test_each_identity_mismatch_returns_no_numbers(field, value):
    result = rank(**{field: value})
    assert result.unavailable_reason == "model_reference_mismatch"
    assert result.percentile is result.top_percent is result.percentile_interval is None


@pytest.mark.parametrize(
    "updates,reason",
    [
        ({"status": "research_only"}, "model_research_only"),
        ({"production_authorized": False}, "model_not_authorized"),
        ({"status": "unavailable", "raw_score": None}, "model_unavailable"),
        ({"quality_flags": ["limited"]}, "image_quality_limited"),
        ({"unavailable_reason": "crop_failed"}, "model_unavailable"),
        ({"raw_score": float("nan")}, "invalid_model_result"),
        ({"raw_score": float("inf")}, "invalid_model_result"),
        ({"raw_score": True}, "invalid_model_result"),
        ({"production_authorized": "true"}, "invalid_model_result"),
        ({"contract_version": "future"}, "invalid_model_result"),
    ],
)
def test_bad_model_states_fail_closed(updates, reason):
    result = rank_prediction(prediction() | updates, registry(), cohort_id="test-only", distribution_version="test-1")
    assert result.unavailable_reason == reason
    assert result.percentile is result.top_percent is None


def test_missing_reference_versions_small_n_and_tails():
    assert rank_prediction(prediction(), None, cohort_id="test-only", distribution_version="test-1").percentile is None
    assert load_registry()["cohorts"] == []
    assert (
        rank_prediction(
            prediction(), load_registry(), cohort_id="test-only", distribution_version="test-1"
        ).unavailable_reason
        == "reference_missing"
    )
    assert (
        rank_prediction(
            prediction(), registry(), cohort_id="test-only", distribution_version="wrong"
        ).unavailable_reason
        == "reference_version_missing"
    )
    assert rank(2, registry(80)).unavailable_reason == "reference_too_small"
    for score in (-1, 10, 9.99):
        result = rank(score)
        assert result.percentile is result.top_percent is None
    assert rank(9.99).unavailable_reason == "unsupported_tail"


@pytest.mark.parametrize(
    "section,field,value",
    [
        ("provenance", "data_kind", "synthetic_test"),
        ("provenance", "data_kind", "research_only"),
        ("provenance", "ranking_authorized", False),
        ("provenance", "aggregate_retention_authorized", False),
        ("provenance", "model_production_authorized", False),
        ("provenance", "adults_confirmed", False),
        ("provenance", "permission_reference", ""),
        ("qc", "status", "failed"),
        ("qc", "deduplication_version", ""),
    ],
)
def test_disallowed_cohorts_never_return_rank(section, field, value):
    ref = registry()
    ref["cohorts"][0][section][field] = value
    result = rank(5, ref)
    assert result.status == "unavailable"
    assert result.percentile is None


def test_registry_integrity_rechecked_at_rank_boundary():
    for change in ("count", "order", "nonfinite", "unknown", "duplicate"):
        ref = registry()
        cohort = ref["cohorts"][0]
        if change == "count":
            cohort["n_unique_subjects"] += 1
        elif change == "order":
            cohort["distribution"].reverse()
        elif change == "nonfinite":
            cohort["distribution"][0]["score"] = float("nan")
        elif change == "unknown":
            cohort["portraits"] = ["must-not-persist"]
        else:
            ref["cohorts"].append(copy.deepcopy(cohort))
        with pytest.raises(ReferenceDataError):
            validate_registry(ref)
        assert rank(5, ref).unavailable_reason == "invalid_reference"


def test_ingestion_deduplicates_transitive_subjects_and_near_duplicates_deterministically():
    data = rows()
    data[1]["subject_key"] = data[0]["subject_key"]
    data[2]["duplicate_cluster"] = data[1]["duplicate_cluster"]
    data[2]["prediction"] = prediction(8)
    a = build_reference(manifest(), data)
    b = build_reference(manifest(), reversed(data))
    assert a == b
    cohort = a["cohorts"][0]
    assert cohort["n_unique_subjects"] == 198
    assert cohort["distribution"][0] == {"score": 0, "count": 18}
    serialized = json.dumps(a)
    assert all(
        row[field] not in serialized
        for row in data
        for field in ("subject_key", "duplicate_cluster", "observation_key")
    )


@pytest.mark.parametrize("mutation", ["adult", "mismatch", "quality", "unknown", "duplicate_observation"])
def test_ingestion_rejects_unverified_records_without_echoing_identifiers(mutation):
    data = rows()
    if mutation == "adult":
        data[0]["adult_confirmed"] = False
    elif mutation == "mismatch":
        data[0]["prediction"]["crop_version"] = "wrong"
    elif mutation == "quality":
        data[0]["prediction"]["quality_flags"] = ["blur"]
    elif mutation == "unknown":
        data[0]["photo_path"] = "sensitive-photo.jpg"
    else:
        data[1]["observation_key"] = data[0]["observation_key"]
    with pytest.raises(ReferenceDataError) as exc:
        build_reference(manifest(), data)
    assert "subject-" not in str(exc.value)
    assert "sensitive-photo" not in str(exc.value)


def test_one_critical_path_import_reload_rank_and_empty_production_registry(tmp_path):
    metadata, source, output = [tmp_path / name for name in ("manifest.json", "predictions.jsonl", "aggregate.json")]
    metadata.write_text(json.dumps(manifest()))
    source.write_text("\n".join(json.dumps(row) for row in rows()))
    command = [
        sys.executable,
        "-m",
        "aesthetic_passport.attractiveness_rank",
        "--manifest",
        str(metadata),
        "--predictions",
        str(source),
        "--out",
        str(output),
    ]
    run = subprocess.run(command, capture_output=True, text=True, check=False)
    assert run.returncode == 0, run.stderr
    assert run.stdout == ""
    result = rank(5, load_registry(output))
    assert (result.status, result.percentile, result.top_percent) == ("available", 60, 40)
    assert "subject-0" not in output.read_text()
    blocked = rank_prediction(prediction(), load_registry(), cohort_id="test-only", distribution_version="test-1")
    assert blocked.status == "unavailable" and blocked.percentile is None
    assert not list(Path("config").glob("*test-only*"))
