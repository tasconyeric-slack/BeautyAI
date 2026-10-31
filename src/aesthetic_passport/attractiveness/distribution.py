"""A density visualization of the existing reference, independent of its ECDF rank."""
from __future__ import annotations

import math
from typing import Any

import numpy as np


def density_curve(distribution: list[dict[str, Any]], *, native: list[float], display: list[float],
                  points: int, min_bandwidth: float) -> dict[str, Any]:
    """Gaussian KDE, Scott bandwidth for frequency counts (equivalent to repeated observations).

    Normalize on the supported score interval; no extrapolation beyond the model scale.
    Standard formula: scipy.stats.gaussian_kde documentation, without a SciPy runtime dependency.
    """
    scores = np.array([p["score"] for p in distribution], dtype=float)
    counts = np.array([p["count"] for p in distribution], dtype=float)
    n = float(counts.sum())
    if (len(scores) < 2 or n <= 1 or points < 3 or not np.isfinite(scores).all()
            or not np.isfinite(counts).all() or np.any(counts <= 0)
            or np.any(scores < native[0]) or np.any(scores > native[1])):
        raise ValueError("invalid_density_reference")
    mean = float(scores @ counts / n)
    variance = float(((scores - mean) ** 2) @ counts / (n - 1))
    if variance <= 0:
        raise ValueError("reference_has_no_variation")
    bandwidth = max(min_bandwidth, math.sqrt(variance) * n ** (-1 / 5))
    xs = np.linspace(native[0], native[1], points)
    z = (xs[:, None] - scores[None, :]) / bandwidth
    ys = np.exp(-0.5 * z**2) @ counts / (n * bandwidth * math.sqrt(2 * math.pi))
    scale = (display[1] - display[0]) / (native[1] - native[0])
    xs = display[0] + (xs - native[0]) * scale
    ys /= scale
    ys /= np.trapezoid(ys, xs)
    return {"method": "gaussian_kde_scott_v1", "n": int(n), "bounds": list(display),
            "mean": display[0] + (mean - native[0]) * scale,
            "points": [[round(float(x), 6), round(float(y), 8)] for x, y in zip(xs, ys, strict=True)]}
