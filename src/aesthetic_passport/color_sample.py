"""Measured color signals on the front photo (MVP_BRIEF §6.3, D15). CV layer → `color_measurements`.

Independent implementation of the regional-median idea: skin (both cheeks), brows, irises, lips and hair, each
reduced to a median in CIE Lab (L 0–100, a/b signed). No white-balance calibration: `reliability` comes from
lighting consistency, clipped highlights and face luminance. These numbers are inputs to the model and the
rules (C12); the product never presents them as a diagnosis.
"""
from __future__ import annotations

import math
from typing import Any

import cv2
import numpy as np

from .cv import (
    LEFT_BROW,
    LEFT_EYE,
    LEFT_IRIS,
    LIPS_INNER,
    LIPS_OUTER,
    MODELS,
    RIGHT_BROW,
    RIGHT_EYE,
    RIGHT_IRIS,
    SEG_FACE_SKIN,
    SEG_HAIR,
    Face,
    hull_mask,
    polygon_mask,
)
from .qc import load_qc_config

REGIONS = ("skin", "brow", "iris", "lip", "hair")


def to_lab(rgb: np.ndarray) -> np.ndarray:
    """uint8 RGB (…×3) → float Lab with L in 0–100 and signed a/b."""
    return cv2.cvtColor(rgb.astype(np.float32) / 255.0, cv2.COLOR_RGB2LAB)


def lab_to_hex(lab: tuple[float, float, float]) -> str:
    px = np.array([[lab]], dtype=np.float32)
    r, g, b = (np.clip(cv2.cvtColor(px, cv2.COLOR_LAB2RGB)[0, 0], 0, 1) * 255).round().astype(int)
    return f"#{r:02X}{g:02X}{b:02X}"


def _keep_percentiles(lab_px: np.ndarray, lo: float, hi: float) -> np.ndarray:
    if len(lab_px) == 0:
        return lab_px
    p_lo, p_hi = np.percentile(lab_px[:, 0], [lo, hi])
    return lab_px[(lab_px[:, 0] >= p_lo) & (lab_px[:, 0] <= p_hi)]


def region_masks(face: Face, seg: np.ndarray, cfg: dict) -> dict[str, np.ndarray]:
    """Boolean masks per region (exposed for the debug overlay)."""
    cs = cfg["color_sampling"]
    shape = seg.shape[:2]
    skin = seg == SEG_FACE_SKIN
    cheek_w = float(np.linalg.norm(face.pts(234) - face.pts(454)))
    r = cs["cheek_radius_frac"] * cheek_w
    cheeks = np.zeros(shape, np.uint8)
    centre_x = float(face.pts(1)[0])  # nose tip: the face's vertical midline
    for eye_outer, mouth in ((33, 61), (263, 291)):
        c = (face.pts(eye_outer) + face.pts(mouth)) / 2
        c[0] += math.copysign(cs["cheek_outward_frac"] * cheek_w, c[0] - centre_x)
        cv2.circle(cheeks, (int(c[0]), int(c[1])), int(r), 255, -1)

    brows = (hull_mask(shape, face.pts(LEFT_BROW)) | hull_mask(shape, face.pts(RIGHT_BROW))) > 0
    lips = (polygon_mask(shape, face.pts(LIPS_OUTER)) > 0) & ~(polygon_mask(shape, face.pts(LIPS_INNER)) > 0)

    iris = np.zeros(shape, bool)
    lo, hi = cs["iris_radius_keep"]
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    for ring, centre_idx, eye in ((LEFT_IRIS, 473, LEFT_EYE), (RIGHT_IRIS, 468, RIGHT_EYE)):
        cx, cy = face.pts(centre_idx)
        rad = float(np.linalg.norm(face.pts(ring) - face.pts(centre_idx), axis=1).mean())
        d = np.hypot(xx - cx, yy - cy)
        iris |= (d >= lo * rad) & (d <= hi * rad) & (hull_mask(shape, face.pts(eye)) > 0)  # eyelids clip the circle

    return {"skin": (cheeks > 0) & skin, "brow": brows, "iris": iris, "lip": lips, "hair": seg == SEG_HAIR}


