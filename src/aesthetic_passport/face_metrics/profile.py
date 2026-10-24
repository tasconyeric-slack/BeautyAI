"""True side profile (~90°) measurements (V3B, D35). CV layer → `measurement_profile` metrics with view "side".

Deliberately simple and conservative:
  1. The selfie segmenter is run on a crop around the head; the person mask's anterior outline is the profile.
  2. The outline is put in a facial-plane frame (glabella → chin vertical), so head tilt does not matter; every metric
     is an internal angle or a ratio of lengths on the outline, i.e. invariant to in-plane rotation.
  3. Landmarks are extrema of that outline: pronasale (most anterior), glabella / pogonion (most anterior above /
     below), nasion / subnasale / stomion / mentolabial sulcus (deepest point under the chord of their neighbours).
  4. Anything implausible → the metric is unavailable with a reason. No depth, no millimetres, no calibration.

A three-quarter photo is detected by the nose test: in a true profile the nose tip *is* the silhouette edge; in a
45° photo the far cheek lies beyond it. MediaPipe's yaw cannot separate the two (it reads ~40° on a real profile).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from itertools import pairwise
from typing import Any

import numpy as np

SIDE_POINTS = ("p_glabella", "p_nasion", "p_pronasale", "p_subnasale", "p_columella", "p_labrale_sup", "p_stomion",
               "p_labrale_inf", "p_sulcus", "p_pogonion", "p_gnathion", "p_dorsum_mid",
               "p_eline_a", "p_eline_b", "p_foot_ls_e", "p_foot_li_e", "p_foot_ls_s", "p_sline_a", "p_sline_b",
               "p_fp_top", "p_fp_bottom", "p_ns_bottom", "p_foot_pog_ns", "p_dorsum_top", "p_dorsum_tip",
               "p_lip_line_end", "p_foot_dorsum", "p_foot_prn_ns", "p_dorsum_peak", "p_dorsum_peak_foot")


class ProfileUnavailable(Exception):
    """The photo cannot be measured as a true profile; `reason` keys missing_reasons_zh / QC copy."""

    def __init__(self, reason: str, detail: dict[str, Any] | None = None):
        super().__init__(reason)
        self.reason = reason
        self.detail = detail or {}


@dataclass
class ProfileTrace:
    path: np.ndarray                      # (N, 2) anterior outline, image px, top → bottom
    facing: str                           # "left" | "right" (direction the face points in the image)
    scale_px: float                       # nasion → gnathion length in native pixels
    landmarks: dict[str, np.ndarray] = field(default_factory=dict)
    nose_gap: float | None = None         # MediaPipe nose tip → outline distance ÷ scale (None without a face)


def _largest_component(mask: np.ndarray) -> np.ndarray:
    import cv2

    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if n <= 1:
        return mask.astype(bool)
    k = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return lab == k


def profile_masks(seg: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Use the same foreground component for profile resolution and contour tracing.

    Disconnected skin-label noise must not add native face pixels. Component selection can also remove all
    skin (e.g. a larger foreground object); report that explicitly before computing bounds or centroids.
    """
    from ..cv import SEG_BACKGROUND, SEG_FACE_SKIN

    fg = _largest_component(seg != SEG_BACKGROUND)
    skin = (seg == SEG_FACE_SKIN) & fg
    if skin.sum() < 150:
        raise ProfileUnavailable("no_face")
    return fg, skin


