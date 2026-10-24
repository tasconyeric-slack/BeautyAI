# Adapted from haircut-vision-advisor `src/haircut_vision/face_shape.py`
# https://github.com/Oby-Borges/haircut-vision-advisor
#
# MIT License
#
# Copyright (c) 2026 Haircut Vision Advisor contributors
#
# Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
# documentation files (the "Software"), to deal in the Software without restriction, including without limitation
# the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
# to permit persons to whom the Software is furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all copies or substantial portions of
# the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
# THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
# CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
# IN THE SOFTWARE.
#
# Changes: weights moved to config/rules.yaml (face_shape_heuristic); output shaped as the passport's
# anchors.face_shape_heuristic (CV layer); no clamping of inputs.
"""Transparent, tuneable face-shape heuristic over three landmark ratios. Scores are fit, not probabilities."""
from __future__ import annotations

from typing import Any

from .rules import load_rules


def _clamp(v: float) -> float:
    return max(0.0, min(1.0, v))


def _features(aspect: float, forehead: float, jaw: float) -> dict[str, float]:
    return {
        "aspect": aspect,
        "forehead": forehead,
        "jaw": jaw,
        "forehead_minus_jaw": forehead - jaw,
        "forehead_minus_jaw_abs": abs(forehead - jaw),
        "max_forehead_jaw": max(forehead, jaw),
    }


def _term(t: dict[str, Any], f: dict[str, float]) -> float:
    if "near" in t:
        name, target, tol = t["near"]
        return _clamp(1.0 - abs(f[name] - target) / tol)
    if "above" in t:
        name, start, span = t["above"]
        return _clamp((f[name] - start) / span)
    if "below_one" in t:
        name, span = t["below_one"]
        return _clamp((1.0 - f[name]) / span)
    raise ValueError(f"unknown heuristic term {t}")


def classify(aspect: float, forehead: float, jaw: float, cfg: dict | None = None) -> dict[str, Any]:
    """Return {top, runner_up, ambiguous, scores} — the `anchors.face_shape_heuristic` block."""
    hc = (cfg or load_rules())["face_shape_heuristic"]
    f = _features(aspect, forehead, jaw)
    scores = {label: sum(t["w"] * _term(t, f) for t in terms) for label, terms in hc["labels"].items()}
    (top, s1), (runner, s2) = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:2]
    return {
        "top": top,
        "runner_up": runner,
        "ambiguous": (s1 - s2) < hc["ambiguous_margin"],
        "scores": {k: round(v, 3) for k, v in scores.items()},
    }
