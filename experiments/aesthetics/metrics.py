"""Point metrics for score-vs-label evaluation. numpy only.

Spearman uses average ranks so ties do not distort it (same convention as the MEBeauty benchmark's metrics).
MAE/RMSE are only meaningful on the label's native scale: callers decide whether a prediction is native,
train-calibrated or rank-only (see evaluate.py) and pass `with_errors=False` for rank-only methods.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np


def rank(values: np.ndarray) -> np.ndarray:
    """Average ranks (0-based), ties share the mean of their positions."""
    v = np.asarray(values, dtype=float)
    order = np.argsort(v, kind="mergesort")
    ranks = np.empty(len(v), dtype=float)
    ranks[order] = np.arange(len(v), dtype=float)
    sv = v[order]
    start = 0
    for i in range(1, len(v) + 1):
        if i == len(v) or sv[i] != sv[start]:
            if i - start > 1:
                ranks[order[start:i]] = ranks[order[start:i]].mean()
            start = i
    return ranks


def pearson(a: np.ndarray, b: np.ndarray) -> float | None:
    a, b = np.asarray(a, float), np.asarray(b, float)
    if len(a) < 3 or np.std(a) == 0 or np.std(b) == 0:
        return None
    return float(np.corrcoef(a, b)[0, 1])


def spearman(a: np.ndarray, b: np.ndarray) -> float | None:
    if len(a) < 3:
        return None
    return pearson(rank(a), rank(b))


def bootstrap_spearman_ci(pred: np.ndarray, label: np.ndarray, n_boot: int = 1000, seed: int = 0,
                          alpha: float = 0.05) -> list[float] | None:
    """Percentile bootstrap CI of Spearman over images (fixed seed → reproducible)."""
    pred, label = np.asarray(pred, float), np.asarray(label, float)
    n = len(pred)
    if n < 10:
        return None
    rng = np.random.default_rng(seed)
    vals = []
    for _ in range(n_boot):
        idx = rng.integers(0, n, n)
        s = spearman(pred[idx], label[idx])
        if s is not None:
            vals.append(s)
    if len(vals) < n_boot // 2:
        return None
    lo, hi = np.quantile(vals, [alpha / 2, 1 - alpha / 2])
    return [round(float(lo), 4), round(float(hi), 4)]


def _r(v: float | None) -> float | None:
    return None if v is None or not math.isfinite(v) else round(float(v), 4)


def point_metrics(pred: np.ndarray, label: np.ndarray, *, with_errors: bool = True,
                  bootstrap: int = 1000) -> dict[str, Any]:
    pred, label = np.asarray(pred, float), np.asarray(label, float)
    out: dict[str, Any] = {"n": len(pred), "spearman": _r(spearman(pred, label)),
                           "pearson": _r(pearson(pred, label))}
    out["spearman_ci95"] = bootstrap_spearman_ci(pred, label, n_boot=bootstrap) if bootstrap else None
    if with_errors and len(pred):
        err = pred - label
        out["mae"] = _r(float(np.mean(np.abs(err))))
        out["rmse"] = _r(float(np.sqrt(np.mean(err ** 2))))
    else:
        out["mae"] = out["rmse"] = None
    return out


def fit_linear_calibration(pred: np.ndarray, label: np.ndarray) -> dict[str, float] | None:
    """Least-squares label ≈ a + b·pred. Fitted on TRAIN rows only by the caller; never on test."""
    pred, label = np.asarray(pred, float), np.asarray(label, float)
    if len(pred) < 10 or np.std(pred) == 0:
        return None
    b, a = np.polyfit(pred, label, 1)
    return {"a": float(a), "b": float(b), "n_train": len(pred)}


def apply_calibration(pred: np.ndarray, cal: dict[str, float], low: float, high: float) -> np.ndarray:
    return np.clip(cal["a"] + cal["b"] * np.asarray(pred, float), low, high)


def ridge_fit(x: np.ndarray, y: np.ndarray, alphas: tuple[float, ...] = (0.1, 1.0, 10.0, 100.0),
              folds: int = 5, seed: int = 0) -> dict[str, Any]:
    """Standardised ridge regression; alpha picked by k-fold CV inside the training rows only."""
    x, y = np.asarray(x, float), np.asarray(y, float)
    mu, sd = x.mean(axis=0), x.std(axis=0)
    sd[sd == 0] = 1.0
    z = (x - mu) / sd

    def solve(zz: np.ndarray, yy: np.ndarray, alpha: float) -> tuple[np.ndarray, float]:
        ym = yy.mean()
        w = np.linalg.solve(zz.T @ zz + alpha * np.eye(zz.shape[1]), zz.T @ (yy - ym))
        return w, float(ym)

    rng = np.random.default_rng(seed)
    fold_of = rng.permutation(len(y)) % folds
    best_alpha, best_mae = alphas[0], math.inf
    for alpha in alphas:
        errs = []
        for k in range(folds):
            tr, va = fold_of != k, fold_of == k
            if tr.sum() < 5 or va.sum() == 0:
                continue
            w, b = solve(z[tr], y[tr], alpha)
            errs.append(np.abs(z[va] @ w + b - y[va]))
        mae = float(np.mean(np.concatenate(errs))) if errs else math.inf
        if mae < best_mae:
            best_alpha, best_mae = alpha, mae
    w, b = solve(z, y, best_alpha)
    return {"mu": mu, "sd": sd, "w": w, "b": b, "alpha": best_alpha, "cv_mae": _r(best_mae), "n_train": len(y)}


def ridge_predict(model: dict[str, Any], x: np.ndarray) -> np.ndarray:
    return ((np.asarray(x, float) - model["mu"]) / model["sd"]) @ model["w"] + model["b"]
