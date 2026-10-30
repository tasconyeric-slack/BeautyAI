"""Research photo CLI on the production-packaged lightweight Ridge loader."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from aesthetic_passport.attractiveness.artifact import (  # noqa: F401 -- historical experiment API
    FEATURES,
    FORMAT,
    load_artifact,
    make_artifact,
    predict_features,
    save_artifact,
    validate_artifact,
)

from . import preprocess as pp


def predict_photo(photo: str | Path, artifact_path: str | Path) -> dict[str, Any]:
    """One local face only. Fail closed; NEVER expose a fabricated 1–10 score."""
    result: dict[str, Any] = {
        "status": "unavailable", "score": None, "research_only": True,
        "method": FORMAT, "percentile": None,
    }
    try:
        artifact = load_artifact(artifact_path)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        return {**result, "reason": "ridge_artifact_unavailable", "detail": type(exc).__name__}
    try:
        im = pp.load_rgb(photo)
    except pp.ImageUnreadable:
        return {**result, "reason": "unreadable_image"}
    face = pp.detect_face(im)
    if not face.checked:
        return {**result, "reason": "face_detector_unavailable"}
    if face.count != 1 or face.landmarks is None:
        return {**result, "reason": "requires_exactly_one_face"}
    summary, features = pp.geometry(face)
    if not summary or summary["status"] != "full" or features is None:
        return {**result, "reason": "geometry_quality_limited"}
    score = predict_features(features, artifact)
    return {
        **result, "status": "ok", "score": round(score, 3), "reason": None,
        "target": artifact["target"], "feature_count": len(FEATURES),
        "scoring_version": summary["scoring_version"],
        "caveat": "Research model prediction on the dataset's native rater scale; not a population percentile.",
    }
