"""Load and check the versioned reference distributions (config/reference_distributions.json) and engine settings
(config/percentiles.yaml). Pure Python: no numpy, so the score engine runs in the core install."""
from __future__ import annotations

import json
from functools import lru_cache
from itertools import pairwise
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[3]
DATA_PATH = ROOT / "config" / "reference_distributions.json"
CONFIG_PATH = ROOT / "config" / "percentiles.yaml"


class ReferenceDataError(ValueError):
    """The reference file is internally inconsistent (non-monotonic anchors, bins not summing to 1, ...)."""


@lru_cache(maxsize=4)
def _load_json(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


@lru_cache(maxsize=4)
def _load_yaml(path: str) -> dict[str, Any]:
    return yaml.safe_load(Path(path).read_text(encoding="utf-8"))


def load_reference(path: str | Path | None = None) -> dict[str, Any]:
    data = _load_json(str(path or DATA_PATH))
    validate_reference(data)
    return data


def load_config(path: str | Path | None = None) -> dict[str, Any]:
    return _load_yaml(str(path or CONFIG_PATH))


def score_anchors(overall: dict[str, Any]) -> list[tuple[float, float]]:
    """(reference score, share of scans scoring below it) from every published fact: cumulative bin edges, the median
    and the top-X% thresholds. Duplicate scores must agree; the result is strictly increasing in both coordinates."""
    pts: dict[float, float] = {}

    def add(score: float, below: float) -> None:
        if score in pts and abs(pts[score] - below) > 1e-6:
            raise ReferenceDataError(f"conflicting anchors at score {score}: {pts[score]} vs {below}")
        pts[score] = below

    cum = 0.0
    for b in overall["bins"]:
        cum += b["share"]
        if b["hi"] is not None:
            add(float(b["hi"]), round(cum, 6))
    if abs(cum - 1.0) > 1e-3:
        raise ReferenceDataError(f"score bins sum to {cum}, not 1")
    add(float(overall["summary"]["median"]), 0.5)
    for t in overall["top_thresholds"]:
        add(float(t["score"]), round(1.0 - t["top_share"], 6))
    out = sorted(pts.items())
    for (s0, p0), (s1, p1) in pairwise(out):
        if not (s1 > s0 and p1 > p0):
            raise ReferenceDataError(f"score anchors not strictly increasing near {s0}→{s1}")
    return out


def validate_reference(data: dict[str, Any]) -> None:
    score_anchors(data["overall_score"])
    norms = data["ratio_norms"]
    levels = norms["quantile_levels"]
    if levels != sorted(levels) or len(set(levels)) != len(levels):
        raise ReferenceDataError("quantile levels must be strictly increasing")
    ids = [m["id"] for m in norms["metrics"]]
    if len(set(ids)) != len(ids):
        raise ReferenceDataError("duplicate ratio ids")
    for m in norms["metrics"]:
        q = m["quantiles"]
        if len(q) != len(levels) or any(b < a for a, b in pairwise(q)):
            raise ReferenceDataError(f"{m['id']}: quantiles must be non-decreasing and match the levels")


def interp(x: float, knots: list[tuple[float, float]]) -> float:
    """Piecewise-linear y(x) on sorted knots; clamps outside the knot range."""
    if x <= knots[0][0]:
        return knots[0][1]
    if x >= knots[-1][0]:
        return knots[-1][1]
    for (x0, y0), (x1, y1) in pairwise(knots):
        if x0 <= x <= x1:
            return y0 if x1 == x0 else y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    raise AssertionError("unreachable")
