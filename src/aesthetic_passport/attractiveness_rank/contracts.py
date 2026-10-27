"""Ranking-side stub for #13's versioned result; no model-runtime imports."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, TypedDict


class ModelIdentity(TypedDict):
    model_id: str
    checkpoint_id: str
    preprocessing_version: str
    crop_version: str
    native_scale_id: str
    calibration_version: str | None


class ModelResult(ModelIdentity):
    contract_version: Literal["learned-attractiveness-1"]
    status: Literal["ok", "unavailable", "research_only"]
    raw_score: float | None
    production_authorized: bool
    quality_flags: list[str]
    unavailable_reason: str | None


class Provenance(TypedDict):
    data_kind: Literal["real_adult", "synthetic_test", "research_only"]
    source_reference: str
    license_id: str
    permission_reference: str
    ranking_authorized: bool
    aggregate_retention_authorized: bool
    model_production_authorized: bool
    adults_confirmed: bool


class RankingQC(TypedDict):
    status: Literal["passed", "pending", "failed"]
    evidence_reference: str
    deduplication_version: str


class CohortManifest(TypedDict):
    cohort_id: str
    cohort_label: str
    distribution_version: str
    definition: str
    sampling: Literal["self_selected", "convenience", "probability_sample"]
    identity: ModelIdentity
    native_score_bounds: list[float]
    provenance: Provenance
    qc: RankingQC


class ScoreCount(TypedDict):
    score: float
    count: int


class ImportSummary(TypedDict):
    records_received: int
    duplicates_removed: int


class ReferenceCohort(CohortManifest):
    n_unique_subjects: int
    distribution: list[ScoreCount]
    import_summary: ImportSummary


class ReferenceRegistry(TypedDict):
    registry_version: Literal["attractiveness-reference-1"]
    unavailable_reason: str | None
    cohorts: list[ReferenceCohort]


class ReferenceObservation(TypedDict):
    subject_key: str
    duplicate_cluster: str
    observation_key: str
    adult_confirmed: bool
    prediction: ModelResult


@dataclass(frozen=True)
class RankResult:
    status: Literal["available", "unavailable"]
    percentile: float | None = None
    top_percent: float | None = None
    cohort_id: str | None = None
    cohort_label: str | None = None
    n_unique_subjects: int | None = None
    distribution_version: str | None = None
    method: str = "empirical_cdf_midrank_v1"
    limitations: tuple[str, ...] = ("named_reference_sample_only", "not_a_population_rank")
    unavailable_reason: str | None = None
    percentile_interval: tuple[float, float] | None = None
    display_step_percent: int | None = None
