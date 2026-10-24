"""Real-image parity of exported / quantised variants against the published MEBeauty holdout-test predictions.

    python -m experiments.aesthetics.onnx_parity --onnx models/aesthetics/mebeauty-fbp/model.onnx \
        --reference <MEBeauty-Benchmark>/results/dinov2-partial_predictions.npz [--int8]

Scores the 250 holdout-test images (dataset order, harness preprocessing, flip average, clip 1–10) with onnxruntime
(and optionally torch dynamic int8) and reports max/mean |Δ| vs the reference, PASS/FAIL at the evaluate tolerance,
and Spearman/MAE vs labels. Prints aggregates only; nothing is written. Needs the gated dataset + weights locally.
"""
from __future__ import annotations

import argparse
import json

import numpy as np

from . import preprocess as pp
from .evaluate import PARITY_TOLERANCE
from .metrics import point_metrics


def _verdict(pred: np.ndarray, ref: np.ndarray, labels: np.ndarray, tol: float) -> dict:
    d = np.abs(pred - ref)
    return {"status": "pass" if d.max() <= tol else "fail", "tolerance": tol, "n": len(d),
            "max_abs_diff": float(f"{d.max():.3g}"), "mean_abs_diff": float(f"{d.mean():.3g}"),
            "n_over_tolerance": int((d > tol).sum()), "vs_labels": point_metrics(pred, labels, bootstrap=0)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--onnx", required=True)
    ap.add_argument("--reference", required=True)
    ap.add_argument("--weights", help="for --int8 (default models/aesthetics/mebeauty-fbp/dinov2-partial.pt)")
    ap.add_argument("--int8", action="store_true", help="also score torch dynamic-int8 (Linear layers)")
    ap.add_argument("--tolerance", type=float, default=PARITY_TOLERANCE)
    a = ap.parse_args()

    import onnxruntime as ort
    from datasets import load_dataset

    ds = load_dataset("dr-irina-lebedeva/MEBeauty-Facial-Beauty-Prediction", "fbp_extended", split="test")
    x = np.stack([pp.to_model_input(pp.load_rgb(ds[i]["image"])) for i in range(len(ds))])
    labels = np.asarray(ds["beauty_score"], float)
    ref = np.load(a.reference)["predictions"].astype(float)

    sess = ort.InferenceSession(a.onnx, providers=["CPUExecutionProvider"])
    run = lambda b: sess.run(None, {"pixels": b})[0]
    onnx = np.concatenate([0.5 * (run(x[i:i + 8]) + run(np.ascontiguousarray(x[i:i + 8, ..., ::-1])))
                           for i in range(0, len(x), 8)])
    out = {"onnxruntime": _verdict(np.clip(onnx, 1, 10), ref, labels, a.tolerance),
           "reference_vs_labels": point_metrics(ref, labels, bootstrap=0)}
    if a.int8:
        import copy

        import torch

        from .model import MEBeautyDinoV2

        m = MEBeautyDinoV2(a.weights)
        m.backbone = torch.ao.quantization.quantize_dynamic(copy.deepcopy(m.backbone), {torch.nn.Linear},
                                                            dtype=torch.qint8)
        m.head = torch.ao.quantization.quantize_dynamic(copy.deepcopy(m.head), {torch.nn.Linear}, dtype=torch.qint8)
        q = np.concatenate([m.predict(x[i:i + 8])[0] for i in range(0, len(x), 8)])
        out["torch_int8_dynamic"] = _verdict(q, ref, labels, a.tolerance)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
