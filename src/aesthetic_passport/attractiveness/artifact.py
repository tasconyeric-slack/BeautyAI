"""Research-only portable geometry Ridge inference, using existing 17 landmark features.

This does not include trained parameters. Export them from an authorized local
evaluation run; never treat a missing artifact as a valid score or percentile.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np

from .features import FEATURES

FORMAT = "geometry-ridge-artifact-v1"


def _numeric_vector(values: Any, name: str) -> np.ndarray:
    if not isinstance(values, list) or len(values) != len(FEATURES):
        raise ValueError(f"{name} must have {len(FEATURES)} elements")
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) for v in values):
        raise ValueError(f"{name} must contain finite numbers")
    result = np.asarray(values, dtype=float)
    if not np.isfinite(result).all():
        raise ValueError(f"{name} must contain finite numbers")
    return result


def validate_artifact(artifact: dict[str, Any]) -> None:
    if artifact.get("format") != FORMAT or artifact.get("research_only") is not True:
        raise ValueError("unsupported or unmarked research-only Ridge artifact")
    if artifact.get("features") != list(FEATURES):
        raise ValueError("Ridge features or order do not match the current extractor")
    fit = artifact.get("fit")
    target = artifact.get("target")
    if not isinstance(fit, dict) or not isinstance(target, dict):
        raise ValueError("missing Ridge fit or target metadata")  # noqa: TRY004 -- stable boundary error
    _numeric_vector(fit.get("mu"), "mu")
    sd = _numeric_vector(fit.get("sd"), "sd")
    _numeric_vector(fit.get("w"), "w")
    if np.any(sd <= 0):
        raise ValueError("Ridge feature standard deviations must be positive")
    for name in ("b", "alpha"):
        value = fit.get(name)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"invalid {name}")
    if fit["alpha"] <= 0 or not isinstance(fit.get("n_train"), int) or fit["n_train"] < 30:
        raise ValueError("invalid Ridge fit metadata")
    bounds = target.get("label_range")
    if not isinstance(bounds, list) or len(bounds) != 2:
        raise ValueError("invalid target label range")
    lo, hi = bounds
    if any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) for x in (lo, hi)):
        raise ValueError("invalid target label range")
    if lo >= hi or not isinstance(target.get("dataset"), str) or not target["dataset"]:
        raise ValueError("invalid target metadata")


def make_artifact(fit: dict[str, Any], *, dataset: str, label_name: str,
                  label_range: tuple[float, float]) -> dict[str, Any]:
    """Serialize coefficients from an EXISTING fitted research evaluation."""
    artifact = {
        "format": FORMAT, "research_only": True, "features": list(FEATURES),
        "target": {"dataset": dataset, "label_name": label_name, "label_range": list(label_range)},
        "fit": {
            "mu": np.asarray(fit["mu"], dtype=float).tolist(),
            "sd": np.asarray(fit["sd"], dtype=float).tolist(),
            "w": np.asarray(fit["w"], dtype=float).tolist(),
            "b": float(fit["b"]), "alpha": float(fit["alpha"]),
            "n_train": int(fit["n_train"]),
            "cv_mae": fit.get("cv_mae"),
        },
    }
    validate_artifact(artifact)
    return artifact


def save_artifact(path: str | Path, artifact: dict[str, Any]) -> None:
    validate_artifact(artifact)
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_artifact(path: str | Path) -> dict[str, Any]:
    artifact = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(artifact, dict):
        raise ValueError("Ridge artifact must be an object")  # noqa: TRY004 -- stable boundary error
    validate_artifact(artifact)
    return artifact


def predict_features(features: list[float], artifact: dict[str, Any]) -> float:
    """Inference only; no training, labels, or model weight fitting."""
    validate_artifact(artifact)
    values = _numeric_vector(features, "features")
    f = artifact["fit"]
    model = {k: np.asarray(f[k], dtype=float) for k in ("mu", "sd", "w")}
    model["b"] = float(f["b"])
    lo, hi = artifact["target"]["label_range"]
    return float(np.clip(((values - model["mu"]) / model["sd"]) @ model["w"] + model["b"], lo, hi))

