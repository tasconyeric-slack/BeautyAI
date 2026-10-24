"""Objective anchors on the front photo (MVP_BRIEF §6.2). CV layer → `anchors`.

Relative ratios in pixel space only. Never clamped: a ratio outside the schema's range means the measurement is not
trustworthy (bad landmarks, extreme pose), so anchors become null and the reason is returned as a warning.
"""
from __future__ import annotations

import math
from itertools import pairwise
from typing import Any

import numpy as np

from .cv import FACE_OVAL, LIPS_INNER, LIPS_OUTER, SEG_HAIR, Face
from .face_shape import classify
from .qc import load_qc_config

# Ordered contours for geometry export (MediaPipe FaceMesh). "_l" = image-left (the subject's right side).
EYE_L_RING = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
EYE_R_RING = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
BROW_L_RING = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
BROW_R_RING = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]
IRIS_L = (471, 469)   # horizontal extremes of the image-left iris (centre 468)
IRIS_R = (476, 474)   # image-right iris (centre 473)

# Schema ranges (passport.schema.json → anchors); out of range → anchors = null.
RANGES = {
    "face_length_width_ratio": (0.8, 2.2),
    "forehead": (0.4, 1.4),
    "jaw": (0.4, 1.4),
    "lower_to_mid_ratio": (0.5, 1.8),
    "intercanthal_to_eye_width": (0.5, 1.8),
}


def _d(face: Face, a: int, b: int) -> float:
    (x1, y1), (x2, y2) = face.pts(a), face.pts(b)
    return math.hypot(x1 - x2, y1 - y2)


def _hairline_y(face: Face, seg: np.ndarray | None, lm: dict[str, int]) -> tuple[float | None, bool]:
    """(hairline y, forehead occluded) from the hair segmentation along the face's centre column.

    Scans upward from the glabella: the first hair pixel is the hairline (or a fringe). A fringe that reaches below
    the forehead-top landmark counts as occluded: the upper third is then "not measured".
    """
    if seg is None:
        return None, False
    gx, gy = face.pts(lm["glabella"])
    ty = face.pts(lm["forehead_top"])[1]
    x = round(float(gx))
    if not 0 <= x < seg.shape[1]:
        return None, False
    col = seg[: int(gy), max(0, x - 2): x + 3]
    hair_rows = np.where((col == SEG_HAIR).mean(axis=1) > 0.5)[0]
    if hair_rows.size == 0:
        return None, False
    lowest = float(hair_rows.max())        # hair closest to the brows on the way up
    mid = _d(face, lm["glabella"], lm["subnasale"])
    if lowest > ty + 0.15 * mid:            # hair comes down over the forehead → fringe
        return None, True
    return lowest, False


def _extras(face: Face, lm: dict[str, int], cheek: float, eye_w: float, seg: np.ndarray | None) -> dict[str, Any]:
    """V2 measurements: thirds, eye fifths, iris / cheekbone / intercanthal px (glasses size scale)."""
    mid = _d(face, lm["glabella"], lm["subnasale"])
    low = _d(face, lm["subnasale"], lm["chin"])
    hair_y, occluded = _hairline_y(face, seg, lm)
    up = (face.pts(lm["glabella"])[1] - hair_y) if hair_y is not None else None
    if up is not None and not (0.5 * mid <= up <= 1.8 * mid):
        up = None
    if up is not None:
        total = up + mid + low
        thirds = {"upper": round(up / total, 3), "middle": round(mid / total, 3), "lower": round(low / total, 3),
                  "upper_occluded": False}
    else:
        total = mid + low
        thirds = {"upper": None, "middle": round(mid / total, 3), "lower": round(low / total, 3),
                  "upper_occluded": occluded}
    xs = [face.pts(i)[0] for i in (127, lm["left_eye_outer"], lm["left_eye_inner"], lm["right_eye_inner"],
                                   lm["right_eye_outer"], 356)]
    fifths = [round(abs(b - a) / eye_w, 3) for a, b in pairwise(xs)] if eye_w > 1 else None
    if fifths and not all(0 <= f <= 3 for f in fifths):
        fifths = None
    iris = None
    if face.landmarks.shape[0] >= 478:
        iris = round((_d(face, *IRIS_L) + _d(face, *IRIS_R)) / 2, 2)
    return {"thirds": thirds, "eye_fifths": fifths, "iris_px": iris, "cheekbone_px": round(cheek, 1),
            "intercanthal_px": round(_d(face, lm["left_eye_inner"], lm["right_eye_inner"]), 1)}


