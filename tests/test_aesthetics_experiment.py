"""Smoke tests for the isolated experiments/aesthetics package (Issue #11). No photos, no real weights, no network.

CI has no torch: the checkpoint tests skip there and run wherever experiments/aesthetics/requirements.txt is installed.
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from experiments.aesthetics import cli, metrics
from experiments.aesthetics import preprocess as pp
from experiments.aesthetics.datasets import EvalSet, Item, scut_canonical, scut_subset


def _mediapipe() -> bool:
    try:
        from aesthetic_passport import cv

        return cv.available()
    except (ImportError, OSError, RuntimeError):
        return False


@pytest.fixture
def no_weights(tmp_path, monkeypatch):
    monkeypatch.setenv("AESTHETICS_WEIGHTS", str(tmp_path / "absent" / "dinov2-partial.pt"))


def _blank(path: Path, size: int = 320, color=(182, 140, 120)) -> Path:
    Image.new("RGB", (size, size), color).save(path)
    return path


def _run(capsys, *argv: str) -> tuple[int, str]:
    code = cli.main(list(argv))
    return code, capsys.readouterr().out


# --- metrics --------------------------------------------------------------------------------------------------------
def test_rank_ties_and_spearman():
    assert metrics.rank(np.array([3.0, 1.0, 3.0, 2.0])).tolist() == [2.5, 0.0, 2.5, 1.0]
    x = np.arange(20.0)
    assert metrics.spearman(x, x ** 3) == pytest.approx(1.0)
    assert metrics.spearman(x, -x) == pytest.approx(-1.0)
    assert metrics.pearson(np.ones(5), np.arange(5.0)) is None


def test_point_metrics_and_calibration():
    label = np.linspace(1, 5, 50)
    pred = 20 * label + 7                                # off-scale but perfectly ranked
    m = metrics.point_metrics(pred, label, with_errors=False, bootstrap=200)
    assert m["spearman"] == pytest.approx(1.0) and m["mae"] is None and m["spearman_ci95"] == [1.0, 1.0]
    cal = metrics.fit_linear_calibration(pred, label)
    assert cal["b"] == pytest.approx(0.05) and cal["a"] == pytest.approx(-0.35)
    assert np.allclose(metrics.apply_calibration(pred, cal, 1, 5), label)
    native = metrics.point_metrics(label + 0.5, label, bootstrap=0)
    assert native["mae"] == pytest.approx(0.5) and native["rmse"] == pytest.approx(0.5)


def test_ridge_recovers_linear_signal():
    rng = np.random.default_rng(0)
    x = rng.standard_normal((200, 4))
    y = 3 + x @ np.array([1.0, -2.0, 0.0, 0.5]) + rng.normal(0, 0.01, 200)
    fit = metrics.ridge_fit(x[:150], y[:150])
    assert np.mean(np.abs(metrics.ridge_predict(fit, x[150:]) - y[150:])) < 0.1


# --- preprocessing --------------------------------------------------------------------------------------------------
def test_model_input_matches_reference_transform():
    rng = np.random.default_rng(1)
    im = Image.fromarray(rng.integers(0, 255, (300, 200, 3), dtype=np.uint8))
    x = pp.to_model_input(im)
    assert x.shape == (3, 224, 224) and x.dtype == np.float32
    ref = np.asarray(im.resize((256, 256), Image.BILINEAR), np.float32)[16:240, 16:240] / 255.0
    assert np.allclose(x, ((ref - pp.MEAN) / pp.STD).transpose(2, 0, 1), atol=1e-6)


@pytest.mark.parametrize("box,w,h", [((10, 10, 60, 90), 400, 300), ((0, 0, 380, 290), 400, 300),
                                     ((350, 250, 399, 299), 400, 300)])
def test_square_crop_box_stays_inside(box, w, h):
    x0, y0, x1, y1 = pp.square_crop_box(box, w, h, margin=0.25)
    assert x1 - x0 == y1 - y0 and 0 <= x0 and 0 <= y0 and x1 <= w and y1 <= h


def test_scut_legacy_names():
    assert scut_canonical("fty12.jpg") == "AF12.jpg" and scut_canonical("mtw3.jpg") == "CM3.jpg"
    assert scut_canonical("AM7.jpg") == "AM7.jpg"
    assert scut_subset("ftw437.jpg") == "CF" and scut_subset("other.jpg") is None


# --- predict CLI ----------------------------------------------------------------------------------------------------
def test_predict_unreadable(tmp_path, capsys, no_weights):
    bad = tmp_path / "x.jpg"
    bad.write_bytes(b"not an image")
    code, out = _run(capsys, "predict", str(bad))
    res = json.loads(out)
    assert code == 2 and res["status"] == "unreadable_image" and res["raw_score"] is None
    for key in ("model_version", "dataset", "label_scale", "raw_score", "status", "preprocessing"):
        assert key in res
    assert res["label_scale"]["min"] == 1.0 and res["label_scale"]["max"] == 10.0


def test_predict_missing_model_is_clean(tmp_path, capsys, no_weights):
    code, out = _run(capsys, "predict", str(_blank(tmp_path / "b.png")), "--crop", "none", "--no-face-check")
    res = json.loads(out)
    assert code == 3 and res["status"] in {"model_unavailable", "dependency_missing"}
    assert res["raw_score"] is None and res["prerequisite"]
    assert res["preprocessing"]["face_presence"] == "not verified"


@pytest.mark.skipif(not _mediapipe(), reason="MediaPipe models / system libraries not available")
def test_predict_no_face(tmp_path, capsys, no_weights):
    code, out = _run(capsys, "predict", str(_blank(tmp_path / "b.png")))
    res = json.loads(out)
    assert code == 2 and res["status"] == "no_face" and res["face"]["faces_detected"] == 0
    assert res["raw_score"] is None


# --- evaluate CLI ---------------------------------------------------------------------------------------------------
def _csv_dataset(tmp_path: Path, n_train: int = 36, n_test: int = 12) -> Path:
    rows = []
    for i in range(n_train + n_test):
        split = "train" if i < n_train else "test"
        _blank(tmp_path / f"{i}.png", 96, (40 + i, 90, 120))
        rows.append({"image": f"{i}.png", "label": 1 + (i % 5), "split": split, "cohort": "a" if i % 2 else "b"})
    p = tmp_path / "labels.csv"
    with p.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    return p


def test_evaluate_without_model_reports_partial(tmp_path, capsys, no_weights):
    labels = _csv_dataset(tmp_path)
    out = tmp_path / "out"
    code, text = _run(capsys, "evaluate", "--dataset", "csv", "--csv", str(labels), "--label-min", "1",
                      "--label-max", "5", "--bootstrap", "0", "--min-group", "5", "--out", str(out))
    assert code == 0 and "## Not run" in text
    rep = json.loads((out / "report.json").read_text())
    assert rep["status"] == "partial"
    assert rep["methods"]["mebeauty_dinov2"]["status"] in {"model_unavailable", "dependency_missing"}
    assert rep["methods"]["mebeauty_dinov2"]["prerequisite"]
    tm = rep["methods"]["train_mean"]
    assert tm["coverage"]["n_scored"] == 12 and tm["metrics"]["mae"] is not None and tm["metrics"]["spearman"] is None
    geo = rep["methods"]["geometric"]
    assert geo["coverage"]["n_scored"] == 0                      # flat colour images: never a fabricated score
    assert set(geo["coverage"]["failures"]) <= {"no_face", "dependency_missing"}
    assert len((out / "predictions.jsonl").read_text().splitlines()) == 12
    code, _ = _run(capsys, "evaluate", "--dataset", "csv", "--csv", str(labels), "--label-max", "5", "--bootstrap",
                   "0", "--methods", "train_mean,mebeauty_dinov2", "--require-all", "--out", str(out))
    assert code == 3


def test_evaluate_missing_dataset(capsys, tmp_path):
    code, out = _run(capsys, "evaluate", "--dataset", "scut-fbp5500", "--images-dir", str(tmp_path / "nope"))
    res = json.loads(out)
    assert code == 3 and res["status"] == "dataset_unavailable" and res["prerequisite"]


def test_leakage_guards(tmp_path):
    from experiments.aesthetics.evaluate import evaluate

    img = _blank(tmp_path / "a.png", 64)
    item = Item(id="same", split="train", label=1.0, load=lambda: img)
    overlap = EvalSet("x", "label", (1, 5), [item], [Item("same", "test", 2.0, lambda: img)], "t", "t", "custom")
    with pytest.raises(ValueError, match="leakage"):
        evaluate(overlap, methods=("train_mean",), bootstrap=0)
    blocked = EvalSet("mebeauty", "beauty_score", (1, 10), [item], [Item("t1", "test", 2.0, lambda: img)], "t", "t",
                      "mebeauty", blocked={"mebeauty_dinov2": "leakage: trained on validation"})
    rep, _ = evaluate(blocked, methods=("train_mean", "mebeauty_dinov2"), bootstrap=0)
    assert rep["methods"]["mebeauty_dinov2"]["status"] == "blocked" and rep["status"] == "complete"


# --- checkpoint adapter (needs torch + transformers) ----------------------------------------------------------------
TINY = {"hidden_size": 64, "num_hidden_layers": 2, "num_attention_heads": 1, "patch_size": 14, "image_size": 28,
        "mlp_ratio": 4, "layerscale_value": 1.0, "layer_norm_eps": 1e-6, "qkv_bias": True, "use_swiglu_ffn": False}


@pytest.fixture
def tiny_checkpoint(tmp_path):
    torch = pytest.importorskip("torch")
    pytest.importorskip("transformers")
    from experiments.aesthetics import model as m

    torch.manual_seed(0)
    backbone, head = m._build(TINY)
    with torch.no_grad():
        head[-1].bias.fill_(5.0)                                    # keep outputs inside 1–10 so clipping is inert
    state = {"backbone": backbone.state_dict(), "head": head.state_dict()}
    path = tmp_path / "dinov2-partial.pt"
    torch.save(state, path)
    return path, state


def test_checkpoint_loads_offline_and_predicts(tiny_checkpoint, tmp_path, capsys):
    from experiments.aesthetics.model import MEBeautyDinoV2, infer_dinov2_config

    path, state = tiny_checkpoint
    assert infer_dinov2_config(state["backbone"]) == TINY
    model = MEBeautyDinoV2(path)
    x = np.stack([pp.to_model_input(Image.new("RGB", (50, 70), (10 * i, 80, 160))) for i in range(3)])
    clipped, raw = model.predict(x, flip=True)
    plain, _ = model.predict(x, flip=False)
    flipped, _ = model.predict(np.ascontiguousarray(x[..., ::-1]), flip=False)
    assert clipped.shape == (3,) and np.allclose(raw, (plain + flipped) / 2, atol=1e-5)
    assert model.model_version.startswith("mebeauty-fbp/dinov2-partial@sha256:")

    code, out = _run(capsys, "predict", str(_blank(tmp_path / "p.png")), "--weights", str(path), "--crop", "none",
                     "--no-face-check")
    res = json.loads(out)
    assert code == 0 and res["status"] == "ok" and 1.0 <= res["raw_score"] <= 10.0
    assert res["model"]["backbone_config_source"] == "inferred from checkpoint tensor shapes"


def test_checkpoint_other_attention_layout_and_bad_files(tiny_checkpoint, tmp_path):
    import torch

    from experiments.aesthetics import model as m

    _, state = tiny_checkpoint
    probe, _ = m._build(TINY)
    current = set(probe.state_dict())
    forward = m._rename(state["backbone"], forward=True)
    other = forward if set(forward) != current else m._rename(state["backbone"], forward=False)
    assert set(other) != current                                  # really the other transformers layout
    alt = tmp_path / "alt.pt"
    torch.save({"backbone": other, "head": state["head"]}, alt)
    assert m.MEBeautyDinoV2(alt).predict(np.zeros((1, 3, 224, 224), np.float32))[0].shape == (1,)

    torch.save({"backbone": state["backbone"]}, tmp_path / "nohead.pt")
    with pytest.raises(m.ModelUnavailable) as e:
        m.MEBeautyDinoV2(tmp_path / "nohead.pt")
    assert e.value.status == "model_incompatible"
    (tmp_path / "lfs.pt").write_text("version https://git-lfs.github.com/spec/v1\n")
    with pytest.raises(m.ModelUnavailable) as e:
        m.MEBeautyDinoV2(tmp_path / "lfs.pt")
    assert e.value.status == "model_incompatible"


def test_evaluate_with_model_calibrated_native_and_parity(tiny_checkpoint, tmp_path, capsys):
    from experiments.aesthetics.evaluate import evaluate

    path, _ = tiny_checkpoint
    labels = _csv_dataset(tmp_path)
    out = tmp_path / "out"
    code, _ = _run(capsys, "evaluate", "--dataset", "csv", "--csv", str(labels), "--label-max", "5", "--weights",
                   str(path), "--methods", "train_mean,mebeauty_dinov2", "--bootstrap", "0", "--batch", "5",
                   "--out", str(out))
    rep = json.loads((out / "report.json").read_text())
    model = rep["methods"]["mebeauty_dinov2"]
    assert code == 0 and rep["status"] == "complete" and model["status"] == "ok"
    assert model["scale"] == "calibrated_on_train" and model["calibration"]["n_train"] == 36   # train rows only
    assert model["coverage"]["n_scored"] == 12 and model["metrics"]["error_basis"] == "calibrated_on_train"

    # MEBeauty-native scale: raw MAE allowed; parity against a published-predictions file in test order
    ds = EvalSet("mebeauty", "beauty_score", (1, 10), [], [Item(f"t{i}", "test", 5.0 + i % 3,
                 (lambda i=i: _blank(tmp_path / f"m{i}.png", 64, (i * 20, 50, 90)))) for i in range(6)],
                 "t", "holdout", "mebeauty")
    rep, rows = evaluate(ds, methods=("mebeauty_dinov2",), weights=str(path), bootstrap=0)
    assert rep["methods"]["mebeauty_dinov2"]["scale"] == "native"
    assert rep["methods"]["mebeauty_dinov2"]["metrics"]["error_basis"] == "native"
    ref = tmp_path / "ref.npz"
    np.savez(ref, predictions=np.array([r["pred"]["mebeauty_dinov2"] for r in rows], np.float32))
    rep, _ = evaluate(ds, methods=("mebeauty_dinov2",), weights=str(path), bootstrap=0, reference_predictions=str(ref))
    parity = rep["parity_with_published_predictions"]
    assert parity["status"] == "pass" and parity["n_compared"] == 6 and parity["max_abs_diff"] < 1e-5
    assert rep["status"] == "complete"
    # a readable reference that disagrees must FAIL, and the report must not claim completion
    np.savez(ref, predictions=np.array([r["pred"]["mebeauty_dinov2"] + 0.5 for r in rows], np.float32))
    rep, _ = evaluate(ds, methods=("mebeauty_dinov2",), weights=str(path), bootstrap=0, reference_predictions=str(ref))
    parity = rep["parity_with_published_predictions"]
    assert parity["status"] == "fail" and parity["n_over_tolerance"] == 6 and rep["status"] == "partial"
    assert rep["incomplete_reasons"] == {"parity": "fail"}


def test_parity_with_zero_scored_rows_fails_without_crashing(tmp_path):
    from experiments.aesthetics.evaluate import _parity

    ds = EvalSet("mebeauty", "beauty_score", (1, 10), [], [], "t", "holdout", "mebeauty")
    ref = tmp_path / "ref.npz"
    np.savez(ref, predictions=np.array([5.0, 6.0], np.float32))

    class Rec:                                                    # model failed on every row
        def __init__(self, label: float) -> None:
            self.pred, self.item = {}, Item("x", "test", label, lambda: None)

    out = _parity(str(ref), ds, [Rec(5.0), Rec(6.0)], {"subsampled": {"test": False}})
    assert out["status"] == "fail" and out["n_compared"] == 0 and "no reference row" in out["reason"]


def test_status_partial_when_a_requested_method_scores_nothing(tmp_path):
    from experiments.aesthetics.evaluate import evaluate

    train = [Item(f"r{i}", "train", 1.0 + i % 5, (lambda i=i: _blank(tmp_path / f"r{i}.png", 64))) for i in range(5)]
    test = [Item(f"t{i}", "test", 2.0, (lambda i=i: _blank(tmp_path / f"t{i}.png", 64))) for i in range(3)]
    ds = EvalSet("x", "label", (1, 5), train, test, "t", "t", "custom")
    rep, _ = evaluate(ds, methods=("train_mean", "geometric"), bootstrap=0)   # flat images: no face, no geometry
    assert rep["methods"]["geometric"]["status"] == "ok"
    assert rep["methods"]["geometric"]["coverage"]["n_scored"] == 0
    assert rep["status"] == "partial" and rep["incomplete_reasons"] == {"geometric": "zero_test_samples_scored"}
