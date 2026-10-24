"""Named landmarks, the roll-corrected measurement frame and the overlay helper points.

Every number in `measurement_profile` and every line the face page draws come from the same `Frame`: the overlay is
the measurement, not an illustration of it. Coordinates inside the frame are pixels, rotated about the eye midpoint so
the line through both eye centres is horizontal (head roll removed); `to_image` maps helper points back.

MediaPipe index notes ("_l" = image-left = the subject's right side, as in anchors.py):
- `MIRROR_PAIRS` were derived from MediaPipe's canonical face model (Apache 2.0, scripts/mesh/canonical_face_model.obj):
  vertex i and the vertex at its mirrored position (−x, y, z); the match distance is 0 for all 220 pairs
  (tests/test_face_metrics.py re-derives them). 28 vertices lie on the midline.
- Alar width 129/358, nasion 168, glabella 9, subnasale 2, nose tip 1; lips 0 (upper-lip centre, the bow's dip),
  37/267 (bow peaks), 13/14 (inner lips), 17 (lower-lip bottom); jaw corner 172/397 (as anchors), ramus 132/361,
  chin contour 176/400.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

# name → MediaPipe index (or a tuple whose mean is the point)
LANDMARKS: dict[str, int | tuple[int, ...]] = {
    "forehead_top": 10, "glabella": 9, "nasion": 168, "nose_tip": 1, "subnasale": 2, "chin": 152,
    "cheek_l": 234, "cheek_r": 454, "jaw_l": 172, "jaw_r": 397, "forehead_l": 54, "forehead_r": 284,
    "ramus_l": 132, "ramus_r": 361, "chin_l": 176, "chin_r": 400, "temple_l": 127, "temple_r": 356,
    "eye_l_outer": 33, "eye_l_inner": 133, "eye_r_inner": 362, "eye_r_outer": 263,
    "eye_l_top": 159, "eye_l_bottom": 145, "eye_r_top": 386, "eye_r_bottom": 374,
    "eye_l_center": (33, 133), "eye_r_center": (362, 263),
    "iris_l": 468, "iris_r": 473, "iris_l_a": 471, "iris_l_b": 469, "iris_r_a": 476, "iris_r_b": 474,
    "brow_l_head": (107, 55), "brow_l_tail": (70, 46), "brow_r_head": (336, 285), "brow_r_tail": (300, 276),
    "alar_l": 129, "alar_r": 358,
    "mouth_l": 61, "mouth_r": 291, "lip_top": 0, "lip_upper_inner": 13, "lip_lower_inner": 14, "lip_bottom": 17,
    "bow_l": 37, "bow_r": 267,
    # V3B additions
    "stomion": (13, 14), "chin_l2": 148, "chin_r2": 377, "face_mouth_l": 58, "face_mouth_r": 288,
    "eye_l_up_in": 173, "eye_l_lo_in": 155, "eye_l_up_out": 246, "eye_l_lo_out": 7,
    "eye_r_up_in": 398, "eye_r_lo_in": 382, "eye_r_up_out": 466, "eye_r_lo_out": 249,
}
# Upper / lower lid contours (inner → outer), anchors.EYE_*_RING order.
LID_L_UP, LID_L_LO = [133, 173, 157, 158, 159, 160, 161, 246, 33], [133, 155, 154, 153, 145, 144, 163, 7, 33]
LID_R_UP, LID_R_LO = [362, 398, 384, 385, 386, 387, 388, 466, 263], [362, 382, 381, 380, 374, 373, 390, 249, 263]
IRIS_NAMES = {"iris_l", "iris_r", "iris_l_a", "iris_l_b", "iris_r_a", "iris_r_b"}

# Brow contours: upper edge from tail → head, lower edge from head → tail (anchors.BROW_*_RING order).
BROW_L_UPPER, BROW_L_LOWER = [70, 63, 105, 66, 107], [55, 65, 52, 53, 46]
BROW_R_UPPER, BROW_R_LOWER = [300, 293, 334, 296, 336], [285, 295, 282, 283, 276]

# Face-oval pairs (left, right) — the outline used for the contour-based measures.
OVAL_PAIRS = [(109, 338), (67, 297), (103, 332), (54, 284), (21, 251), (162, 389), (127, 356), (234, 454),
              (93, 323), (132, 361), (58, 288), (172, 397), (136, 365), (150, 379), (149, 378), (176, 400),
              (148, 377)]

_PAIR_RUNS = [(3, 248, 1), (7, 249, 1), (20, 250, 74), (95, 324, 56), (153, 380, 11), (165, 391, 3), (169, 394, 6),
              (176, 400, 19), (196, 419, 1), (198, 420, 1), (201, 421, 47)]


def _mirror_pairs() -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for a, b, n in _PAIR_RUNS:
        out += [(a + k, b + k) for k in range(n)]
    return out


MIRROR_PAIRS: list[tuple[int, int]] = _mirror_pairs()   # 220 (left, right) pairs on the 468-point mesh
MIDLINE = [0, 1, 2, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 94, 151, 152, 164, 168, 175, 195, 197,
           199, 200]


@dataclass
class Frame:
    """Landmarks in a head-roll-free frame. `p(name)` → (x, y) pixels in the frame (y grows downwards)."""

    lm: np.ndarray                  # (N, 2) image pixels
    roll_deg: float                 # rotation removed (eye line vs horizontal), degrees, signed
    origin: np.ndarray              # rotation centre (eye midpoint), image pixels
    rot: np.ndarray                 # 2×2 rotation image → frame
    has_iris: bool
    helpers: dict[str, np.ndarray] = field(default_factory=dict)   # frame coordinates

    def raw(self, idx: int | tuple[int, ...]) -> np.ndarray:
        if isinstance(idx, tuple):
            return self.lm[list(idx)].mean(axis=0)
        return self.lm[idx]

    def to_frame(self, xy: np.ndarray) -> np.ndarray:
        return (np.asarray(xy, float) - self.origin) @ self.rot.T

    def to_image(self, xy: np.ndarray) -> np.ndarray:
        return np.asarray(xy, float) @ self.rot + self.origin

    def i(self, idx: int | tuple[int, ...]) -> np.ndarray:
        """Frame coordinates of a raw MediaPipe index (or mean of indices)."""
        return self.to_frame(self.raw(idx))

    def p(self, name: str) -> np.ndarray:
        if name in self.helpers:
            return self.helpers[name]
        return self.i(LANDMARKS[name])

    def d(self, a: str, b: str) -> float:
        return float(np.linalg.norm(self.p(a) - self.p(b)))

    def dy(self, a: str, b: str) -> float:
        """Vertical distance in the frame (b below a → positive)."""
        return float(self.p(b)[1] - self.p(a)[1])


def make_frame(landmarks: np.ndarray) -> Frame:
    lm = np.asarray(landmarks, float)[:, :2]
    left = lm[[33, 133]].mean(axis=0)
    right = lm[[362, 263]].mean(axis=0)
    dx, dy = right - left
    roll = math.atan2(dy, dx)
    c, s = math.cos(-roll), math.sin(-roll)
    rot = np.array([[c, -s], [s, c]])
    return Frame(lm=lm, roll_deg=math.degrees(roll), origin=(left + right) / 2, rot=rot, has_iris=lm.shape[0] >= 478)


def symmetry_axis(f: Frame, pairs: list[tuple[int, int]]) -> tuple[float, float]:
    """Least-squares mirror axis x = c + k·y (frame) through the midpoints of the given left/right pairs."""
    mids = np.array([(f.i(a) + f.i(b)) / 2 for a, b in pairs])
    k, c = np.polyfit(mids[:, 1], mids[:, 0], 1)
    return float(c), float(k)


def axis_x(axis: tuple[float, float], y: float) -> float:
    return axis[0] + axis[1] * y


def mirror_residual(f: Frame, pairs: list[tuple[int, int]], axis: tuple[float, float]) -> float:
    """Mean distance between each left point and its right partner reflected across the axis (frame pixels)."""
    c, k = axis
    n = math.hypot(1.0, k)
    res = []
    for a, b in pairs:
        pa, pb = f.i(a), f.i(b)
        # signed distance of pb from the line x - k·y - c = 0, then reflect
        dist = (pb[0] - k * pb[1] - c) / n
        refl = pb - 2 * dist * np.array([1.0, -k]) / n
        res.append(float(np.linalg.norm(pa - refl)))
    return float(np.mean(res))


def _poly_y_at(pts: np.ndarray, x: float) -> float | None:
    """y on the polyline at x (linear interpolation), or None outside its x range."""
    order = np.argsort(pts[:, 0])
    xs, ys = pts[order, 0], pts[order, 1]
    if not xs[0] <= x <= xs[-1]:
        return None
    return float(np.interp(x, xs, ys))


def build_helpers(f: Frame, hairline_y_image: float | None, cheek_samples: dict[str, np.ndarray] | None) -> None:
    """Construction points for the overlays (frame coordinates). Deterministic; depend only on landmarks + hairline."""
    h: dict[str, np.ndarray] = {}
    P = f.p
    xl, xr = min(P("cheek_l")[0], P("temple_l")[0]), max(P("cheek_r")[0], P("temple_r")[0])
    pad = 0.04 * (xr - xl)
    # vertical thirds: horizontal lines across the face at each level
    levels = {"glab": P("glabella")[1], "sub": P("subnasale")[1], "chin": P("chin")[1]}
    if hairline_y_image is not None:
        hx = f.raw(LANDMARKS["glabella"])[0]                       # hairline was found on the glabella column
        hy = f.to_frame(np.array([hx, hairline_y_image]))[1]
        levels["hair"] = hy
        h["hairline"] = np.array([P("glabella")[0], hy])
    for k, y in levels.items():
        h[f"th_{k}_l"] = np.array([xl - pad, y])
        h[f"th_{k}_r"] = np.array([xr + pad, y])
    # fifths: vertical lines at the six cut points, spanning brow → below the eyes
    cuts = ["temple_l", "eye_l_outer", "eye_l_inner", "eye_r_inner", "eye_r_outer", "temple_r"]
    eye_w = (f.d("eye_l_outer", "eye_l_inner") + f.d("eye_r_inner", "eye_r_outer")) / 2
    brow_y = min(P("brow_l_head")[1], P("brow_r_head")[1], P("brow_l_tail")[1], P("brow_r_tail")[1])
    eye_y = (P("eye_l_center")[1] + P("eye_r_center")[1]) / 2
    for i, name in enumerate(cuts):
        x = P(name)[0]
        h[f"f{i}_t"] = np.array([x, brow_y - 0.2 * eye_w])
        h[f"f{i}_b"] = np.array([x, eye_y + 0.9 * eye_w])
        h[f"f{i}_m"] = np.array([x, eye_y])
    # horizontal references for the angle overlays (point outward from the vertex, one eye/brow width long)
    for side, sgn in (("l", -1.0), ("r", 1.0)):
        inner = P(f"eye_{side}_inner")
        h[f"eye_{side}_hz"] = inner + np.array([sgn * eye_w, 0.0])
        head = P(f"brow_{side}_head")
        h[f"brow_{side}_hz"] = head + np.array([sgn * float(np.linalg.norm(P(f"brow_{side}_tail") - head)), 0.0])
        # brow lower edge straight above the upper-lid point; brow peak = highest point of the upper edge
        lower = np.array([f.i(i) for i in (BROW_L_LOWER if side == "l" else BROW_R_LOWER)])
        upper = np.array([f.i(i) for i in (BROW_L_UPPER if side == "l" else BROW_R_UPPER)])
        top = P(f"eye_{side}_top")
        y = _poly_y_at(lower, float(top[0]))
        h[f"brow_{side}_low"] = np.array([top[0], y if y is not None else float(lower[:, 1].mean())])
        h[f"brow_{side}_peak"] = upper[int(np.argmin(upper[:, 1]))]
    for side, up in (("l", LID_L_UP), ("r", LID_R_UP)):
        pts = np.array([f.i(i) for i in up])
        h[f"eye_{side}_apex"] = pts[int(np.argmin(pts[:, 1]))]
        head, tail, peak = P(f"brow_{side}_head"), P(f"brow_{side}_tail"), h[f"brow_{side}_peak"]
        d = tail - head
        h[f"brow_{side}_arch_foot"] = head + d * float(np.dot(peak - head, d) / np.dot(d, d))
    h["mouth_hz"] = np.array([P("mouth_r")[0], P("mouth_l")[1]])
    h["eye_mid"] = (P("eye_l_center") + P("eye_r_center")) / 2
    h["jaw_l_hz"] = np.array([P("chin")[0], P("jaw_l")[1]])
    h["jaw_r_hz"] = np.array([P("chin")[0], P("jaw_r")[1]])
    h["roll_hz"] = np.array([P("eye_r_outer")[0], P("eye_l_outer")[1]])
    # head roll is measured against the image horizontal: that reference lives in image space
    lc_img = f.raw(LANDMARKS["eye_l_center"])
    rc_img = f.raw(LANDMARKS["eye_r_center"])
    h["roll_hz_center"] = f.to_frame(np.array([rc_img[0], lc_img[1]]))
    h["nasion_vert"] = np.array([P("nasion")[0], P("subnasale")[1]])
    # symmetry axis (mirror line fitted on the 220 pairs), drawn forehead-top → chin
    axis = symmetry_axis(f, MIRROR_PAIRS)
    y0, y1 = P("forehead_top")[1], P("chin")[1]
    h["midline_top"] = np.array([axis_x(axis, y0), y0])
    h["midline_bottom"] = np.array([axis_x(axis, y1), y1])
    tip = P("nose_tip")
    h["nose_tip_axis"] = np.array([axis_x(axis, float(tip[1])), tip[1]])
    for name in ("chin", "jaw_l", "jaw_r", "cheek_l", "cheek_r", "lip_top"):
        q = P(name)
        h[f"{name}_axis"] = np.array([axis_x(axis, float(q[1])), q[1]])
    # bounding box of the face oval
    from ..cv import FACE_OVAL

    oval = np.array([f.i(i) for i in FACE_OVAL])
    (bx0, by0), (bx1, by1) = oval.min(axis=0), oval.max(axis=0)
    h.update(bbox_tl=np.array([bx0, by0]), bbox_tr=np.array([bx1, by0]), bbox_br=np.array([bx1, by1]),
             bbox_bl=np.array([bx0, by1]))
    if cheek_samples:
        h.update({k: f.to_frame(v) for k, v in cheek_samples.items()})
    f.helpers = h


def all_point_names() -> set[str]:
    """Every name an overlay may reference (helpers that may be absent, e.g. hairline, are included)."""
    helpers = {"hairline", "mouth_hz", "roll_hz", "roll_hz_center", "nasion_vert", "midline_top", "midline_bottom",
               "nose_tip_axis", "chin_axis", "jaw_l_axis", "jaw_r_axis", "cheek_l_axis", "cheek_r_axis",
               "lip_top_axis", "eye_mid", "jaw_l_hz", "jaw_r_hz", "eye_l_apex", "eye_r_apex", "brow_l_arch_foot", "brow_r_arch_foot", "bbox_tl", "bbox_tr", "bbox_br", "bbox_bl", "cheek_sample_l", "cheek_sample_r"}
    helpers |= {f"th_{k}_{s}" for k in ("hair", "glab", "sub", "chin") for s in "lr"}
    helpers |= {f"f{i}_{e}" for i in range(6) for e in "tbm"}
    helpers |= {f"{part}_{s}_{k}" for part, ks in (("eye", ("hz",)), ("brow", ("hz", "low", "peak")))
                for s in "lr" for k in ks}
    return set(LANDMARKS) | helpers
