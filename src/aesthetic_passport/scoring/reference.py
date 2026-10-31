"""D36's independent photo-sample ECDF. Never uses Ridge predictions or public score bins.

The existing rank boundary is reused through a private deterministic-formula identity
adapter; this does not produce a learned score or change the Passport's analysis.
"""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import asdict
from pathlib import Path
from typing import Any

from ..attractiveness.distribution import density_curve
from ..attractiveness_rank import rank_prediction, validate_registry
from ..runtime import is_production
from .engine import CONFIG_PATH, load_scoring_config

ROOT = Path(__file__).resolve().parents[3]


def geometry_identity() -> dict[str, Any]:
    return {"model_id": "deterministic-d36-geometry", "checkpoint_id": "sha256:" +
            hashlib.sha256(CONFIG_PATH.read_text(encoding="utf-8").encode("utf-8")).hexdigest(),
            "preprocessing_version": load_scoring_config()["version"],
            "crop_version": "photo-check-working-rgb-v1", "native_scale_id": "d36-geometry-0-100",
            "calibration_version": None}


def rank_geometry(score: dict[str, Any] | None, registry: dict[str, Any] | None, *,
                  research: bool = False, authorized: bool = False) -> dict[str, Any]:
    try:
        if registry is not None:
            validate_registry(registry)
            if len(registry["cohorts"]) != 1:
                registry = None
    except (ValueError, TypeError, KeyError):
        registry = None
    cohort = registry["cohorts"][0] if registry and registry.get("cohorts") else {}
    valid = bool(score and score.get("status") == "full"
                 and score.get("scoring_version") == load_scoring_config()["version"])
    prediction = {"contract_version": "learned-attractiveness-1", **geometry_identity(),
                  "status": "research_only" if research else "ok", "production_authorized": authorized,
                  "raw_score": score.get("overall_score") if valid and score else None,
                  "quality_flags": [], "unavailable_reason": None if valid else "geometry_quality_limited"}
    result = rank_prediction(prediction, registry, cohort_id=cohort.get("cohort_id", "geometry-reference"),
                             distribution_version=cohort.get("distribution_version", "missing"),
                             research_mode=research, image_reference_authorized=authorized)
    output = json.loads(json.dumps(asdict(result)))
    output["tier"] = None
    output["distribution"] = None
    if result.status == "available":
        cfg = load_scoring_config()["reference_curve"]
        output["distribution"] = density_curve(cohort["distribution"], native=[0, 100], display=[0, 10],
                                                points=cfg["points"], min_bandwidth=cfg["min_bandwidth_native"])
    return output


def evaluate_geometry_reference(score: dict[str, Any] | None) -> dict[str, Any]:
    """Missing reference or private hash-bound receipt always returns no numerical rank."""
    registry = None
    authorized = False
    research = os.environ.get("BEAUTYAI_GEOMETRY_REFERENCE_MODE") == "research" and not is_production()
    try:
        content = Path(os.environ.get("BEAUTYAI_GEOMETRY_REFERENCE",
                       ROOT / "models/aesthetics/geometry-reference/scut-heldout-geometry-v1.json")).read_bytes()
        registry = json.loads(content)
        validate_registry(registry)
        if len(registry["cohorts"]) != 1:
            raise ValueError("one_geometry_cohort_required")
        cohort = registry["cohorts"][0]
        receipt = json.loads(Path(os.environ["BEAUTYAI_GEOMETRY_REFERENCE_AUTHORIZATION"]).read_text(encoding="utf-8"))
        expected = {"scope": "production_geometry_photo_sample_comparison", "identity": geometry_identity(),
                    "reference_sha256": hashlib.sha256(content).hexdigest(),
                    "cohort_id": cohort["cohort_id"], "distribution_version": cohort["distribution_version"]}
        authorized = (all(receipt.get(k) == v for k, v in expected.items())
                      and receipt.get("ranking_authorized") is True
                      and receipt.get("aggregate_retention_authorized") is True
                      and isinstance(receipt.get("permission_reference"), str)
                      and bool(receipt["permission_reference"].strip()))
    except (OSError, KeyError, ValueError, TypeError, AttributeError):
        # A valid research registry may still be used without a production receipt.
        authorized = False
    return rank_geometry(score, registry, research=research, authorized=authorized)
