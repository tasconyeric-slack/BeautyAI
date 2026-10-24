"""Metric formulas. Each function: (Frame, Ctx) → (value, components | None), or raises Missing(reason).

Pure geometry on the roll-corrected frame (points.py). No clamping, no scoring: the caller checks `valid_range` and
turns an implausible value into "not measured". Angles are in degrees with the image y axis pointing down, so
"higher" means a smaller y.
"""
from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import numpy as np

from .points import (
    LID_L_LO,
    LID_L_UP,
    LID_R_LO,
    LID_R_UP,
    MIRROR_PAIRS,
    OVAL_PAIRS,
    Frame,
    mirror_residual,
    symmetry_axis,
)

Result = tuple[float, dict[str, float] | None]


class Missing(Exception):
    """The metric cannot be measured on this photo; `reason` is a key of missing_reasons_zh."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@dataclass
class Ctx:
    cheek_w: float
    eye_w: float
    hairline_y: float | None          # frame y of the hairline, None when not found
    upper_occluded: bool
    mouth_open: bool
    eyes_closed: bool
    yaw: float | None
    gates: dict[str, Any]
    color: dict[str, Any] | None      # color_measurements (skin L*, b*) or None
    cheeks_lab: dict[str, tuple[float, float, float]] | None   # per-cheek Lab medians
    rgb: Any = None                   # the photo (V3B capture metrics), may be None
    face: Any = None                  # cv.Face for the photo, may be None
    seg: Any = None                   # selfie-multiclass mask, may be None
    pitch: float | None = None


def _ang(dx: float, dy_up: float) -> float:
    return math.degrees(math.atan2(dy_up, dx))


def _angle_at(f: Frame, a: str, v: str, b: str) -> float:
    u, w = f.p(a) - f.p(v), f.p(b) - f.p(v)
    cos = float(np.dot(u, w) / (np.linalg.norm(u) * np.linalg.norm(w)))
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


def _pair(left: float, right: float) -> Result:
    return (left + right) / 2, {"image_left": left, "image_right": right}


def _need_hairline(c: Ctx) -> float:
    if c.hairline_y is None:
        raise Missing("upper_third_occluded" if c.upper_occluded else "hairline_not_found")
    return c.hairline_y


def _thirds(f: Frame, c: Ctx) -> tuple[float, float, float]:
    hy = _need_hairline(c)
    up = f.p("glabella")[1] - hy
    mid = f.dy("glabella", "subnasale")
    low = f.dy("subnasale", "chin")
    return up, mid, low


def _need(cond: bool, reason: str) -> None:
    if not cond:
        raise Missing(reason)


def _eye_widths(f: Frame) -> tuple[float, float]:
    return f.d("eye_l_outer", "eye_l_inner"), f.d("eye_r_inner", "eye_r_outer")


def _eye_heights(f: Frame) -> tuple[float, float]:
    return f.d("eye_l_top", "eye_l_bottom"), f.d("eye_r_top", "eye_r_bottom")


def _brow_gaps(f: Frame) -> tuple[float, float]:
    return f.dy("brow_l_low", "eye_l_top"), f.dy("brow_r_low", "eye_r_top")


# --- overall ---------------------------------------------------------------------------------------------------
def face_length_width(f: Frame, c: Ctx) -> Result:
    return f.d("forehead_top", "chin") / c.cheek_w, None


def forehead_cheek(f: Frame, c: Ctx) -> Result:
    return f.d("forehead_l", "forehead_r") / c.cheek_w, None


def jaw_cheek(f: Frame, c: Ctx) -> Result:
    return f.d("jaw_l", "jaw_r") / c.cheek_w, None


def outline_fill(f: Frame, c: Ctx) -> Result:
    from ..cv import FACE_OVAL

    pts = np.array([f.i(i) for i in FACE_OVAL])
    x, y = pts[:, 0], pts[:, 1]
    area = 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))
    box = float((x.max() - x.min()) * (y.max() - y.min()))
    return area / box, None


# --- proportions -----------------------------------------------------------------------------------------------
def upper_third(f: Frame, c: Ctx) -> Result:
    up, mid, low = _thirds(f, c)
    return up / (up + mid + low), None


def middle_third(f: Frame, c: Ctx) -> Result:
    up, mid, low = _thirds(f, c)
    return mid / (up + mid + low), None


def lower_third(f: Frame, c: Ctx) -> Result:
    up, mid, low = _thirds(f, c)
    return low / (up + mid + low), None


def middle_lower(f: Frame, c: Ctx) -> Result:
    return f.dy("glabella", "subnasale") / f.dy("subnasale", "chin"), None


def upper_middle(f: Frame, c: Ctx) -> Result:
    up, mid, _low = _thirds(f, c)
    return up / mid, None


def philtrum_lower(f: Frame, c: Ctx) -> Result:
    return f.dy("subnasale", "lip_top") / f.dy("subnasale", "chin"), None


def chin_lower(f: Frame, c: Ctx) -> Result:
    return f.dy("lip_bottom", "chin") / f.dy("subnasale", "chin"), None


def fifths_spread(f: Frame, c: Ctx) -> Result:
    xs = [f.p(n)[0] for n in ("temple_l", "eye_l_outer", "eye_l_inner", "eye_r_inner", "eye_r_outer", "temple_r")]
    seg = np.diff(xs)
    if np.any(seg <= 0):
        raise Missing("out_of_range")
    return float(seg.std() / seg.mean()), None


# --- eyes ------------------------------------------------------------------------------------------------------
def intercanthal_eye(f: Frame, c: Ctx) -> Result:
    return f.d("eye_l_inner", "eye_r_inner") / c.eye_w, None


def intercanthal_face(f: Frame, c: Ctx) -> Result:
    return f.d("eye_l_inner", "eye_r_inner") / c.cheek_w, None


def interpupil_face(f: Frame, c: Ctx) -> Result:
    _need(f.has_iris, "no_iris")
    return f.d("iris_l", "iris_r") / c.cheek_w, None


def eye_width_iris(f: Frame, c: Ctx) -> Result:
    _need(f.has_iris, "no_iris")
    wl, wr = _eye_widths(f)
    il, ir = f.d("iris_l_a", "iris_l_b"), f.d("iris_r_a", "iris_r_b")
    _need(il > 0 and ir > 0, "no_iris")
    return _pair(wl / il, wr / ir)


def eye_aspect(f: Frame, c: Ctx) -> Result:
    _need(not c.eyes_closed, "eyes_closed")
    (wl, wr), (hl, hr) = _eye_widths(f), _eye_heights(f)
    return _pair(hl / wl, hr / wr)


def canthal_tilt(f: Frame, c: Ctx) -> Result:
    li, lo = f.p("eye_l_inner"), f.p("eye_l_outer")
    ri, ro = f.p("eye_r_inner"), f.p("eye_r_outer")
    left = _ang(abs(lo[0] - li[0]), li[1] - lo[1])
    right = _ang(abs(ro[0] - ri[0]), ri[1] - ro[1])
    return _pair(left, right)


# --- brows -----------------------------------------------------------------------------------------------------
def brow_length_face(f: Frame, c: Ctx) -> Result:
    v, comp = _pair(f.d("brow_l_head", "brow_l_tail"), f.d("brow_r_head", "brow_r_tail"))
    return v / c.cheek_w, {k: x / c.cheek_w for k, x in comp.items()}  # type: ignore[union-attr]


def brow_tilt(f: Frame, c: Ctx) -> Result:
    lh, lt = f.p("brow_l_head"), f.p("brow_l_tail")
    rh, rt = f.p("brow_r_head"), f.p("brow_r_tail")
    return _pair(_ang(abs(lt[0] - lh[0]), lh[1] - lt[1]), _ang(abs(rt[0] - rh[0]), rh[1] - rt[1]))


def brow_eye_gap(f: Frame, c: Ctx) -> Result:
    gl, gr = _brow_gaps(f)
    return _pair(gl / c.eye_w, gr / c.eye_w)


def brow_head_gap(f: Frame, c: Ctx) -> Result:
    return f.d("brow_l_head", "brow_r_head") / f.d("eye_l_inner", "eye_r_inner"), None


def brow_peak_position(f: Frame, c: Ctx) -> Result:
    out = []
    for s in "lr":
        head, tail, peak = f.p(f"brow_{s}_head"), f.p(f"brow_{s}_tail"), f.p(f"brow_{s}_peak")
        axis = tail - head
        out.append(float(np.dot(peak - head, axis) / np.dot(axis, axis)))
    return _pair(*out)


# --- nose ------------------------------------------------------------------------------------------------------
def alar_face(f: Frame, c: Ctx) -> Result:
    return f.d("alar_l", "alar_r") / c.cheek_w, None


def nose_length_width(f: Frame, c: Ctx) -> Result:
    return f.dy("nasion", "subnasale") / f.d("alar_l", "alar_r"), None


def nasal_axis_tilt(f: Frame, c: Ctx) -> Result:
    n, s = f.p("nasion"), f.p("subnasale")
    return abs(math.degrees(math.atan2(s[0] - n[0], s[1] - n[1]))), None


# --- lips ------------------------------------------------------------------------------------------------------
def mouth_face(f: Frame, c: Ctx) -> Result:
    return f.d("mouth_l", "mouth_r") / c.cheek_w, None


def _lip_heights(f: Frame, c: Ctx) -> tuple[float, float]:
    _need(not c.mouth_open, "mouth_open")
    return f.dy("lip_top", "lip_upper_inner"), f.dy("lip_lower_inner", "lip_bottom")


def lip_ratio(f: Frame, c: Ctx) -> Result:
    up, low = _lip_heights(f, c)
    _need(low > 0, "out_of_range")
    return up / low, None


def lip_fullness(f: Frame, c: Ctx) -> Result:
    up, low = _lip_heights(f, c)
    return (up + low) / f.d("mouth_l", "mouth_r"), None


def cupid_bow(f: Frame, c: Ctx) -> Result:
    up, _low = _lip_heights(f, c)
    _need(up > 0, "out_of_range")
    peaks_y = (f.p("bow_l")[1] + f.p("bow_r")[1]) / 2
    return (f.p("lip_top")[1] - peaks_y) / up, None


def mouth_corner_tilt(f: Frame, c: Ctx) -> Result:
    a, b = f.p("mouth_l"), f.p("mouth_r")
    return abs(_ang(b[0] - a[0], a[1] - b[1])), None


# --- jaw -------------------------------------------------------------------------------------------------------
def chin_angle(f: Frame, c: Ctx) -> Result:
    return _angle_at(f, "jaw_l", "chin", "jaw_r"), None


def jaw_corner_angle(f: Frame, c: Ctx) -> Result:
    return _pair(_angle_at(f, "ramus_l", "jaw_l", "chin"), _angle_at(f, "ramus_r", "jaw_r", "chin"))


def chin_width_jaw(f: Frame, c: Ctx) -> Result:
    return f.d("chin_l", "chin_r") / f.d("jaw_l", "jaw_r"), None


# --- symmetry --------------------------------------------------------------------------------------------------
def _sym_gate(c: Ctx) -> None:
    if c.yaw is not None and abs(c.yaw) > c.gates["symmetry_max_yaw"]:
        raise Missing("pose_off_axis")


def _rel_diff(a: float, b: float) -> float:
    return abs(a - b) / ((a + b) / 2)


def landmark_symmetry(f: Frame, c: Ctx) -> Result:
    _sym_gate(c)
    axis = symmetry_axis(f, MIRROR_PAIRS)
    return mirror_residual(f, MIRROR_PAIRS, axis) / c.cheek_w, {
        "contour": mirror_residual(f, OVAL_PAIRS, axis) / c.cheek_w}


def eye_width_asym(f: Frame, c: Ctx) -> Result:
    _sym_gate(c)
    return _rel_diff(*_eye_widths(f)), None


def eye_height_asym(f: Frame, c: Ctx) -> Result:
    _sym_gate(c)
    _need(not c.eyes_closed, "eyes_closed")
    return _rel_diff(*_eye_heights(f)), None


def outer_canthus_height(f: Frame, c: Ctx) -> Result:
    _sym_gate(c)
    return abs(f.p("eye_l_outer")[1] - f.p("eye_r_outer")[1]) / c.eye_w, None


def brow_height_asym(f: Frame, c: Ctx) -> Result:
    _sym_gate(c)
    gl, gr = _brow_gaps(f)
    _need(gl > 0 and gr > 0, "out_of_range")
    return _rel_diff(gl, gr), None


def nose_tip_offset(f: Frame, c: Ctx) -> Result:
    _sym_gate(c)
    return abs(f.p("nose_tip")[0] - f.p("nose_tip_axis")[0]) / c.cheek_w, None


# --- skin & capture --------------------------------------------------------------------------------------------
def _need_color(c: Ctx) -> dict[str, Any]:
    _need(c.color is not None, "color_unavailable")
    return c.color  # type: ignore[return-value]


def skin_lightness(f: Frame, c: Ctx) -> Result:
    return float(_need_color(c)["depth_L"]), None


def skin_warmth(f: Frame, c: Ctx) -> Result:
    return float(_need_color(c)["warmth_b"]), None


def _cheeks(c: Ctx) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    _need(bool(c.cheeks_lab) and len(c.cheeks_lab) == 2, "color_unavailable")
    return c.cheeks_lab["cheek_sample_l"], c.cheeks_lab["cheek_sample_r"]  # type: ignore[index]


def cheek_color_diff(f: Frame, c: Ctx) -> Result:
    a, b = _cheeks(c)
    return float(math.dist(a, b)), None


def light_balance(f: Frame, c: Ctx) -> Result:
    a, b = _cheeks(c)
    return abs(a[0] - b[0]), {"image_left": a[0], "image_right": b[0]}


def head_roll(f: Frame, c: Ctx) -> Result:
    return abs(f.roll_deg), None


def mouth_opening(f: Frame, c: Ctx) -> Result:
    return f.d("lip_upper_inner", "lip_lower_inner") / f.d("mouth_l", "mouth_r"), None


# === V3B additions (D35) =========================================================================================
def _face_len(f: Frame) -> float:
    return f.d("forehead_top", "chin")


def _iris_d(f: Frame) -> float:
    _need(f.has_iris, "no_iris")
    d = (f.d("iris_l_a", "iris_l_b") + f.d("iris_r_a", "iris_r_b")) / 2
    _need(d > 0, "no_iris")
    return d


def face_width_iris(f: Frame, c: Ctx) -> Result:
    return c.cheek_w / _iris_d(f), None


def temple_cheek(f: Frame, c: Ctx) -> Result:
    return f.d("temple_l", "temple_r") / c.cheek_w, None


def mouth_level_width(f: Frame, c: Ctx) -> Result:
    return f.d("face_mouth_l", "face_mouth_r") / c.cheek_w, None


_FEATURES = ("brow_l_tail", "brow_r_tail", "brow_l_head", "brow_r_head", "eye_l_outer", "eye_r_outer", "alar_l",
             "alar_r", "mouth_l", "mouth_r", "lip_bottom", "brow_l_peak", "brow_r_peak")


def feature_concentration(f: Frame, c: Ctx) -> Result:
    from ..cv import FACE_OVAL

    pts = np.array([f.p(n) for n in _FEATURES])
    box = float(np.ptp(pts[:, 0]) * np.ptp(pts[:, 1]))
    oval = np.array([f.i(i) for i in FACE_OVAL])
    x, y = oval[:, 0], oval[:, 1]
    area = 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))
    return box / area, None


def feature_center(f: Frame, c: Ctx) -> Result:
    ys = np.array([f.p(n)[1] for n in _FEATURES])
    top, bottom = f.p("forehead_top")[1], f.p("chin")[1]
    return float((ys.mean() - top) / (bottom - top)), None


def upper_lip_segment(f: Frame, c: Ctx) -> Result:
    _need(not c.mouth_open, "mouth_open")
    return f.dy("subnasale", "stomion") / f.dy("subnasale", "chin"), None


def _eye_line_y(f: Frame) -> float:
    return float((f.p("eye_l_center")[1] + f.p("eye_r_center")[1]) / 2)


def eye_mouth_vertical(f: Frame, c: Ctx) -> Result:
    return (f.p("stomion")[1] - _eye_line_y(f)) / _face_len(f), None


def _fifths(f: Frame) -> np.ndarray:
    xs = [f.p(n)[0] for n in ("temple_l", "eye_l_outer", "eye_l_inner", "eye_r_inner", "eye_r_outer", "temple_r")]
    seg = np.diff(xs)
    if np.any(seg <= 0):
        raise Missing("out_of_range")
    return seg


def outer_fifths_diff(f: Frame, c: Ctx) -> Result:
    _sym_gate(c)
    seg = _fifths(f)
    return abs(seg[0] - seg[4]) / seg.mean(), {"image_left": seg[0] / seg.mean(), "image_right": seg[4] / seg.mean()}


def eye_fifth(f: Frame, c: Ctx) -> Result:
    seg = _fifths(f)
    return (seg[1] + seg[3]) / 2 / seg.mean(), None


def eye_subnasale(f: Frame, c: Ctx) -> Result:
    return (f.p("subnasale")[1] - _eye_line_y(f)) / _face_len(f), None


def lower_face_length(f: Frame, c: Ctx) -> Result:
    return f.dy("subnasale", "chin") / _face_len(f), None


def outer_canthal_face(f: Frame, c: Ctx) -> Result:
    return f.d("eye_l_outer", "eye_r_outer") / c.cheek_w, None


def _ring_area(f: Frame, up: list[int], lo: list[int]) -> float:
    ring = np.array([f.i(i) for i in up + lo[::-1][1:-1]])
    x, y = ring[:, 0], ring[:, 1]
    return 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))


def eye_roundness(f: Frame, c: Ctx) -> Result:
    _need(not c.eyes_closed, "eyes_closed")
    wl, wr = _eye_widths(f)
    return _pair(_ring_area(f, LID_L_UP, LID_L_LO) / wl ** 2, _ring_area(f, LID_R_UP, LID_R_LO) / wr ** 2)


def _lid_y(f: Frame, lid: list[int], x: float) -> float | None:
    pts = np.array([f.i(i) for i in lid])
    o = np.argsort(pts[:, 0])
    if not pts[o[0], 0] <= x <= pts[o[-1], 0]:
        return None
    return float(np.interp(x, pts[o, 0], pts[o, 1]))


def _iris(f: Frame, side: str) -> tuple[np.ndarray, float]:
    _need(f.has_iris, "no_iris")
    r = f.d(f"iris_{side}_a", f"iris_{side}_b") / 2
    _need(r > 0, "no_iris")
    return f.p(f"iris_{side}"), r


def iris_exposure(f: Frame, c: Ctx) -> Result:
    _need(not c.eyes_closed, "eyes_closed")
    out = []
    for side, up, lo in (("l", LID_L_UP, LID_L_LO), ("r", LID_R_UP, LID_R_LO)):
        ctr, r = _iris(f, side)
        g = np.linspace(-1, 1, 21)
        xx, yy = np.meshgrid(g, g)
        inside = xx ** 2 + yy ** 2 <= 1
        vis = 0
        for dx, dy in zip(xx[inside], yy[inside], strict=True):
            x, y = ctr[0] + dx * r, ctr[1] + dy * r
            yu, yl = _lid_y(f, up, x), _lid_y(f, lo, x)
            vis += yu is not None and yl is not None and yu <= y <= yl
        out.append(vis / int(inside.sum()))
    return _pair(*out)


def pupil_vertical(f: Frame, c: Ctx) -> Result:
    out = []
    for side in "lr":
        ctr, _r = _iris(f, side)
        a, b = f.p(f"eye_{side}_inner"), f.p(f"eye_{side}_outer")
        t = (ctr[0] - a[0]) / (b[0] - a[0])
        line_y = a[1] + t * (b[1] - a[1])
        w = float(np.linalg.norm(b - a))
        out.append((line_y - ctr[1]) / w)                   # above the canthal line → positive
    return _pair(*out)


def lower_scleral(f: Frame, c: Ctx) -> Result:
    _need(not c.eyes_closed, "eyes_closed")
    out = []
    for side, lo in (("l", LID_L_LO), ("r", LID_R_LO)):
        ctr, r = _iris(f, side)
        yl = _lid_y(f, lo, float(ctr[0]))
        _need(yl is not None, "out_of_range")
        out.append((yl - (ctr[1] + r)) / (2 * r))  # type: ignore[operator]
    return _pair(*out)


def inner_canthal_angle(f: Frame, c: Ctx) -> Result:
    _need(not c.eyes_closed, "eyes_closed")
    return _pair(_angle_at(f, "eye_l_up_in", "eye_l_inner", "eye_l_lo_in"),
                 _angle_at(f, "eye_r_up_in", "eye_r_inner", "eye_r_lo_in"))


def outer_canthal_angle(f: Frame, c: Ctx) -> Result:
    _need(not c.eyes_closed, "eyes_closed")
    return _pair(_angle_at(f, "eye_l_up_out", "eye_l_outer", "eye_l_lo_out"),
                 _angle_at(f, "eye_r_up_out", "eye_r_outer", "eye_r_lo_out"))


def lid_apex(f: Frame, c: Ctx) -> Result:
    _need(not c.eyes_closed, "eyes_closed")
    out = []
    for side in "lr":
        a, b, p = f.p(f"eye_{side}_inner"), f.p(f"eye_{side}_outer"), f.p(f"eye_{side}_apex")
        out.append(float(np.dot(p - a, b - a) / np.dot(b - a, b - a)))
    return _pair(*out)


def _arch(f: Frame, side: str) -> float:
    head, tail, peak = f.p(f"brow_{side}_head"), f.p(f"brow_{side}_tail"), f.p(f"brow_{side}_peak")
    foot = f.p(f"brow_{side}_arch_foot")
    return float(np.linalg.norm(peak - foot)) * (1 if peak[1] <= foot[1] else -1) / float(np.linalg.norm(tail - head))


def brow_arch(f: Frame, c: Ctx) -> Result:
    return _pair(_arch(f, "l"), _arch(f, "r"))


def brow_tail_diff(f: Frame, c: Ctx) -> Result:
    _sym_gate(c)
    return abs(f.p("brow_l_tail")[1] - f.p("brow_r_tail")[1]) / c.eye_w, None


def brow_eye_length(f: Frame, c: Ctx) -> Result:
    wl, wr = _eye_widths(f)
    return _pair(f.d("brow_l_head", "brow_l_tail") / wl, f.d("brow_r_head", "brow_r_tail") / wr)


def brow_head_align(f: Frame, c: Ctx) -> Result:
    # positive = the brow head starts nearer the midline than the inner eye corner
    left = (f.p("brow_l_head")[0] - f.p("eye_l_inner")[0]) / c.eye_w
    right = (f.p("eye_r_inner")[0] - f.p("brow_r_head")[0]) / c.eye_w
    return _pair(left, right)


def brow_tail_extension(f: Frame, c: Ctx) -> Result:
    # positive = the brow tail ends beyond the outer eye corner
    left = (f.p("eye_l_outer")[0] - f.p("brow_l_tail")[0]) / c.eye_w
    right = (f.p("brow_r_tail")[0] - f.p("eye_r_outer")[0]) / c.eye_w
    return _pair(left, right)


def alar_intercanthal(f: Frame, c: Ctx) -> Result:
    return f.d("alar_l", "alar_r") / f.d("eye_l_inner", "eye_r_inner"), None


def nose_face_length(f: Frame, c: Ctx) -> Result:
    return f.dy("nasion", "subnasale") / _face_len(f), None


def nose_tip_position(f: Frame, c: Ctx) -> Result:
    return f.dy("nasion", "nose_tip") / f.dy("nasion", "subnasale"), None


def mouth_alar(f: Frame, c: Ctx) -> Result:
    return f.d("mouth_l", "mouth_r") / f.d("alar_l", "alar_r"), None


def upper_vermilion(f: Frame, c: Ctx) -> Result:
    up, _low = _lip_heights(f, c)
    return up / f.d("mouth_l", "mouth_r"), None


def lower_vermilion(f: Frame, c: Ctx) -> Result:
    _up, low = _lip_heights(f, c)
    return low / f.d("mouth_l", "mouth_r"), None


def bow_peak_distance(f: Frame, c: Ctx) -> Result:
    return f.d("bow_l", "bow_r") / f.d("mouth_l", "mouth_r"), None


def _axis_offset(f: Frame, name: str, c: Ctx) -> float:
    q = f.p(name)
    return abs(float(q[0]) - float(f.p(f"{name}_axis")[0])) / c.cheek_w


def lip_midline_offset(f: Frame, c: Ctx) -> Result:
    _sym_gate(c)
    return _axis_offset(f, "lip_top", c), None


def mouth_ipd(f: Frame, c: Ctx) -> Result:
    _need(f.has_iris, "no_iris")
    return f.d("mouth_l", "mouth_r") / f.d("iris_l", "iris_r"), None


def jaw_line_slope(f: Frame, c: Ctx) -> Result:
    jl, jr, ch = f.p("jaw_l"), f.p("jaw_r"), f.p("chin")
    return _pair(_ang(abs(ch[0] - jl[0]), ch[1] - jl[1]), _ang(abs(jr[0] - ch[0]), ch[1] - jr[1]))


def chin_tip_angle(f: Frame, c: Ctx) -> Result:
    return _angle_at(f, "chin_l2", "chin", "chin_r2"), None


def cheek_contour_angle(f: Frame, c: Ctx) -> Result:
    return _pair(_angle_at(f, "cheek_l", "ramus_l", "jaw_l"), _angle_at(f, "cheek_r", "ramus_r", "jaw_r"))


def zygomatic_turn(f: Frame, c: Ctx) -> Result:
    return _pair(_angle_at(f, "temple_l", "cheek_l", "ramus_l"), _angle_at(f, "temple_r", "cheek_r", "ramus_r"))


def inner_canthus_height(f: Frame, c: Ctx) -> Result:
    _sym_gate(c)
    return abs(f.p("eye_l_inner")[1] - f.p("eye_r_inner")[1]) / c.eye_w, None


def brow_arch_asym(f: Frame, c: Ctx) -> Result:
    _sym_gate(c)
    return abs(_arch(f, "l") - _arch(f, "r")), None


def contour_symmetry(f: Frame, c: Ctx) -> Result:
    _sym_gate(c)
    axis = symmetry_axis(f, MIRROR_PAIRS)
    return mirror_residual(f, OVAL_PAIRS, axis) / c.cheek_w, None


def _side_diff(f: Frame, c: Ctx, a: str, b: str) -> Result:
    _sym_gate(c)
    da = abs(float(f.p(a)[0] - f.p(f"{a}_axis")[0]))
    db = abs(float(f.p(b)[0] - f.p(f"{b}_axis")[0]))
    return abs(da - db) / c.cheek_w, {"image_left": da / c.cheek_w, "image_right": db / c.cheek_w}


def jaw_asym(f: Frame, c: Ctx) -> Result:
    return _side_diff(f, c, "jaw_l", "jaw_r")


def cheek_asym(f: Frame, c: Ctx) -> Result:
    return _side_diff(f, c, "cheek_l", "cheek_r")


def chin_offset(f: Frame, c: Ctx) -> Result:
    _sym_gate(c)
    return _axis_offset(f, "chin", c), None


def _region(c: Ctx, name: str) -> tuple[float, float, float]:
    col = _need_color(c)
    r = (col.get("regions") or {}).get(name)
    _need(r is not None, "color_unavailable")
    lab = r["lab"]
    return float(lab["L"]), float(lab["a"]), float(lab["b"])


def skin_redness(f: Frame, c: Ctx) -> Result:
    return _region(c, "skin")[1], None


def skin_chroma(f: Frame, c: Ctx) -> Result:
    _L, a, b = _region(c, "skin")
    return math.hypot(a, b), None


def hair_lightness(f: Frame, c: Ctx) -> Result:
    return _region(c, "hair")[0], None


def brow_hair_contrast(f: Frame, c: Ctx) -> Result:
    return abs(_region(c, "brow")[0] - _region(c, "hair")[0]), None


def skin_hair_contrast(f: Frame, c: Ctx) -> Result:
    return _region(c, "skin")[0] - _region(c, "hair")[0], None


def lip_skin_contrast(f: Frame, c: Ctx) -> Result:
    return float(math.dist(_region(c, "lip"), _region(c, "skin"))), None


def skin_texture(f: Frame, c: Ctx) -> Result:
    _need(c.rgb is not None and c.face is not None, "color_unavailable")
    from ..qc import skin_texture as tex

    v = tex(np.asarray(c.rgb), c.face)
    _need(v is not None, "color_unavailable")
    return float(v), None  # type: ignore[arg-type]


def feature_edge_width(f: Frame, c: Ctx) -> Result:
    _need(c.rgb is not None and c.face is not None, "color_unavailable")
    from ..qc import feature_sharpness, load_qc_config

    r = feature_sharpness(np.asarray(c.rgb), c.face, load_qc_config()["gate"])
    _need(r is not None, "color_unavailable")
    return float(r[0]), None  # type: ignore[index]


def _hair_mask(c: Ctx) -> np.ndarray:
    from ..cv import SEG_HAIR

    _need(c.seg is not None, "hair_unavailable")
    m = np.asarray(c.seg) == SEG_HAIR
    _need(int(m.sum()) > 200, "hair_unavailable")
    return m


def hair_coverage(f: Frame, c: Ctx) -> Result:
    from ..cv import face_oval_mask

    hair = _hair_mask(c)
    oval = face_oval_mask(c.face, hair.shape) > 0
    return float(hair.sum()) / max(1.0, float(oval.sum())), None


def _head_mask(c: Ctx) -> np.ndarray:
    from ..cv import SEG_FACE_SKIN, SEG_HAIR

    seg = np.asarray(c.seg)
    return (seg == SEG_HAIR) | (seg == SEG_FACE_SKIN)


def hair_silhouette_aspect(f: Frame, c: Ctx) -> Result:
    _hair_mask(c)
    ys, xs = np.nonzero(_head_mask(c))
    h = float(ys.max() - ys.min())
    _need(h > 0, "hair_unavailable")
    return float(xs.max() - xs.min()) / h, None


def hair_side_volume(f: Frame, c: Ctx) -> Result:
    _hair_mask(c)
    head = _head_mask(c)
    y = round(float(f.raw(LANDMARKS_TEMPLE_ROW)[1]))
    _need(0 <= y < head.shape[0], "hair_unavailable")
    cols = np.flatnonzero(head[y])
    _need(cols.size > 0, "hair_unavailable")
    return float(cols.max() - cols.min()) / c.cheek_w, None


LANDMARKS_TEMPLE_ROW = (127, 356)


# --- smile (needs the smile photo AND the neutral front; never mixed into the neutral baseline) ------------------
@dataclass
class SmileCtx:
    neutral: Frame
    smile: Frame


def _mouth_ratio(f: Frame) -> float:
    return f.d("mouth_l", "mouth_r") / f.d("cheek_l", "cheek_r")


def smile_width(s: SmileCtx) -> Result:
    return _mouth_ratio(s.smile) / _mouth_ratio(s.neutral), None


def smile_corner_lift(s: SmileCtx) -> Result:
    f = s.smile
    mid = f.p("stomion")
    w = f.d("mouth_l", "mouth_r")
    left = (mid[1] - f.p("mouth_l")[1]) / w
    right = (mid[1] - f.p("mouth_r")[1]) / w
    return _pair(math.degrees(math.atan2(left * w, abs(mid[0] - f.p("mouth_l")[0]))),
                 math.degrees(math.atan2(right * w, abs(f.p("mouth_r")[0] - mid[0]))))


def smile_symmetry(s: SmileCtx) -> Result:
    f = s.smile
    return abs(f.p("mouth_l")[1] - f.p("mouth_r")[1]) / f.d("mouth_l", "mouth_r"), None


def smile_eye_narrowing(s: SmileCtx) -> Result:
    def aspect(f: Frame) -> float:
        (wl, wr), (hl, hr) = _eye_widths(f), _eye_heights(f)
        return (hl / wl + hr / wr) / 2

    n = aspect(s.neutral)
    _need(n > 0, "eyes_closed")
    return aspect(s.smile) / n, None


SMILE_COMPUTE: dict[str, Callable[[SmileCtx], Result]] = {
    "smile_width": smile_width, "smile_corner_lift": smile_corner_lift, "smile_symmetry": smile_symmetry,
    "smile_eye_narrowing": smile_eye_narrowing,
}


COMPUTE: dict[str, Callable[[Frame, Ctx], Result]] = {
    name: fn for name, fn in globals().items()
    if callable(fn) and not name.startswith("_") and getattr(fn, "__module__", None) == __name__
    and name not in {"Missing", "Ctx", "Frame", "SmileCtx"} and not name.startswith("smile_")
}
