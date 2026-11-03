"""Version-matched sample ranking with opt-in continuous Ridge tail estimates."""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import yaml

from .continuous import continuous_rank
from .contracts import ModelResult, RankResult, ReferenceRegistry
from .reference import IDENTITY_FIELDS, ROOT, ReferenceDataError, cohort_blocker, model_blocker, validate_registry


@dataclass(frozen=True)
class RankPolicy:
    min_unique_subjects: int
    min_tail_observations: int
    min_distinct_scores: int
    fine_precision_min_subjects: int
    coarse_step_percent: int
    fine_step_percent: int
    uncertainty_alpha: float
    continuous_model_id: str
    continuous_distribution_version: str
    tail_fit_low: float
    tail_fit_high: float
    tail_join_quantile: float


def load_policy(path: str | Path | None = None) -> RankPolicy:
    try:
        data = yaml.safe_load(Path(path or ROOT / "config/attractiveness_rank.yaml").read_text(encoding="utf-8"))
        if data.pop("policy_version") != "attractiveness-rank-1":
            raise ValueError
        policy = RankPolicy(**data)
        integer_fields = ["min_unique_subjects", "min_tail_observations", "min_distinct_scores",
                          "fine_precision_min_subjects", "coarse_step_percent", "fine_step_percent"]
        if any(type(data[key]) is not int or data[key] <= 0 for key in integer_fields):
            raise ValueError
        if not 0 < policy.uncertainty_alpha < 1 or type(policy.uncertainty_alpha) is bool:
            raise ValueError
        if not .5 < policy.tail_fit_low < policy.tail_join_quantile < policy.tail_fit_high < 1:
            raise ValueError
        if not all(isinstance(data[k], str) and data[k] for k in
                   ("continuous_model_id", "continuous_distribution_version")):
            raise ValueError
        if policy.fine_precision_min_subjects < policy.min_unique_subjects:
            raise ValueError
        if not 0 < policy.fine_step_percent <= policy.coarse_step_percent <= 100:
            raise ValueError
        if any(100 % step for step in (policy.fine_step_percent, policy.coarse_step_percent)):
            raise ValueError
        return policy
    except (OSError, ValueError, TypeError, KeyError, AttributeError, yaml.YAMLError):
        raise ReferenceDataError("invalid_rank_policy") from None


DEFAULT_POLICY = load_policy()


def rank_prediction(
    prediction: ModelResult,
    registry: ReferenceRegistry | None,
    *,
    cohort_id: str,
    distribution_version: str,
    policy: RankPolicy = DEFAULT_POLICY,
    research_mode: bool = False,
    image_reference_authorized: bool = False,
) -> RankResult:
    """No numerical fields on any unavailable path. Inputs are never mutated."""
    context = {"cohort_id": cohort_id, "distribution_version": distribution_version, "research_only": research_mode}

    def unavailable(reason: str) -> RankResult:
        return RankResult(status="unavailable", unavailable_reason=reason, **context)

    blocker = model_blocker(prediction, research_mode=research_mode)
    if blocker:
        return unavailable(blocker)
    if registry is None:
        return unavailable("reference_missing")
    try:
        validate_registry(registry)
    except ReferenceDataError:
        return unavailable("invalid_reference")
    matches = [c for c in registry["cohorts"] if c["cohort_id"] == cohort_id]
    if not matches:
        return unavailable("reference_missing")
    cohort = next((c for c in matches if c["distribution_version"] == distribution_version), None)
    if cohort is None:
        return unavailable("reference_version_missing")
    context.update(cohort_label=cohort["cohort_label"], n_unique_subjects=cohort["n_unique_subjects"])
    blocker = cohort_blocker(cohort, research_mode=research_mode,
                             image_reference_authorized=image_reference_authorized)
    if blocker:
        return unavailable(blocker)
    if any(prediction[key] != cohort["identity"][key] for key in IDENTITY_FIELDS):
        return unavailable("model_reference_mismatch")
    n = cohort.get("n_observations") if cohort.get("reference_unit") == "image" else cohort["n_unique_subjects"]
    context.update(n_reference=n, reference_unit=cohort.get("reference_unit", "subject"))
    if n < policy.min_unique_subjects:
        return unavailable("reference_too_small")
    if len(cohort["distribution"]) < policy.min_distinct_scores:
        return unavailable("reference_insufficient_variation")
    score = prediction["raw_score"]
    assert score is not None  # model_blocker checked this boundary
    lo, hi = cohort["native_score_bounds"]
    if not lo <= score <= hi:
        return unavailable("score_out_of_native_scale")
    if (prediction["model_id"] == policy.continuous_model_id
            and distribution_version == policy.continuous_distribution_version):
        try:
            top, estimated = continuous_rank(cohort["distribution"], score, policy.tail_fit_low,
                                             policy.tail_fit_high, policy.tail_join_quantile)
        except (ValueError, ZeroDivisionError):
            return unavailable("invalid_tail_reference")
        limitations = ("named_reference_sample_only", "not_a_population_rank", cohort["sampling"])
        if estimated:
            limitations += ("model_estimated_tail", "tail_fit_uncertainty_not_quantified")
        if cohort.get("reference_unit") == "image":
            limitations += ("image_independence_and_ages_unverified",)
        return RankResult(status="available", percentile=100 - top, top_percent=top,
                          method="ridge_ecdf_normal_tail_v1", limitations=limitations, **context)
    lower = sum(point["count"] for point in cohort["distribution"] if point["score"] < score)
    equal = sum(point["count"] for point in cohort["distribution"] if point["score"] == score)
    position = lower + equal / 2
    if min(position, n - position) < policy.min_tail_observations:
        return unavailable("unsupported_tail")
    step = policy.fine_step_percent if n >= policy.fine_precision_min_subjects else policy.coarse_step_percent
    percentile = 100 * position / n
    displayed = math.floor(percentile / step + 0.5) * step
    # Never render an empirical estimate as top 0% / 100%, even after rounding.
    if not step <= displayed <= 100 - step:
        return unavailable("unsupported_display_tail")
    error_pp = 100 * math.sqrt(math.log(2 / policy.uncertainty_alpha) / (2 * n))
    interval = (
        max(0, math.floor((percentile - error_pp) / step) * step),
        min(100, math.ceil((percentile + error_pp) / step) * step),
    )
    return RankResult(
        status="available",
        percentile=displayed,
        top_percent=100 - displayed,
        percentile_interval=interval,
        display_step_percent=step,
        limitations=(
            "named_reference_sample_only",
            "not_a_population_rank",
            cohort["sampling"],
            "sampling_band_excludes_selection_bias_and_model_error",
        ) + (("image_independence_and_ages_unverified",) if cohort.get("reference_unit") == "image" else ()),
        **context,
    )
