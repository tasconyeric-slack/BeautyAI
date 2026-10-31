"""Strict boundaries for aggregate references; never accept person records here."""

from __future__ import annotations

import itertools
import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any, cast

from jsonschema import Draft202012Validator, ValidationError

from .contracts import ModelResult, ReferenceCohort, ReferenceRegistry

ROOT = Path(__file__).resolve().parents[3]
_SCHEMA = json.loads((ROOT / "config/attractiveness_reference.schema.json").read_text(encoding="utf-8"))
IDENTITY_FIELDS = (
    "model_id",
    "checkpoint_id",
    "preprocessing_version",
    "crop_version",
    "native_scale_id",
    "calibration_version",
)


class ReferenceDataError(ValueError):
    """Safe reason code, without input values, paths or person identifiers."""


@lru_cache(maxsize=8)
def _validator(kind: str) -> Draft202012Validator:
    return Draft202012Validator({"$ref": f"#/$defs/{kind}", "$defs": _SCHEMA["$defs"]})


def _finite_numbers(value: Any) -> bool:
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, dict):
        return all(_finite_numbers(item) for item in value.values())
    if isinstance(value, list):
        return all(_finite_numbers(item) for item in value)
    return True


def validate_boundary(value: Any, kind: str) -> None:
    try:
        _validator(kind).validate(value)
        if not _finite_numbers(value):
            raise ReferenceDataError(f"invalid_{kind}")
    except (ValidationError, TypeError, ValueError, OverflowError):
        raise ReferenceDataError(f"invalid_{kind}") from None


def model_blocker(prediction: ModelResult, *, research_mode: bool = False) -> str | None:
    try:
        validate_boundary(prediction, "model_result")
    except ReferenceDataError:
        return "invalid_model_result"
    if prediction["status"] == "research_only" and not research_mode:
        return "model_research_only"
    if prediction["production_authorized"] is not True and not research_mode:
        return "model_not_authorized"
    allowed = ("ok", "research_only") if research_mode else ("ok",)
    if (prediction["status"] not in allowed or prediction["unavailable_reason"]
            or prediction["raw_score"] is None):
        return "model_unavailable"
    # Conservative until #13 supplies an explicit allowlist of harmless flags.
    if prediction["quality_flags"]:
        return "image_quality_limited"
    return None


def cohort_blocker(cohort: dict[str, Any], *, research_mode: bool = False) -> str | None:
    provenance = cohort["provenance"]
    if research_mode and provenance["data_kind"] == "research_only":
        if (provenance.get("research_authorized") is not True
                or provenance["ranking_authorized"] is not True
                or provenance["aggregate_retention_authorized"] is not True):
            return "cohort_not_authorized"
        if cohort["qc"]["status"] != "passed":
            return "cohort_qc_failed"
        return None
    if cohort.get("reference_unit", "subject") != "subject":
        return "cohort_subjects_unverified"
    if provenance["data_kind"] != "real_adult" or not all(
        provenance[key] is True
        for key in (
            "ranking_authorized",
            "aggregate_retention_authorized",
            "model_production_authorized",
            "adults_confirmed",
        )
    ):
        return "cohort_not_authorized"
    if cohort["qc"]["status"] != "passed":
        return "cohort_qc_failed"
    return None


def validate_cohort(cohort: ReferenceCohort) -> None:
    validate_boundary(cohort, "cohort")
    lo, hi = cohort["native_score_bounds"]
    dist = cohort["distribution"]
    if lo >= hi or any(not lo <= point["score"] <= hi for point in dist):
        raise ReferenceDataError("invalid_score_bounds")
    if any(a["score"] >= b["score"] for a, b in itertools.pairwise(dist)):
        raise ReferenceDataError("invalid_distribution_order")
    n = cohort.get("n_observations") if cohort.get("reference_unit") == "image" else cohort["n_unique_subjects"]
    if type(n) is not int or n < 1:
        raise ReferenceDataError("invalid_reference_size")
    if cohort.get("reference_unit") == "image" and cohort["n_unique_subjects"] is not None:
        raise ReferenceDataError("unverified_subject_count")
    summary = cohort["import_summary"]
    if sum(point["count"] for point in dist) != n:
        raise ReferenceDataError("invalid_distribution_count")
    if summary["records_received"] - summary["duplicates_removed"] != n:
        raise ReferenceDataError("invalid_import_count")


def validate_registry(registry: ReferenceRegistry) -> None:
    validate_boundary(registry, "registry")
    keys = set()
    for cohort in registry["cohorts"]:
        validate_cohort(cohort)
        key = (cohort["cohort_id"], cohort["distribution_version"])
        if key in keys:
            raise ReferenceDataError("duplicate_reference_version")
        keys.add(key)


def load_registry(path: str | Path | None = None) -> ReferenceRegistry:
    try:
        registry = json.loads(Path(path or ROOT / "config/attractiveness_reference.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise ReferenceDataError("reference_unreadable") from None
    validate_registry(registry)
    return cast(ReferenceRegistry, registry)


def empirical_quantile(cohort: ReferenceCohort, probability: float) -> float:
    """Generalized inverse ECDF, selecting an observed score; no tail extrapolation."""
    validate_cohort(cohort)
    if isinstance(probability, bool) or not isinstance(probability, (int, float)):
        raise ReferenceDataError("invalid_quantile_probability")
    if not math.isfinite(probability) or not 0 <= probability <= 1:
        raise ReferenceDataError("invalid_quantile_probability")
    n = cohort["n_observations"] if cohort.get("reference_unit") == "image" else cohort["n_unique_subjects"]
    assert n is not None  # validate_cohort checked the selected reference unit
    target = max(1, math.ceil(probability * n))
    cumulative = 0
    for point in cohort["distribution"]:
        cumulative += point["count"]
        if cumulative >= target:
            return point["score"]
    raise ReferenceDataError("invalid_distribution_count")