def measure(face: Face, yaw: float | None, cfg: dict | None = None,
            seg: np.ndarray | None = None) -> tuple[dict[str, Any] | None, list[str]]:
    """Return (anchors | None, warnings). `face_shape_heuristic` is attached under the same CV provenance."""
    cfg = cfg or load_qc_config()
    lm = cfg["anchors"]["landmarks"]
    cheek = _d(face, lm["cheek_left"], lm["cheek_right"])
    if cheek < 1:
        return None, ["cheekbone width is zero — landmarks unusable"]
    eye_w = (_d(face, lm["left_eye_outer"], lm["left_eye_inner"]) + _d(face, lm["right_eye_inner"], lm["right_eye_outer"])) / 2
    mid = _d(face, lm["glabella"], lm["subnasale"])
    values = {
        "face_length_width_ratio": _d(face, lm["forehead_top"], lm["chin"]) / cheek,
        "forehead": _d(face, lm["forehead_left"], lm["forehead_right"]) / cheek,
        "jaw": _d(face, lm["jaw_left"], lm["jaw_right"]) / cheek,
        "lower_to_mid_ratio": _d(face, lm["subnasale"], lm["chin"]) / mid if mid > 1 else float("nan"),
        "intercanthal_to_eye_width": _d(face, lm["left_eye_inner"], lm["right_eye_inner"]) / eye_w if eye_w > 1 else float("nan"),
    }
    bad = [k for k, v in values.items() if not (RANGES[k][0] <= v <= RANGES[k][1])]  # NaN fails too
    if bad:
        return None, [f"anchor out of range: {k}={values[k]:.2f}" for k in bad]

    rel = cfg["anchors"]["reliability"]
    ay = abs(yaw) if yaw is not None else 99
    reliability = "high" if ay < rel["high_if_front_yaw_below"] else "medium" if ay < rel["medium_if_front_yaw_below"] else "low"
    hf = cfg["anchors"]["heuristic_forehead"]
    heuristic = classify(values["face_length_width_ratio"], _d(face, hf["left"], hf["right"]) / cheek, values["jaw"])
    yaw_txt = f"{yaw:.1f}°" if yaw is not None else "unknown"
    return {
        "method": "mediapipe_face_landmarker",
        "source_photo": "front",
        "face_length_width_ratio": round(values["face_length_width_ratio"], 3),
        "width_profile": {"forehead": round(values["forehead"], 3), "cheekbone": 1.0, "jaw": round(values["jaw"], 3)},
        "lower_to_mid_ratio": round(values["lower_to_mid_ratio"], 3),
        "intercanthal_to_eye_width": round(values["intercanthal_to_eye_width"], 3),
        "reliability": reliability,
        "notes": f"front yaw {yaw_txt}; ratio uses forehead-top landmark, not hairline",
        "face_shape_heuristic": heuristic,
        **_extras(face, lm, cheek, eye_w, seg),
    }, []


def _ellipse(cx: float, cy: float, rx: float, ry: float, n: int = 20) -> list[tuple[float, float]]:
    return [(cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n)) for i in range(n)]


def export_geometry(face: Face, shape: tuple[int, int]) -> dict[str, Any]:
    """Normalized (0..1) polygons for deterministic drape / lip / blush / tone in the browser (web/lib/tint).

    Same structure as web/lib/fixtures/sample_geometry.json. Lives next to the front photo (runs/<id>/media) and is
    deleted with it; never written into the passport or logs (invariant 7).
    """
    h, w = shape
    norm = lambda pts: [[round(float(x) / w, 4), round(float(y) / h, 4)] for x, y in pts]
    ring = lambda idx: norm(face.pts(idx))
    cheek_w = _d(face, 234, 454)
    cheeks = []
    for eye_outer, mouth, sign in ((33, 61, -1), (263, 291, 1)):
        (ex, ey), (mx, my) = face.pts(eye_outer), face.pts(mouth)
        cheeks.append(norm(_ellipse((ex + mx) / 2 + sign * 0.06 * cheek_w, (ey + my) / 2, 0.13 * cheek_w,
                                    0.10 * cheek_w)))
    # jaw = the closed face outline (the drape never paints inside it); neck = the cloth: a cape from just under the
    # jaw line out to the shoulders and down to the bottom edge (web/lib/tint clips any overlap with the face).
    chin_y = float(face.pts(152)[1])
    (jlx, jly), (jrx, jry) = face.pts(172), face.pts(397)
    top = min(jly, jry)
    shoulder_y = min(h - 1.0, chin_y + 0.55 * cheek_w)
    neck = [(jlx, top), (jrx, top), (min(w - 1.0, jrx + 0.1 * cheek_w), chin_y), (w - 1.0, shoulder_y),
            (w - 1.0, h - 1.0), (0.0, h - 1.0), (0.0, shoulder_y), (max(0.0, jlx - 0.1 * cheek_w), chin_y)]
    mouth_w = _d(face, 61, 291)
    gap = _d(face, 13, 14)
    return {
        "width": w, "height": h, "source": "mediapipe_face_landmarker",
        "lip_outer": ring(LIPS_OUTER), "lip_inner": ring(LIPS_INNER),
        "eye_l": ring(EYE_L_RING), "eye_r": ring(EYE_R_RING),
        "brow_l": ring(BROW_L_RING), "brow_r": ring(BROW_R_RING),
        "cheek_l": cheeks[0], "cheek_r": cheeks[1],
        "jaw": ring(FACE_OVAL), "neck": norm(neck),
        "flags": {"mouth_open": bool(mouth_w > 1 and gap / mouth_w > 0.08), "lips_occluded": False},
    }
