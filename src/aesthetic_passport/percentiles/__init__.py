"""Reference-cohort percentiles (Issue #41): overall score rank and 12 frontal-ratio rails from published aggregates.

Rules layer only — reads a score / landmarks, writes nothing back into `analysis`. All numbers are approximate
positions within a self-selected scanned cohort, never a population rank. Data: config/reference_distributions.json;
settings and the scoring_version gate: config/percentiles.yaml; method and sources: docs/scoring/REFERENCE_DISTRIBUTIONS.md.
"""
from .passport import reference_percentiles
from .ratios import compute_reference_ratios, ratio_percentile, ratio_rails
from .reference import ReferenceDataError, load_config, load_reference, score_anchors
from .score import check_scale_compatibility, fit_crosswalk, score_percentile, to_reference_scale

__all__ = [
    "ReferenceDataError", "check_scale_compatibility", "compute_reference_ratios", "fit_crosswalk", "load_config",
    "load_reference", "ratio_percentile", "ratio_rails", "reference_percentiles", "score_anchors", "score_percentile", "to_reference_scale",
]
