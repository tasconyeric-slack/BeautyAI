#!/usr/bin/env python3
"""One-off, read-only-to-repo exporter of BeautyAI's SCUT 17-feature Ridge.

Run from the BeautyAI repository root in its configured Python environment:

    python -m experiments.aesthetics.export_scut_ridge17

Requires the already downloaded SCUT-FBP5500_v2 folder, existing MediaPipe
models and the repository's pipeline dependencies. No PyTorch or DINOv2.
Writes only a JSON artifact under the git-ignored models/ directory.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from experiments.aesthetics.datasets import Item, load_scut
from experiments.aesthetics.evaluate import _process
from experiments.aesthetics.metrics import point_metrics, ridge_fit, ridge_predict
from experiments.aesthetics.preprocess import GEOMETRY_FEATURES
from experiments.aesthetics.ridge_artifact import make_artifact, predict_features, save_artifact


def rows_with_features(items: list[Item]) -> tuple[np.ndarray, np.ndarray]:
    recs = _process(
        items,
        want_geometry=True,
        want_model=False,
        model=None,
        crop="none",
        margin=0.25,
        flip=True,
        batch=8,
        timers=Counter(),
    )
    valid = [r for r in recs if r.features is not None]
    if not valid:
        raise RuntimeError("No usable MediaPipe geometry; check PYTHONPATH, MediaPipe models and input images")
    x = np.asarray([r.features for r in valid], dtype=np.float64)
    y = np.asarray([r.item.label for r in valid], dtype=np.float64)
    if x.shape[1] != len(GEOMETRY_FEATURES) or x.shape[1] != 17:
        raise RuntimeError(f"Unexpected geometry feature shape: {x.shape}")
    if not np.all(np.isfinite(x)) or not np.all(np.isfinite(y)):
        raise RuntimeError("Non-finite input features/labels")
    return x, y


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    root = Path("data/scut-fbp5500/SCUT-FBP5500_v2")
    ap.add_argument("--images-dir", type=Path, default=root / "Images")
    split = root / "train_test_files" / "split_of_60%training and 40%testing"
    ap.add_argument("--train-file", type=Path, default=split / "train.txt")
    ap.add_argument("--test-file", type=Path, default=split / "test.txt")
    ap.add_argument("--out", type=Path, default=Path("models/aesthetics/geometry-ridge/scut-fbp5500-ridge-17.json"))
    ap.add_argument("--allow-metric-drift", action="store_true", help="Save despite mismatch to recorded evaluation; clearly mark unverified")
    args = ap.parse_args()

    ds = load_scut(args.images_dir, train_file=args.train_file, test_file=args.test_file)
    ds.check_disjoint()
    if len(ds.train) != 3300 or len(ds.test) != 2200:
        raise RuntimeError(f"Expected complete 60/40 split (3300/2200), got {len(ds.train)}/{len(ds.test)}")

    print("Extracting train features and refitting Ridge (CPU only)...", file=sys.stderr)
    xtr, ytr = rows_with_features(ds.train)
    fit = ridge_fit(xtr, ytr)  # Existing code, defaults: 5 folds, seed 0, alpha grid .1/1/10/100
    print("Extracting held-out test features and checking parity...", file=sys.stderr)
    xte, yte = rows_with_features(ds.test)
    yhat = np.clip(ridge_predict(fit, xte), *ds.label_range)
    metrics = point_metrics(yhat, yte, bootstrap=0)

    observed = {
        "n_train_full": len(ds.train),
        "n_train_usable": len(ytr),
        "n_test_full": len(ds.test),
        "n_test_usable": len(yte),
        "alpha": float(fit["alpha"]),
        "spearman": metrics["spearman"],
        "mae": metrics["mae"],
    }
    expected = {"n_train_usable": 3196, "n_test_usable": 2128, "alpha": 100.0, "spearman": 0.6144, "mae": 0.4197}
    matched = (
        observed["n_train_usable"] == expected["n_train_usable"]
        and observed["n_test_usable"] == expected["n_test_usable"]
        and observed["alpha"] == expected["alpha"]
        and observed["spearman"] is not None and abs(observed["spearman"] - expected["spearman"]) <= 0.001
        and observed["mae"] is not None and abs(observed["mae"] - expected["mae"]) <= 0.001
    )
    print(json.dumps({"recorded_expected": expected, "reproduced": observed, "parity": "PASS" if matched else "FAIL"}, indent=2), file=sys.stderr)
    if not matched and not args.allow_metric_drift:
        raise SystemExit("Parity failed; JSON not saved. Investigate inputs, CV/MediaPipe version, split and code drift.")

    try:
        commit = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    except (FileNotFoundError, subprocess.CalledProcessError):
        commit = None

    feature_names = list(GEOMETRY_FEATURES)
    data = make_artifact(fit, dataset=ds.name, label_name=ds.label_name, label_range=ds.label_range)
    data["provenance"] = {
        "created_utc": datetime.now(UTC).isoformat(), "repo_commit": commit,
        "feature_schema_sha256": hashlib.sha256(json.dumps(feature_names, separators=(",", ":")).encode()).hexdigest(),
        "training_protocol": ds.protocol,
        "train_split_sha256": hashlib.sha256(args.train_file.read_bytes()).hexdigest(),
        "test_split_sha256": hashlib.sha256(args.test_file.read_bytes()).hexdigest(),
        "held_out_test_metrics": observed,
        "parity_with_recorded_experiment": "pass" if matched else "drift",
    }
    copy = json.loads(json.dumps(data))
    rt = np.array([predict_features(row.tolist(), copy) for row in xte])
    if not np.allclose(yhat, rt, rtol=1e-12, atol=1e-12):
        raise RuntimeError("Serialized params changed inference unexpectedly")
    save_artifact(args.out, data)
    print(f"Saved {args.out} ({args.out.stat().st_size} bytes). No tracked GitHub files changed.")


if __name__ == "__main__":
    main()
