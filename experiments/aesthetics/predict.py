"""Single-portrait prediction. Prints one JSON object; writes nothing to disk unless --out is given.

Status vocabulary (exit code): ok (0) · no_face / unreadable_image (2, input problem) ·
model_unavailable / model_incompatible / dependency_missing (3, local prerequisite missing) · error (1).
A score is only ever reported with status "ok".
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from . import TOOL_VERSION
from . import preprocess as pp
from .model import LABEL_SCALE, METHOD, MEBeautyDinoV2, ModelUnavailable
from .runtime import peak_rss_mb

EXIT = {pp.OK: 0, pp.NO_FACE: 2, pp.UNREADABLE: 2, pp.MODEL_UNAVAILABLE: 3, pp.MODEL_INCOMPATIBLE: 3,
        pp.DEPENDENCY_MISSING: 3, pp.ERROR: 1}

NOTE = ("raw_score predicts how the MEBeauty rater panel would rate this photo on its 1–10 beauty_score scale. It is "
        "not an objective measure, not a population rank, and not comparable with SCUT-FBP5500 (1–5) or the product's "
        "geometric harmony score (0–100). Research-only weights; non-commercial dataset terms apply.")


def _skeleton(crop: str, margin: float, flip: bool) -> dict[str, Any]:
    return {"tool": "experiments.aesthetics", "tool_version": TOOL_VERSION, "status": None,
            "model_version": f"mebeauty-fbp/{METHOD}@not-loaded", "dataset": LABEL_SCALE["dataset"],
            "label_scale": dict(LABEL_SCALE), "raw_score": None, "raw_score_unclipped": None,
            "preprocessing": pp.preprocessing_details({"crop_mode": crop, "crop_margin": margin}, flip),
            "face": None, "model": None, "runtime": {}, "error": None, "prerequisite": None, "note": NOTE}


def predict_photo(photo: str | Path, *, weights: str | None = None, crop: str = "face", margin: float = 0.25,
                  flip: bool = True, face_check: bool = True, device: str = "cpu", threads: int | None = None,
                  backbone_config: str | None = None, model_config: str | None = None,
                  model: MEBeautyDinoV2 | None = None) -> dict[str, Any]:
    out = _skeleton(crop, margin, flip)
    t0 = time.perf_counter()

    def done(status: str, error: str | None = None, prerequisite: str | None = None) -> dict[str, Any]:
        out.update(status=status, error=error, prerequisite=prerequisite)
        out["runtime"].update(total_s=round(time.perf_counter() - t0, 3), peak_rss_mb=peak_rss_mb())
        return out

    try:
        im = pp.load_rgb(photo)
    except pp.ImageUnreadable as e:
        return done(pp.UNREADABLE, f"could not decode image ({e})")

    face = pp.FaceInfo(checked=False, reason="disabled by --no-face-check")
    if face_check or crop == "face":
        t = time.perf_counter()
        face = pp.detect_face(im)
        out["runtime"]["face_check_s"] = round(time.perf_counter() - t, 3)
    out["face"] = face.summary()
    if face.checked and face.count == 0:
        return done(pp.NO_FACE, "no face detected; no score is produced for non-face input")
    if not face.checked and crop == "face":
        return done(pp.DEPENDENCY_MISSING, f"face crop needs the face detector: {face.reason}",
                    "make install && make models (MediaPipe face_landmarker.task in models/)")

    try:
        cropped, crop_details = pp.crop_for_model(im, face, crop, margin)
    except ValueError as e:
        return done(pp.ERROR, str(e))
    out["preprocessing"] = pp.preprocessing_details(crop_details, flip)
    if not face.checked:
        out["preprocessing"]["face_presence"] = "not verified"

    try:
        if model is None:
            model = MEBeautyDinoV2(weights, backbone_config=backbone_config, model_config=model_config,
                                   device=device, threads=threads)
            out["runtime"]["model_load_s"] = model.load_seconds
    except ModelUnavailable as e:
        return done(e.status, str(e), e.prerequisite)
    out["model_version"] = model.model_version
    out["model"] = model.describe()
    out["label_scale"].update(min=model.score_range[0], max=model.score_range[1])

    t = time.perf_counter()
    clipped, raw = model.predict(pp.to_model_input(cropped)[None], flip=flip)
    out["runtime"]["inference_s"] = round(time.perf_counter() - t, 3)
    out["raw_score"] = round(float(clipped[0]), 4)
    out["raw_score_unclipped"] = round(float(raw[0]), 4)
    return done(pp.OK)
