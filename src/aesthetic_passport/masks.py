"""Edit masks and the protected face region for the Recommended Look (MVP_BRIEF §6.6, prompts/image_edit.md).

Two masks per edit:
- edit mask  — where new pixels may appear (dilated per region; hair also extends up/outward for added volume)
- protected  — pixels that must stay the user's own: the face below the brow line plus the eye, nose and mouth
               hulls (brows too, unless the edit *is* the brows). The composite forces alpha = 0 here, so a
               model can never alter identity, whatever it returns.
All sizes are fractions of the face's cheekbone width so they scale with the photo; values in config/qc.yaml.
"""
from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from .cv import (
    FACE_OVAL,
    LEFT_BROW,
    LEFT_EYE,
    LIPS_OUTER,
    RIGHT_BROW,
    RIGHT_EYE,
    SEG_CLOTHES,
    SEG_HAIR,
    Face,
    hull_mask,
    polygon_mask,
)
from .qc import load_qc_config

# Nose bridge and tip/wing landmarks (from MediaPipe's canonical mesh): only used as a hull for protection.
NOSE_HULL = [168, 6, 197, 195, 5, 4, 1, 2, 98, 327, 129, 358]
SUBNASALE = 2
NOSE_TIP = 1


def lower_face(face: Face, shape: tuple[int, int]) -> np.ndarray:
    """Face oval below the base of the nose (beard / moustache area)."""
    m = polygon_mask(shape, face.pts(FACE_OVAL)) > 0
    m[: int(face.pts(SUBNASALE)[1]), :] = False
    return m


def _px(face: Face, frac: float) -> int:
    cheek = float(np.linalg.norm(face.pts(234) - face.pts(454)))
    return max(1, round(frac * cheek))


def _dilate(mask: np.ndarray, r: int) -> np.ndarray:
    if r <= 0:
        return mask
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return cv2.dilate(mask.astype(np.uint8), k) > 0


def brow_line_y(face: Face) -> float:
    return float(min(face.pts(LEFT_BROW)[:, 1].min(), face.pts(RIGHT_BROW)[:, 1].min()))


def protected_region(face: Face, shape: tuple[int, int], region: str, cfg: dict | None = None) -> np.ndarray:
    pc = (cfg or load_qc_config())["preview_masks"]
    oval = polygon_mask(shape, face.pts(FACE_OVAL)) > 0
    below = np.zeros(shape, bool)
    if region == "glasses":  # frames sit on the skin around the eyes: protect the eyes and everything below the nose
        below[int(face.pts(NOSE_TIP)[1]):, :] = True
    else:
        below[int(brow_line_y(face)) - _px(face, pc["protect_above_brow_frac"]):, :] = True
    prot = oval & below
    feats = [LEFT_EYE, RIGHT_EYE, LIPS_OUTER] + ([] if region == "glasses" else [NOSE_HULL])
    if region not in ("brows", "glasses"):
        feats += [LEFT_BROW, RIGHT_BROW]
    for f in feats:
        prot |= _dilate(hull_mask(shape, face.pts(f)) > 0, _px(face, pc["feature_pad_frac"]))
    if region == "brows":  # the brows themselves (plus a margin) must be editable
        for b in (LEFT_BROW, RIGHT_BROW):
            prot &= ~_dilate(hull_mask(shape, face.pts(b)) > 0, _px(face, pc["brows_dilate_frac"]))
    if region == "facial_hair":  # beard area is the edit; keep lips, nose, eyes
        lower = lower_face(face, shape)
        keep = np.zeros(shape, bool)
        for f in (LIPS_OUTER, NOSE_HULL, LEFT_EYE, RIGHT_EYE):
            keep |= _dilate(hull_mask(shape, face.pts(f)) > 0, _px(face, pc["feature_pad_frac"]))
        prot = (prot & ~lower) | keep
    return prot