def profile_bounds(seg: np.ndarray, fg: np.ndarray, skin: np.ndarray,
                   face: Any | None = None) -> tuple[int, int, int]:
    """Facing sign and visible facial top/bottom, excluding neck labels behind the outline.

    The segmenter can label neck pixels as face skin, including islands within the same person component.
    Only face skin on the anterior foreground boundary supplies facial bounds; otherwise a shoulder below
    the chin can become the most anterior point and be mistaken for the nose. Interior holes do not move
    this boundary, and hair remains part of the outline between the facial bounds.
    """
    from ..cv import SEG_HAIR

    _, xs = np.nonzero(skin)
    hair = (seg == SEG_HAIR) & fg
    if face is not None:
        sign = 1 if face.landmarks[1, 0] > xs.mean() else -1
    elif hair.sum() > 0.2 * skin.sum():
        sign = 1 if xs.mean() > np.nonzero(hair)[1].mean() else -1
    else:
        sign = 1 if xs.mean() > np.nonzero(fg)[1].mean() else -1
    rows = np.flatnonzero(fg.any(axis=1))
    anterior = np.argmax(fg if sign < 0 else fg[:, ::-1], axis=1)
    if sign > 0:
        anterior = fg.shape[1] - 1 - anterior
    facial = rows[skin[rows, anterior[rows]]]
    if len(facial) < 20:
        raise ProfileUnavailable("landmarks_unclear", {"stage": "anterior_face_skin"})
    return sign, int(facial.min()), int(facial.max())


def _anterior_outline(fg: np.ndarray, sign: int, y0: int, y1: int) -> np.ndarray:
    """Most anterior foreground x per row (sub-row smoothing), rows y0..y1. Returns (N, 2) points, NaN-free."""
    rows, xs = [], []
    for y in range(max(0, y0), min(fg.shape[0], y1)):
        cols = np.flatnonzero(fg[y])
        if cols.size:
            rows.append(y)
            xs.append(cols.max() + 0.5 if sign > 0 else cols.min() - 0.5)
    if len(rows) < 20:
        raise ProfileUnavailable("no_face")
    return np.stack([np.array(xs, float), np.array(rows, float) + 0.5], axis=1)


def _deepest(q: np.ndarray, i: int, j: int) -> int:
    """Index in (i, j) furthest *behind* the chord q[i]→q[j] (anterior = +x)."""
    if j - i < 3:
        raise ProfileUnavailable("landmarks_unclear")
    a, b = q[i], q[j]
    d = b - a
    n = np.array([d[1], -d[0]]) / (np.linalg.norm(d) + 1e-9)       # points to +x for a downward chord
    seg = q[i + 1:j]
    return i + 1 + int(np.argmin((seg - a) @ n))


def _rot(theta: float) -> np.ndarray:
    c, s = math.cos(theta), math.sin(theta)
    return np.array([[c, -s], [s, c]])


