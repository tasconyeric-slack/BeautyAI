"""A synthetic, non-person face for tests and demo fixtures.

MediaPipe's canonical face model (Apache 2.0, scripts/mesh/canonical_face_model.obj) is an average mesh, not anyone's
face. It is projected frontally onto a canvas, optionally reshaped by smooth per-band scaling, and given iris points,
so the whole measurement path (frame, metrics, overlay points, geometry polygons) runs without any photo.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np

from ..cv import Face

OBJ = Path(__file__).resolve().parents[3] / "scripts" / "mesh" / "canonical_face_model.obj"


def canonical_vertices(path: Path = OBJ) -> np.ndarray:
    rows = [line.split()[1:4] for line in path.read_text(encoding="utf-8").splitlines() if line.startswith("v ")]
    return np.array(rows, dtype=np.float64)


def synthetic_face(
    *,
    width: int = 600,
    height: int = 750,
    eye_y: float = 360.0,
    scale: float = 21.6,
    stretch_upper: float = 1.0,
    stretch_lower: float = 1.0,
    jaw_width: float = 1.0,
    forehead_width: float = 1.0,
    roll_deg: float = 0.0,
    close_mouth: bool = True,
    iris_ratio: float = 0.43,
    eye_scale: float = 1.0,
    asymmetry: float = 0.0,
) -> tuple[Face, tuple[int, int]]:
    """(Face with 478 landmarks in pixels, (height, width)).

    stretch_upper / stretch_lower scale the face vertically above / below the eye line; jaw_width / forehead_width
    scale x below the mouth / above the brows (blended smoothly); roll_deg rotates about the eye midpoint; the canonical
    mesh has parted lips, so close_mouth lifts the lower lip to a relaxed closed mouth; iris_ratio = iris diameter ÷ eye width; eye_scale widens both eyes (contour points) about their centres; asymmetry lifts the image-right half
    of the lower face slightly (canonical units per unit of x) — real faces are never mirror-perfect.
    """
    v = canonical_vertices()
    x, y = v[:, 0].copy(), v[:, 1].copy()               # canonical: x right, y up, eyes near y≈2.6
    eye_c = 2.63
    above = y > eye_c
    y[above] = eye_c + (y[above] - eye_c) * stretch_upper
    y[~above] = eye_c + (y[~above] - eye_c) * stretch_lower
    t_low = np.clip((-v[:, 1] - 4.0) / 3.0, 0, 1)      # 0 above the mouth → 1 at the jaw corners and below
    t_up = np.clip((v[:, 1] - 4.0) / 2.0, 0, 1)        # 0 below the brows → 1 on the forehead
    x *= (1 + (jaw_width - 1) * t_low) * (1 + (forehead_width - 1) * t_up)
    if close_mouth:
        lift = (y[13] - y[14]) - 0.08 * stretch_lower
        for i in (95, 88, 178, 87, 14, 317, 402, 318, 324):            # lower inner lip
            y[i] += lift
        for i in (146, 91, 181, 84, 17, 314, 405, 321, 375):           # lower outer lip
            y[i] += 0.8 * lift
    if eye_scale != 1.0:
        from ..anchors import EYE_L_RING, EYE_R_RING

        for ring in (EYE_L_RING, EYE_R_RING):
            ex = x[ring].mean()
            x[ring] = ex + (x[ring] - ex) * eye_scale
    if asymmetry:                                       # below the eyes only, so the eye line stays level
        y += asymmetry * np.clip(x, 0, None) / 7.0 * np.clip((eye_c - 1.0 - v[:, 1]) / 3.0, 0, 1)
    cx = width / 2
    px = cx + scale * x
    py = eye_y - scale * (y - eye_c)
    pts = np.stack([px, py], axis=1)
    # iris: centre of each eye ring, ring of four points (right / top / left / bottom as in MediaPipe's order)
    iris = []
    for corners in ((33, 133), (362, 263)):
        c = pts[list(corners)].mean(axis=0)
        r = iris_ratio * float(np.linalg.norm(pts[corners[0]] - pts[corners[1]])) / 2
        iris += [c, c + (r, 0), c + (0, -r), c - (r, 0), c + (0, r)]
    pts = np.vstack([pts, np.array(iris)])
    if roll_deg:
        o = (pts[[33, 133]].mean(axis=0) + pts[[362, 263]].mean(axis=0)) / 2
        a = math.radians(roll_deg)
        rot = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
        pts = (pts - o) @ rot.T + o
    lm = np.zeros((478, 3))
    lm[:, :2] = pts
    return Face(landmarks=lm, matrix=None), (height, width)


def synthetic_seg(face: Face, shape: tuple[int, int], hairline_y: float | None) -> np.ndarray:
    """A selfie-multiclass-like mask: face skin inside the oval, hair above `hairline_y` (None → no hair)."""
    from ..cv import FACE_OVAL, SEG_FACE_SKIN, SEG_HAIR, polygon_mask

    seg = np.zeros(shape, np.uint8)
    seg[polygon_mask(shape, face.pts(FACE_OVAL)) > 0] = SEG_FACE_SKIN
    if hairline_y is not None:
        seg[: int(hairline_y), :] = SEG_HAIR
    return seg


# --- true side profile (V3B) -------------------------------------------------------------------------------------
# Canonical-mesh midline vertices from the forehead down to the chin (z is forward, y is up).
PROFILE_MIDLINE = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164, 0, 11, 12, 13, 14, 15, 16, 17, 18, 200,
                   199, 175, 152]
_LIPS_UPPER = {0, 11, 12, 13, 37, 267, 39, 269, 40, 270, 185, 409, 72, 302, 73, 303, 81, 311, 82, 312}
_LIPS_LOWER = {14, 15, 16, 17, 84, 314, 87, 317, 86, 316, 85, 315, 181, 405, 178, 402, 179, 403, 180, 404, 91, 321,
               146, 375, 88, 318, 95, 324}


def _faces(path: Path = OBJ) -> np.ndarray:
    tri = [[int(t.split("/")[0]) - 1 for t in line.split()[1:4]]
           for line in path.read_text(encoding="utf-8").splitlines() if line.startswith("f ")]
    return np.array(tri, dtype=np.int32)


def synthetic_profile(
    *,
    width: int = 640,
    height: int = 800,
    scale: float = 26.0,
    facing: str = "right",
    tilt_deg: float = 0.0,
    lip_protrusion: float = 0.0,
    chin_projection: float = 0.0,
    nose_projection: float = 0.0,
    neck: bool = True,
    hair_fringe: bool = False,
) -> tuple[np.ndarray, np.ndarray, dict[str, tuple[float, float]]]:
    """A ~90° profile rendered from the canonical mesh: (rgb uint8, selfie-multiclass-like seg, true midline points).

    The mesh supplies the face (forehead → chin); a cranium ellipse, hair and a neck are added behind and below it so
    the silhouette is a plausible head. `lip_protrusion` / `chin_projection` / `nose_projection` move those regions
    forward (canonical units); `tilt_deg` rotates the head in the image plane (positive = chin up, like looking up).
    The returned midline points (pixels) are the ground truth the silhouette tracer should recover.
    """
    import cv2

    from ..cv import SEG_BODY_SKIN, SEG_CLOTHES, SEG_FACE_SKIN, SEG_HAIR

    v = canonical_vertices().copy()
    y, z = v[:, 1], v[:, 2]
    lips = np.zeros(len(v), bool)
    lips[list(_LIPS_UPPER | _LIPS_LOWER)] = True
    z[lips] += lip_protrusion
    chin = np.clip((-y - 5.6) / 1.4, 0, 1)                      # 0 above the mentolabial sulcus → 1 on the chin
    z += chin_projection * chin
    nose = np.clip(1 - np.abs(y + 0.8) / 2.6, 0, 1) * (z > 5.6)  # the nasal tip lobule
    z += nose_projection * nose
    cx, cy = width * 0.46, height * 0.43

    def to_px(zz: np.ndarray, yy: np.ndarray) -> np.ndarray:
        pts = np.stack([cx + scale * (zz - 1.5), cy - scale * (yy - 1.0)], axis=1)
        if tilt_deg:
            a = math.radians(-tilt_deg)
            o = np.array([cx, cy])
            rot = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
            pts = (pts - o) @ rot.T + o
        return pts

    seg = np.zeros((height, width), np.uint8)
    # neck and shoulders (body skin, clothes) — behind the chin, drawn first
    if neck:
        neck_poly = to_px(np.array([2.4, 1.8, 1.5, -7.5, -7.5]), np.array([-8.2, -10.2, -20.0, -20.0, 0.0]))
        cv2.fillPoly(seg, [np.round(neck_poly).astype(np.int32)], SEG_BODY_SKIN)
        coat = to_px(np.array([3.5, 4.5, -12, -12]), np.array([-15.5, -40, -40, -14]))
        cv2.fillPoly(seg, [np.round(coat).astype(np.int32)], SEG_CLOTHES)
    # cranium + hair behind the face mesh
    t = np.linspace(0, 2 * math.pi, 120)
    skull = to_px(-1.8 + 6.6 * np.cos(t), 4.3 + 8.0 * np.sin(t))
    cv2.fillPoly(seg, [np.round(skull).astype(np.int32)], SEG_HAIR)
    # face skin: every mesh triangle, projected (z, y)
    tri_px = to_px(z, y)
    for tri in _faces():
        cv2.fillPoly(seg, [np.round(tri_px[tri]).astype(np.int32)], SEG_FACE_SKIN)
    # an ear (skin) so the side of the head is not one flat hair region
    ear = to_px(-3.6 + 1.1 * np.cos(t), 1.0 + 2.0 * np.sin(t))
    cv2.fillPoly(seg, [np.round(ear).astype(np.int32)], SEG_FACE_SKIN)
    if hair_fringe:                                             # hair falling over the forehead and brow
        fringe = to_px(np.array([-2.0, 6.4, 6.0, -2.0]), np.array([9.0, 8.6, 4.4, 4.6]))
        cv2.fillPoly(seg, [np.round(fringe).astype(np.int32)], SEG_HAIR)

    colors = np.array([[226, 224, 220], [44, 34, 30], [214, 168, 146], [222, 176, 152], [70, 78, 96], [0, 0, 0]],
                      np.uint8)
    rgb = colors[seg]
    # soft shading so the edge has a realistic gradient (and the skin is not one flat colour)
    rgb = cv2.GaussianBlur(rgb, (0, 0), 0.8)
    truth = {f"mesh_{i}": tuple(float(c) for c in tri_px[i]) for i in PROFILE_MIDLINE}
    if facing == "left":
        rgb, seg = rgb[:, ::-1].copy(), seg[:, ::-1].copy()
        truth = {k: (width - 1 - x, yy) for k, (x, yy) in truth.items()}
    return rgb, seg, truth
