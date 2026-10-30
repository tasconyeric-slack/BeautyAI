"""Fast, offline tests: export/import/infer without any faces or research data."""
from __future__ import annotations

import json

import numpy as np
import pytest

from experiments.aesthetics import cli, metrics
from experiments.aesthetics.ridge_artifact import (
    FEATURES, load_artifact, make_artifact, predict_features, predict_photo, save_artifact,
)


def _artifact() -> dict:
    n = len(FEATURES)
    fit = {"mu": np.zeros(n), "sd": np.ones(n), "w": np.arange(n) / 20,
           "b": 2.0, "alpha": 1.0, "n_train": 320, "cv_mae": 0.41}
    return make_artifact(fit, dataset="scut-fbp5500", label_name="beauty score",
                         label_range=(1.0, 5.0))


def test_ridge_artifact_round_trip_and_clipping(tmp_path):
    a = _artifact()
    path = tmp_path / "ridge.json"
    save_artifact(path, a)
    loaded = load_artifact(path)
    assert loaded == a and loaded["research_only"] is True
    assert predict_features([0.0] * len(FEATURES), loaded) == pytest.approx(2.0)
    assert predict_features([100.0] * len(FEATURES), loaded) == pytest.approx(5.0)
    assert predict_features([-100.0] * len(FEATURES), loaded) == pytest.approx(1.0)


def test_ridge_parameters_reuse_existing_metrics_without_retraining_at_inference(tmp_path):
    rng = np.random.default_rng(23)
    x = rng.normal(size=(100, len(FEATURES)))
    y = 3.0 + 0.3 * x[:, 0] - 0.2 * x[:, 1]
    fit = metrics.ridge_fit(x[:80], y[:80])
    a = make_artifact(fit, dataset="synthetic-test-only", label_name="synthetic",
                      label_range=(1.0, 5.0))
    path = tmp_path / "coeff.json"
    save_artifact(path, a)
    actual = [predict_features(row.tolist(), load_artifact(path)) for row in x[80:]]
    assert np.mean(np.abs(np.asarray(actual) - y[80:])) < 0.1


def test_ridge_artifact_fails_closed_on_wrong_feature_order_or_nonfinite(tmp_path):
    a = _artifact()
    a["features"].reverse()
    p = tmp_path / "bad.json"
    p.write_text(json.dumps(a), encoding="utf-8")
    with pytest.raises(ValueError, match="features or order"):
        load_artifact(p)
    a = _artifact()
    a["fit"]["sd"][0] = 0.0
    with pytest.raises(ValueError, match="standard deviations"):
        save_artifact(p, a)
    with pytest.raises(ValueError, match="finite numbers"):
        predict_features([float("nan")] * len(FEATURES), _artifact())


def test_missing_coefficients_never_produce_fake_score(tmp_path, capsys):
    fake = tmp_path / "nonexistent.jpg"
    missing = tmp_path / "no-weights.json"
    result = predict_photo(fake, missing)
    assert result["score"] is None and result["percentile"] is None
    assert result["reason"] == "ridge_artifact_unavailable"
    code = cli.main(["ridge-predict", str(fake), "--artifact", str(missing)])
    assert code == 3
    assert json.loads(capsys.readouterr().out)["score"] is None