def edit_mask(face: Face, seg: np.ndarray, region: str, cfg: dict | None = None) -> np.ndarray:
    pc = (cfg or load_qc_config())["preview_masks"]
    shape = seg.shape[:2]
    if region == "hair":
        hair = seg == SEG_HAIR
        x0, _, x1, _ = face.box
        w = x1 - x0
        # Room for new volume: a band around the head, from above the crown down to the jaw.
        room = np.zeros(shape, np.uint8)
        cx, cy = (x0 + x1) // 2, int(brow_line_y(face))
        cv2.ellipse(room, (cx, cy), (int(w * pc["hair_room_w"]), int(w * pc["hair_room_h"])), 0, 180, 360, 1, -1)
        room[cy:cy + int(w * pc["hair_room_below"]), max(0, cx - int(w * pc["hair_room_w"])):cx + int(w * pc["hair_room_w"])] = 1
        m = _dilate(hair, _px(face, pc["hair_dilate_frac"])) | (room > 0)
        return m & (seg != SEG_CLOTHES)
    if region == "brows":
        m = np.zeros(shape, bool)
        for b in (LEFT_BROW, RIGHT_BROW):
            m |= _dilate(hull_mask(shape, face.pts(b)) > 0, _px(face, pc["brows_dilate_frac"]))
        return m
    if region == "glasses":
        band = np.zeros(shape, bool)
        pts = np.vstack([face.pts(LEFT_EYE), face.pts(RIGHT_EYE), face.pts(LEFT_BROW), face.pts(RIGHT_BROW),
                         face.pts([234, 454])])
        band |= hull_mask(shape, pts) > 0
        return _dilate(band, _px(face, pc["glasses_dilate_frac"]))
    if region == "facial_hair":
        return _dilate(lower_face(face, shape), _px(face, pc["facial_hair_dilate_frac"]))
    if region == "clothing_top":
        chin_y = int(face.pts(152)[1])
        m = seg == SEG_CLOTHES  # clothes only: never neck or hands
        m[: chin_y + _px(face, pc["clothing_below_chin_frac"]), :] = False
        return _dilate(m, _px(face, pc["clothing_dilate_frac"]))
    raise ValueError(f"unknown edit region {region!r}")


def head_crop_box(face: Face, shape: tuple[int, int], region: str, cfg: dict | None = None,
                  *, seg: np.ndarray | None = None) -> tuple[int, int, int, int]:
    """Crop sent to the image model: the head with room for hair (or the torso top for clothing)."""
    pc = (cfg or load_qc_config())["preview_masks"]
    h, w = shape
    x0, y0, x1, y1 = face.box
    fw, fh = x1 - x0, y1 - y0
    cx = (x0 + x1) / 2
    half_w = fw * pc["crop_half_width"]
    top = y0 - fh * pc["crop_above"]
    bottom = y1 + fh * (pc["crop_below_clothing"] if region == "clothing_top" else pc["crop_below"])
    bx0, bx1 = int(max(0, cx - half_w)), int(min(w, cx + half_w))
    by0, by1 = int(max(0, top)), int(min(h, bottom))
    if region == "hair" and seg is not None:
        # A landmark-only crop can cut off long hair, leaving its unedited ends in the final photograph.
        ys, xs = np.where(seg == SEG_HAIR)
        if xs.size:
            margin = _px(face, pc["hair_dilate_frac"])
            bx0, by0 = min(bx0, max(0, int(xs.min()) - margin)), min(by0, max(0, int(ys.min()) - margin))
            bx1 = max(bx1, min(w, int(xs.max()) + margin + 1))
            by1 = max(by1, min(h, int(ys.max()) + margin + 1))
    return bx0, by0, bx1, by1


def feathered_alpha(edit: np.ndarray, protected: np.ndarray, feather_px: int,
                    *, guide: np.ndarray | None = None) -> np.ndarray:
    """Feather the edit and ease into identity protection; optionally follow the edited photograph's edges.

    OpenCV's guided filter refines the transition without a new matting model/dependency. The distance ramp
    prevents the old abrupt alpha=1 → 0 cut at the face core. Protected pixels remain exactly zero.
    """
    if feather_px <= 0:
        return (edit & ~protected).astype(np.float32)
    k = feather_px * 2 + 1
    alpha = cv2.GaussianBlur(edit.astype(np.float32), (k, k), feather_px / 2)
    if guide is not None and hasattr(cv2, "ximgproc"):
        alpha = cv2.ximgproc.guidedFilter(guide.astype(np.float32) / 255, alpha, feather_px, 1e-3)
        alpha = np.clip(alpha, 0, 1)
        # A trimap's known foreground stays opaque. Otherwise the guided filter can dilute a dark fringe
        # with the old skin even well inside the edit, creating translucent/ghosted strands.
        interior = cv2.distanceTransform(edit.astype(np.uint8), cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
        alpha[interior >= feather_px] = 1
    # Keep the support bounded even when the guided filter extrapolates near an edge.
    alpha[~_dilate(edit, feather_px)] = 0
    if protected.any():
        distance = cv2.distanceTransform((~protected).astype(np.uint8), cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
        ramp = np.clip(distance / feather_px, 0, 1)
        alpha *= ramp * ramp * (3 - 2 * ramp)
    alpha[protected] = 0.0
    return alpha


def overlay(rgb: np.ndarray, masks: dict[str, Any]) -> np.ndarray:
    """Debug image: edit mask in teal, protected region in red."""
    out = rgb.astype(np.float32).copy()
    if "edit" in masks:
        out[masks["edit"]] = 0.5 * out[masks["edit"]] + 0.5 * np.array([31, 160, 180], np.float32)
    if "protected" in masks:
        out[masks["protected"]] = 0.55 * out[masks["protected"]] + 0.45 * np.array([220, 40, 40], np.float32)
    return out.clip(0, 255).astype(np.uint8)