def _detect(q: np.ndarray, end: int) -> dict[str, int]:
    """Landmark indices on an outline already in the facial-plane frame (anterior +x, down +y).

    `end` is the last outline index on the face (the face-skin bottom row); the neck below it is never searched."""
    n = len(q)
    lo, hi = int(0.1 * end), end
    prn = lo + int(np.argmax(q[lo:hi, 0]))
    y = q[:, 1]
    below = np.flatnonzero(y > y[prn])
    above = np.flatnonzero(y < y[prn])
    if below.size < 10 or above.size < 10:
        raise ProfileUnavailable("landmarks_unclear")
    below = below[below <= end]
    if below.size < 10:
        raise ProfileUnavailable("landmarks_unclear")
    d_low = y[end] - y[prn]                                          # nose tip → bottom of the face skin
    # glabella: most anterior point clearly above the nose (brow level)
    g_win = above[(y[above] > y[prn] - 1.15 * d_low) & (y[above] < y[prn] - 0.45 * d_low)]
    if g_win.size < 3:
        raise ProfileUnavailable("landmarks_unclear")
    g = int(g_win[np.argmax(q[g_win, 0])])
    # pogonion: the lowest local maximum of anteriority above the face bottom (the chin's front)
    w = below[y[below] < y[end] - 0.02 * d_low]
    k = max(2, len(w) // 40)
    xs = q[:, 0]
    peaks = [i for i in w[k:-k] if xs[i] >= xs[i - k:i + k + 1].max() - 1e-9 and y[i] > y[prn] + 0.45 * d_low]
    if not peaks:
        raise ProfileUnavailable("landmarks_unclear")
    pog = int(peaks[-1])
    nas = _deepest(q, g, prn)
    # lips: most anterior points in the upper / lower parts of the nose-tip → chin span; hollows between them
    span = y[pog] - y[prn]

    # lips: the two most anterior local peaks between the nose tip and the chin (upper, then lower lip)
    k2 = max(2, (pog - prn) // 25)
    cand = [i for i in range(prn + k2 + 1, pog - k2) if xs[i] >= xs[i - k2:i + k2 + 1].max() - 1e-9
            and y[i] > y[prn] + 0.1 * span]
    peaks2: list[int] = []
    for i in cand:                                   # collapse plateaus to their middle
        if peaks2 and i - peaks2[-1] <= k2:
            continue
        peaks2.append(i)
    if len(peaks2) < 2:
        raise ProfileUnavailable("lips_unclear")
    top2 = sorted(sorted(peaks2, key=lambda i: -xs[i])[:2])
    ls, li = top2
    sn, stm, sm = _deepest(q, prn, ls), _deepest(q, ls, li), _deepest(q, li, pog)
    # gnathion: support point of the chin in the anterior-inferior direction
    tail = np.arange(pog, n)
    tail = tail[q[tail, 1] <= y[pog] + 0.3 * span]
    gn = int(tail[np.argmax(q[tail, 0] + q[tail, 1])]) if tail.size else pog
    order = [g, nas, prn, sn, ls, stm, li, sm, pog]
    if any(b <= a for a, b in pairwise(order)) or gn < pog:
        raise ProfileUnavailable("landmarks_unclear")
    return {"g": g, "n": nas, "prn": prn, "sn": sn, "ls": ls, "stm": stm, "li": li, "sm": sm, "pog": pog, "gn": gn}


def trace_profile(rgb: np.ndarray, seg: np.ndarray, face: Any | None = None, *,
                  min_scale_px: float = 0.0) -> ProfileTrace:
    """Find the anterior outline and its landmarks. Raises ProfileUnavailable with a reason."""
    fg, skin = profile_masks(seg)
    sign, top, bottom = profile_bounds(seg, fg, skin, face)
    face_h = bottom - top
    outline = _anterior_outline(fg, sign, top - int(0.1 * face_h), bottom + 1)
    end = int(np.searchsorted(outline[:, 1], bottom)) - 1
    # work facing right: mirror x, then rotate so the glabella → pogonion line is vertical (two passes)
    q0 = outline.copy()
    q0[:, 0] *= sign
    q = q0
    theta = 0.0
    idx: dict[str, int] = {}
    for _ in range(2):
        idx = _detect(q, end)
        a, b = q0[idx["g"]], q0[idx["pog"]]
        theta = math.atan2(b[0] - a[0], b[1] - a[1])                # tilt of the facial plane from vertical
        q = q0 @ _rot(theta).T
    idx = _detect(q, end)
    scale = float(np.linalg.norm(outline[idx["n"]] - outline[idx["gn"]]))
    if scale < min_scale_px:
        raise ProfileUnavailable("profile_too_small", {"scale_px": round(scale, 1)})
    trace = ProfileTrace(path=outline, facing="right" if sign > 0 else "left", scale_px=scale)
    trace.landmarks = {k: outline[i] for k, i in idx.items()}
    trace.landmarks["_q"] = q                                         # aligned copy (internal)
    trace.landmarks["_idx"] = idx                                     # type: ignore[assignment]
    if face is not None:
        tip = face.landmarks[1, :2]
        trace.nose_gap = float(np.min(np.linalg.norm(outline - tip, axis=1))) / scale
    return trace


# --- metrics -------------------------------------------------------------------------------------------------
def _angle(a: np.ndarray, v: np.ndarray, b: np.ndarray) -> float:
    u, w = a - v, b - v
    c = float(np.dot(u, w) / (np.linalg.norm(u) * np.linalg.norm(w) + 1e-12))
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def _signed_dist(p: np.ndarray, a: np.ndarray, b: np.ndarray, anterior: np.ndarray) -> float:
    """Distance of p from line a–b, positive on the anterior side."""
    d = (b - a) / np.linalg.norm(b - a)
    rel = p - a
    perp = rel - d * float(rel @ d)
    sgn = 1.0 if float(perp @ anterior) >= 0 else -1.0
    return sgn * float(np.linalg.norm(perp))


def _foot(p: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    d = (b - a) / np.linalg.norm(b - a)
    return a + d * float((p - a) @ d)


def _fit_dir(pts: np.ndarray) -> np.ndarray:
    c = pts - pts.mean(axis=0)
    _, _, vt = np.linalg.svd(c, full_matrices=False)
    return vt[0]


def side_points(trace: ProfileTrace) -> dict[str, np.ndarray]:
    """Named landmark + helper points (image px) used by both the formulas and the overlays."""
    L = trace.landmarks
    idx: dict[str, int] = L["_idx"]  # type: ignore[assignment]
    path = trace.path
    P = {"p_glabella": L["g"], "p_nasion": L["n"], "p_pronasale": L["prn"], "p_subnasale": L["sn"],
         "p_labrale_sup": L["ls"], "p_stomion": L["stm"], "p_labrale_inf": L["li"], "p_sulcus": L["sm"],
         "p_pogonion": L["pog"], "p_gnathion": L["gn"]}
    # columella point: on the outline 60% of the way from subnasale back towards the tip
    P["p_columella"] = path[idx["sn"] - int(0.6 * (idx["sn"] - idx["prn"]))]
    dm = (idx["n"] + idx["prn"]) // 2
    P["p_dorsum_mid"] = path[dm]
    # dorsum line (fit on the middle of nasion → tip), drawn from nasion level to the tip
    seg = path[idx["n"] + (idx["prn"] - idx["n"]) // 5: idx["prn"] - (idx["prn"] - idx["n"]) // 5 + 1]
    dvec = _fit_dir(seg)
    if dvec @ (P["p_pronasale"] - P["p_nasion"]) < 0:
        dvec = -dvec
    base = seg.mean(axis=0)
    P["p_dorsum_top"] = _foot(P["p_nasion"], base, base + dvec)
    P["p_dorsum_tip"] = _foot(P["p_pronasale"], base, base + dvec)
    P["p_foot_dorsum"] = P["p_dorsum_tip"]
    # E-line (pronasale → pogonion), extended 12% at both ends, and the feet of the lips on it
    e = P["p_pogonion"] - P["p_pronasale"]
    P["p_eline_a"], P["p_eline_b"] = P["p_pronasale"] - 0.12 * e, P["p_pogonion"] + 0.12 * e
    P["p_foot_ls_e"] = _foot(P["p_labrale_sup"], P["p_pronasale"], P["p_pogonion"])
    P["p_foot_li_e"] = _foot(P["p_labrale_inf"], P["p_pronasale"], P["p_pogonion"])
    # S-line (subnasale → pogonion; Burstone's reference)
    s = P["p_pogonion"] - P["p_subnasale"]
    P["p_sline_a"], P["p_sline_b"] = P["p_subnasale"] - 0.1 * s, P["p_pogonion"] + 0.1 * s
    P["p_foot_ls_s"] = _foot(P["p_labrale_sup"], P["p_subnasale"], P["p_pogonion"])
    # facial plane (glabella → pogonion), extended
    f = P["p_pogonion"] - P["p_glabella"]
    P["p_fp_top"], P["p_fp_bottom"] = P["p_glabella"] - 0.08 * f, P["p_pogonion"] + 0.08 * f
    # nasion → subnasale line extended to chin level, and the chin's foot on it
    ns = P["p_subnasale"] - P["p_nasion"]
    t = float((P["p_pogonion"] - P["p_nasion"]) @ ns / (ns @ ns))
    P["p_ns_bottom"] = P["p_nasion"] + max(1.05, t + 0.05) * ns
    P["p_foot_pog_ns"] = _foot(P["p_pogonion"], P["p_nasion"], P["p_subnasale"])
    P["p_foot_prn_ns"] = _foot(P["p_pronasale"], P["p_nasion"], P["p_subnasale"])
    # dorsum: the outline point furthest from the nasion → tip chord, and its foot on the chord
    seg2 = path[idx["n"] + 1: idx["prn"]]
    if len(seg2):
        ch = P["p_pronasale"] - P["p_nasion"]
        perp = seg2 - P["p_nasion"] - np.outer((seg2 - P["p_nasion"]) @ ch / (ch @ ch), ch)
        k = int(np.argmax(np.linalg.norm(perp, axis=1)))
        P["p_dorsum_peak"] = seg2[k]
        P["p_dorsum_peak_foot"] = seg2[k] - perp[k]
    # upper-lip line for the nasolabial angle: subnasale → labrale superius, same length as the columella arm
    P["p_lip_line_end"] = P["p_labrale_sup"]
    return P


def _anterior_dir(P: dict[str, np.ndarray]) -> np.ndarray:
    """Unit vector perpendicular to the facial plane, pointing to the face's front."""
    f = P["p_pogonion"] - P["p_glabella"]
    n = np.array([f[1], -f[0]]) / np.linalg.norm(f)
    return n if float((P["p_pronasale"] - P["p_glabella"]) @ n) > 0 else -n


Side = tuple[float, dict[str, float] | None, float]   # value, components, shortest arm (native px)


def _len(P: dict[str, np.ndarray], a: str, b: str) -> float:
    return float(np.linalg.norm(P[a] - P[b]))


def nasolabial_angle(P: dict[str, np.ndarray]) -> Side:
    v = _angle(P["p_columella"], P["p_subnasale"], P["p_labrale_sup"])
    return v, None, min(_len(P, "p_columella", "p_subnasale"), _len(P, "p_subnasale", "p_labrale_sup"))


def nasofrontal_angle(P: dict[str, np.ndarray]) -> Side:
    v = _angle(P["p_glabella"], P["p_nasion"], P["p_dorsum_tip"])
    return v, None, min(_len(P, "p_glabella", "p_nasion"), _len(P, "p_nasion", "p_dorsum_tip"))


def facial_convexity(P: dict[str, np.ndarray]) -> Side:
    v = _angle(P["p_glabella"], P["p_subnasale"], P["p_pogonion"])
    return v, None, min(_len(P, "p_glabella", "p_subnasale"), _len(P, "p_subnasale", "p_pogonion"))


def mentolabial_angle(P: dict[str, np.ndarray]) -> Side:
    v = _angle(P["p_labrale_inf"], P["p_sulcus"], P["p_pogonion"])
    return v, None, min(_len(P, "p_labrale_inf", "p_sulcus"), _len(P, "p_sulcus", "p_pogonion"))


def nasomental_angle(P: dict[str, np.ndarray]) -> Side:
    v = _angle(P["p_dorsum_top"], P["p_pronasale"], P["p_pogonion"])
    return v, None, min(_len(P, "p_dorsum_top", "p_pronasale"), _len(P, "p_pronasale", "p_pogonion"))


def nasofacial_angle(P: dict[str, np.ndarray]) -> Side:
    d = P["p_dorsum_tip"] - P["p_dorsum_top"]
    f = P["p_pogonion"] - P["p_glabella"]
    c = float(d @ f / (np.linalg.norm(d) * np.linalg.norm(f)))
    return math.degrees(math.acos(max(-1.0, min(1.0, c)))), None, _len(P, "p_dorsum_top", "p_dorsum_tip")


def e_line_upper(P: dict[str, np.ndarray]) -> Side:
    L = _len(P, "p_pronasale", "p_pogonion")
    return _signed_dist(P["p_labrale_sup"], P["p_pronasale"], P["p_pogonion"], _anterior_dir(P)) / L, None, L


def e_line_lower(P: dict[str, np.ndarray]) -> Side:
    L = _len(P, "p_pronasale", "p_pogonion")
    return _signed_dist(P["p_labrale_inf"], P["p_pronasale"], P["p_pogonion"], _anterior_dir(P)) / L, None, L


def s_line_upper(P: dict[str, np.ndarray]) -> Side:
    L = _len(P, "p_subnasale", "p_pogonion")
    ant = _anterior_dir(P)
    up = _signed_dist(P["p_labrale_sup"], P["p_subnasale"], P["p_pogonion"], ant) / L
    low = _signed_dist(P["p_labrale_inf"], P["p_subnasale"], P["p_pogonion"], ant) / L
    return up, {"upper": up, "lower": low}, L


def chin_projection(P: dict[str, np.ndarray]) -> Side:
    H = _len(P, "p_nasion", "p_gnathion")
    return _signed_dist(P["p_pogonion"], P["p_nasion"], P["p_subnasale"], _anterior_dir(P)) / H, None, H


def nasal_projection(P: dict[str, np.ndarray]) -> Side:
    L = _len(P, "p_nasion", "p_subnasale")
    return abs(_signed_dist(P["p_pronasale"], P["p_nasion"], P["p_subnasale"], _anterior_dir(P))) / L, None, L


def dorsum_convexity(P: dict[str, np.ndarray], path: np.ndarray, idx: dict[str, int]) -> Side:
    a, b = P["p_nasion"], P["p_pronasale"]
    L = float(np.linalg.norm(b - a))
    seg = path[idx["n"] + 1: idx["prn"]]
    if len(seg) < 4:
        raise ProfileUnavailable("landmarks_unclear")
    ant = _anterior_dir(P)
    d = np.array([_signed_dist(p, a, b, ant) for p in seg])
    k = int(np.argmax(np.abs(d)))
    return float(d[k]) / L, None, L


def lower_face_profile(P: dict[str, np.ndarray]) -> Side:
    f = (P["p_pogonion"] - P["p_glabella"]) / _len(P, "p_glabella", "p_pogonion")
    upper = float((P["p_stomion"] - P["p_subnasale"]) @ f)
    total = float((P["p_gnathion"] - P["p_subnasale"]) @ f)
    if total <= 0 or upper <= 0:
        raise ProfileUnavailable("landmarks_unclear")
    return upper / total, None, upper


SIDE_COMPUTE = {
    "nasolabial_angle": nasolabial_angle, "nasofrontal_angle": nasofrontal_angle, "facial_convexity": facial_convexity,
    "mentolabial_angle": mentolabial_angle, "nasomental_angle": nasomental_angle, "nasofacial_angle": nasofacial_angle,
    "e_line_upper": e_line_upper, "e_line_lower": e_line_lower, "s_line_upper": s_line_upper,
    "chin_projection": chin_projection, "nasal_projection": nasal_projection, "dorsum_convexity": dorsum_convexity,
    "lower_face_profile": lower_face_profile,
}


def compute_side(name: str, trace: ProfileTrace, P: dict[str, np.ndarray]) -> Side:
    fn = SIDE_COMPUTE[name]
    if fn is dorsum_convexity:
        return dorsum_convexity(P, trace.path, trace.landmarks["_idx"])  # type: ignore[arg-type]
    return fn(P)  # type: ignore[call-arg]


def silhouette(trace: ProfileTrace, shape: tuple[int, int], step: int = 2) -> list[list[float]]:
    """The traced outline from just above the glabella to just below the chin, normalized, for the overlay."""
    idx: dict[str, int] = trace.landmarks["_idx"]  # type: ignore[assignment]
    a = max(0, idx["g"] - (idx["n"] - idx["g"]))
    b = min(len(trace.path), idx["gn"] + (idx["gn"] - idx["pog"]) + 4)
    h, w = shape
    return [[round(float(x) / w, 4), round(float(y) / h, 4)] for x, y in trace.path[a:b:step]]
