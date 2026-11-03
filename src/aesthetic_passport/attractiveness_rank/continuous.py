"""Interpolated midrank ECDF with anchored normal probability-plot tails.

Fit the upper/lower shoulder separately: a global Gaussian need not fit a
heterogeneous reference. Survival probabilities use erfc, avoiding 1-CDF loss.
"""
import math
from bisect import bisect_left
from statistics import NormalDist, linear_regression

from .contracts import ScoreCount


def continuous_rank(distribution: list[ScoreCount], score: float, fit_low: float,
                    fit_high: float, join_quantile: float) -> tuple[float, bool]:
    n = sum(p["count"] for p in distribution)
    scores, probabilities = [], []
    cumulative = 0
    for point in distribution:
        scores.append(point["score"])
        probabilities.append((cumulative + point["count"] / 2) / n)
        cumulative += point["count"]

    def interpolate(xs: list[float], ys: list[float], x: float) -> float:
        i = bisect_left(xs, x)
        if i == 0:
            return ys[0]
        if i == len(xs):
            return ys[-1]
        t = (x - xs[i - 1]) / (xs[i] - xs[i - 1])
        return ys[i - 1] + t * (ys[i] - ys[i - 1])

    # Mirror the lower tail so both sides use a stable survival calculation.
    lower = score < interpolate(probabilities, scores, 1 - join_quantile)
    xs = [-s for s in reversed(scores)] if lower else scores
    ps = [1 - p for p in reversed(probabilities)] if lower else probabilities
    value = -score if lower else score
    join = interpolate(ps, xs, join_quantile)
    if value <= join:
        return 100 * (1 - interpolate(scores, probabilities, score)), False
    pairs = [(x, p) for x, p in zip(xs, ps) if fit_low <= p <= fit_high]
    if len(pairs) < 2:
        raise ValueError("insufficient_tail_fit")
    sigma, mu = linear_regression([NormalDist().inv_cdf(p) for x, p in pairs], [x for x, p in pairs])
    if sigma <= 0 or not math.isfinite(sigma):
        raise ValueError("invalid_tail_fit")
    def survival(x: float) -> float:
        return math.erfc((x - mu) / (sigma * math.sqrt(2))) / 2
    tail = (1 - join_quantile) * survival(value) / survival(join)
    # Machine representability guard only, not a statistical percentile cap.
    top = max(math.nextafter(0.0, 1.0), 100 * tail)
    return (100 - top if lower else top), True
