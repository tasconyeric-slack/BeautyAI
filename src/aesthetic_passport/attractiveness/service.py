"""Ridge on the existing PhotoCheck measurements, with independent authorization gates."""
from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any

import yaml

from ..attractiveness_rank import rank_prediction, validate_registry
from ..attractiveness_rank.tiers import tier_for_rank
from ..runtime import is_production
from .artifact import predict_features, validate_artifact
from .distribution import density_curve
from .features import from_geometry

ROOT = Path(__file__).resolve().parents[3]


def load_config() -> dict[str, Any]:
    return yaml.safe_load((ROOT / "config/attractiveness.yaml").read_text(encoding="utf-8"))


def identity(cfg: dict[str, Any]) -> dict[str, Any]:
    return {"model_id": cfg["model_id"], "checkpoint_id": "sha256:" + cfg["artifact_sha256"],
                "preprocessing_version": cfg["preprocessing_version"], "crop_version": cfg["crop_version"],
                "native_scale_id": cfg["native_scale_id"], "calibration_version": None}


def verified_artifact(cfg: dict[str, Any]) -> dict[str, Any]:
    path = Path(os.environ.get("BEAUTYAI_RIDGE_ARTIFACT", ROOT / cfg["artifact_path"]))
    content = path.read_bytes()
    if hashlib.sha256(content).hexdigest() != cfg["artifact_sha256"]:
        raise ValueError("model_hash_mismatch")
    artifact = json.loads(content)
    if not isinstance(artifact, dict):
        raise ValueError("model_incompatible")  # noqa: TRY004 -- safe boundary error
    validate_artifact(artifact)
    if artifact["target"]["label_range"] != cfg["native_bounds"]:
        raise ValueError("model_scale_mismatch")
    return artifact


def display_score(raw: float, native: list[float], display: list[float]) -> float:
    return display[0] + (raw - native[0]) * (display[1] - display[0]) / (native[1] - native[0])


def verified_reference(cfg: dict[str, Any]) -> dict[str, Any]:
    content = Path(os.environ.get("BEAUTYAI_RIDGE_REFERENCE", ROOT / cfg["reference_path"])).read_bytes()
    if hashlib.sha256(content).hexdigest() != cfg["reference_sha256"]:
        raise ValueError("reference_hash_mismatch")
    registry = json.loads(content)
    validate_registry(registry)
    return registry


def production_authorized(cfg: dict[str, Any]) -> bool:
    """A private, model-specific permission receipt, independent of research switches."""
    try:
        receipt = json.loads(Path(os.environ["BEAUTYAI_RIDGE_AUTHORIZATION"]).read_text(encoding="utf-8"))
        return (receipt["identity"] == identity(cfg) and receipt["scoring_authorized"] is True
                and isinstance(receipt["permission_reference"], str) and bool(receipt["permission_reference"].strip()))
    except (KeyError, OSError, ValueError, TypeError):
        return False


def evaluate(front: Any, geometry: dict[str, Any] | None) -> tuple[dict[str, Any], dict[str, Any]]:
    cfg = load_config()
    mode = os.environ.get("BEAUTYAI_RIDGE_MODE", "off")
    research = mode == "research" and not is_production()
    authorized = mode == "production" and production_authorized(cfg)
    score = dict(contract_version="learned-attractiveness-1", **identity(cfg), status="unavailable",
                 raw_score=None, production_authorized=authorized, quality_flags=[], unavailable_reason=None)
    detail = {"native_label_range": cfg["native_bounds"], "display_score": None, "display_range": cfg["display_bounds"],
                  "display_transform": cfg["display_version"], "qc_status": "unavailable", "inference_ms": None,
                  "research_only": not authorized, "provenance": "cv_geometry_ridge_regression",
                  "limitations": ["predicts_scut_rater_panel", "linear_display_not_psl_calibration",
                               "geometry_only_not_whole_appearance"]}
    rank = {"status": "unavailable", "percentile": None, "top_percent": None, "cohort_id": None, "cohort_label": None,
                "n_unique_subjects": None, "distribution_version": None, "method": "empirical_cdf_midrank_v1",
                "limitations": ["not_a_population_rank"], "unavailable_reason": "score_unavailable",
                "percentile_interval": None, "display_step_percent": None, "reference_unit": "subject",
                "n_reference": None, "research_only": research, "tier": None, "distribution": None}

    def unavailable(reason: str):
        score["unavailable_reason"] = reason
        rank["unavailable_reason"] = reason
        return score | detail, rank

    if mode not in ("research", "production"):
        return unavailable("model_disabled")
    if mode == "research" and is_production():
        return unavailable("research_disabled_in_production")
    if mode == "production" and not authorized:
        return unavailable("model_not_authorized")
    try:
        artifact = verified_artifact(cfg)
    except OSError:
        return unavailable("model_missing")
    except (ValueError, TypeError, KeyError):
        return unavailable("model_incompatible")
    if front is None or front.face is None:
        return unavailable("no_landmarks")
    flags = sorted(set(front.issues + (geometry or {}).get("quality_flags", [])))
    score["quality_flags"] = flags
    if front.status == "reject" or flags or not geometry or geometry["status"] != "full":
        detail["qc_status"] = "limited"
        return unavailable("image_quality_limited")
    if geometry["scoring_version"] != cfg["geometry_version"]:
        return unavailable("feature_version_mismatch")
    try:
        start = time.perf_counter()
        raw = predict_features(from_geometry(geometry, front.yaw, front.pitch), artifact)
        detail.update(inference_ms=round((time.perf_counter() - start) * 1000, 3), qc_status="passed",
                      display_score=round(display_score(raw, cfg["native_bounds"], cfg["display_bounds"]), 1))
        score.update(status="research_only" if research else "ok", raw_score=raw)
    except (ValueError, TypeError, KeyError):
        return unavailable("features_unavailable")
    try:
        registry = verified_reference(cfg)
    except (ValueError, OSError):
        registry = None
    result = rank_prediction(score, registry, cohort_id=cfg["reference_id"],
                             distribution_version=cfg["reference_version"], research_mode=research)
    rank = json.loads(json.dumps(asdict(result)))
    tier = tier_for_rank(result)
    rank["tier"] = asdict(tier) if tier else None
    rank["distribution"] = None
    if result.status == "available":
        cohort = next(c for c in registry["cohorts"] if c["cohort_id"] == result.cohort_id
                      and c["distribution_version"] == result.distribution_version)
        curve_cfg = cfg["reference_curve"]
        rank["distribution"] = density_curve(cohort["distribution"], native=cfg["native_bounds"],
                                              display=cfg["display_bounds"], points=curve_cfg["points"],
                                              min_bandwidth=curve_cfg["min_bandwidth_native"])
    return score | detail, rank