def _median(lab_px: np.ndarray) -> tuple[float, float, float]:
    m = np.median(lab_px, axis=0)
    return float(m[0]), float(m[1]), float(m[2])


def measure_colors(rgb: np.ndarray, face: Face, *, lighting_consistency: str, clipped_frac: float | None,
                   face_luma: float | None, cfg: dict | None = None, seg: np.ndarray | None = None) -> dict[str, Any] | None:
    cfg = cfg or load_qc_config()
    cs = cfg["color_sampling"]
    seg = MODELS.segment(rgb) if seg is None else seg
    lab = to_lab(rgb)
    masks = region_masks(face, seg, cfg)

    regions: dict[str, Any] = {}
    for name in REGIONS:
        px = lab[masks[name]]
        if name == "skin":
            px = _keep_percentiles(px, *cs["skin_L_keep"])
        elif name == "hair":
            px = _keep_percentiles(px, *cs["hair_L_keep"])
        elif name == "brow" and len(px):
            px = px[px[:, 0] <= np.percentile(px[:, 0], 100 * cs["brow_darkest_frac"])]
        elif name == "iris" and len(px):
            px = px[px[:, 0] <= np.percentile(px[:, 0], 90)]  # drop catch-lights
        if len(px) < cs["min_pixels"][name]:
            regions[name] = None
            continue
        L, a, b = _median(px)
        regions[name] = {"lab": {"L": round(L, 1), "a": round(a, 1), "b": round(b, 1)},
                         "hex": lab_to_hex((L, a, b)), "n_pixels": len(px)}

    skin = regions["skin"]
    if skin is None:
        return None
    sL, sa, sb = skin["lab"]["L"], skin["lab"]["a"], skin["lab"]["b"]

    rc = cs["reliability"]
    level = {"high": 2, "medium": 1, "low": 0, "unknown": 1}[lighting_consistency]
    notes = []
    if lighting_consistency in ("medium", "low", "unknown"):
        notes.append(f"lighting consistency {lighting_consistency}")
    if clipped_frac is not None and clipped_frac > rc["clipped_frac_low"]:
        level, _ = 0, notes.append("many clipped highlights")
    elif clipped_frac is not None and clipped_frac > rc["clipped_frac_medium"]:
        level, _ = min(level, 1), notes.append("some clipped highlights")
    if face_luma is not None and not (rc["face_luma_ok"][0] <= face_luma <= rc["face_luma_ok"][1]):
        level, _ = min(level, 1), notes.append(f"face luma {face_luma:.0f}")
    notes.append("phone white balance is uncalibrated: relative signal only")

    brow = regions["brow"]
    return {
        "method": "regional_lab_median",
        "source_photo": "front",
        "regions": regions,
        "warmth_b": round(sb, 1),
        "depth_L": round(sL, 1),
        "chroma_C": round(math.hypot(sa, sb), 1),
        "skin_brow_contrast_dL": round(sL - brow["lab"]["L"], 1) if brow else None,
        "reliability": ["low", "medium", "high"][level],
        "notes": "; ".join(notes)[:200],
    }


def debug_overlay(rgb: np.ndarray, face: Face, cfg: dict | None = None) -> np.ndarray:
    """RGB image with each sampling region tinted, for visual verification."""
    cfg = cfg or load_qc_config()
    masks = region_masks(face, MODELS.segment(rgb), cfg)
    out = rgb.astype(np.float32).copy()
    tints = {"skin": (255, 0, 0), "brow": (0, 200, 255), "iris": (0, 255, 0), "lip": (255, 0, 255), "hair": (255, 200, 0)}
    for name, m in masks.items():
        out[m] = 0.45 * out[m] + 0.55 * np.array(tints[name], np.float32)
    return out.clip(0, 255).astype(np.uint8)
