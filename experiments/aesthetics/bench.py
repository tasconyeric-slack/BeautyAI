"""Measured runtime / memory of the inference path. No photos: inputs are seeded random tensors.

With real weights this times the exact deployed model. With `--random-init` it times the identical architecture
(facebook/dinov2-base + head) with untrained weights: latency and memory depend on the architecture, not the weight
values, so the timing is valid — but no score is produced and none is reported.

Optional variants, each measured only if its packages are installed:
    int8_dynamic   torch dynamic int8 quantisation of Linear layers (CPU)
    onnxruntime    ONNX export + onnxruntime CPU session
Each variant reports max |Δ raw output| vs fp32 on the same weights (numerical fidelity, not accuracy).
"""
from __future__ import annotations

import statistics
import tempfile
import time
from pathlib import Path
from typing import Any

import numpy as np

from .model import MEBeautyDinoV2, ModelUnavailable
from .runtime import current_rss_mb, environment, peak_rss_mb


def _time(fn: Any, iters: int, warmup: int) -> dict[str, float]:
    for _ in range(warmup):
        fn()
    samples = []
    for _ in range(iters):
        t = time.perf_counter()
        fn()
        samples.append(1000 * (time.perf_counter() - t))
    samples.sort()
    return {"p50_ms": round(statistics.median(samples), 1),
            "p90_ms": round(samples[min(len(samples) - 1, int(0.9 * len(samples)))], 1),
            "min_ms": round(samples[0], 1), "iters": iters}


def bench(*, weights: str | None = None, random_init: bool = False, threads: int | None = None, device: str = "cpu",
          iters: int = 10, warmup: int = 2, batch: int = 8, variants: tuple[str, ...] = (),
          export_onnx: str | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {"status": None, "random_init": random_init, "rss_start_mb": current_rss_mb()}
    t = time.perf_counter()
    try:
        import torch  # noqa: F401 — import time is part of cold start
    except ImportError:
        out.update(status="dependency_missing", prerequisite="pip install -r experiments/aesthetics/requirements.txt")
        return out
    out["torch_import_s"] = round(time.perf_counter() - t, 2)
    try:
        model = MEBeautyDinoV2(weights, device=device, threads=threads, random_init=random_init)
    except ModelUnavailable as e:
        out.update(status=e.status, error=str(e), prerequisite=e.prerequisite)
        return out
    out.update(model_version=model.model_version, model=model.describe(), load_s=model.load_seconds,
               rss_after_load_mb=current_rss_mb(), fp32_weights_mb=round(model.parameters * 4 / 2**20, 1))

    rng = np.random.default_rng(0)
    one = rng.standard_normal((1, 3, 224, 224)).astype(np.float32)
    many = rng.standard_normal((batch, 3, 224, 224)).astype(np.float32)
    out["fp32"] = {
        "single_image_flip_avg": _time(lambda: model.predict(one, flip=True), iters, warmup),
        "single_image_no_flip": _time(lambda: model.predict(one, flip=False), iters, warmup),
        f"batch{batch}_flip_avg": _time(lambda: model.predict(many, flip=True), max(3, iters // 3), 1),
    }
    out["fp32"][f"batch{batch}_flip_avg"]["per_image_ms"] = round(
        out["fp32"][f"batch{batch}_flip_avg"]["p50_ms"] / batch, 1)
    _, ref = model.predict(many, flip=True)      # unclipped: clipping would hide numerical differences
    out["rss_after_fp32_mb"] = current_rss_mb()

    if "int8_dynamic" in variants:
        out["int8_dynamic"] = _int8(model, one, many, ref, iters, warmup, random_init)
    if "onnxruntime" in variants:
        out["onnxruntime"] = _onnx(model, one, many, ref, iters, warmup, export_onnx, threads)
    out.update(status="ok", peak_rss_mb=peak_rss_mb(), environment=environment())
    return out


def _int8(model: MEBeautyDinoV2, one: np.ndarray, many: np.ndarray, ref: np.ndarray, iters: int, warmup: int,
          random_init: bool) -> dict[str, Any]:
    import copy

    torch = model.torch
    try:
        quantize = torch.ao.quantization.quantize_dynamic
    except AttributeError:
        return {"status": "unavailable", "reason": "torch.ao.quantization.quantize_dynamic missing"}
    q = copy.copy(model)
    try:
        q.backbone = quantize(copy.deepcopy(model.backbone), {torch.nn.Linear}, dtype=torch.qint8)
        q.head = quantize(copy.deepcopy(model.head), {torch.nn.Linear}, dtype=torch.qint8)
        res: dict[str, Any] = {"status": "ok",
                               "single_image_flip_avg": _time(lambda: q.predict(one, flip=True), iters, warmup)}
        _, got = q.predict(many, flip=True)
    except Exception as e:  # noqa: BLE001 — report, don't crash the benchmark
        return {"status": "error", "reason": f"{type(e).__name__}: {str(e)[:200]}"}
    res["max_abs_raw_diff_vs_fp32"] = float(f"{float(np.abs(got - ref).max()):.3g}")
    res["diff_note"] = ("numerical diff on identical weights; " + ("random-init weights — says nothing about accuracy"
                        if random_init else "accuracy impact still needs a labelled evaluation"))
    return res


def _onnx(model: MEBeautyDinoV2, one: np.ndarray, many: np.ndarray, ref: np.ndarray, iters: int, warmup: int,
          keep: str | None, threads: int | None) -> dict[str, Any]:
    torch = model.torch
    try:
        import onnxruntime as ort
    except ImportError:
        return {"status": "unavailable", "reason": "onnxruntime not installed"}

    class Scorer(torch.nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.backbone, self.head = model.backbone, model.head

        def forward(self, x: Any) -> Any:
            return self.head(self.backbone(x)).squeeze(-1)

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "scorer.onnx"
        try:
            t = time.perf_counter()
            torch.onnx.export(Scorer().eval(), (torch.from_numpy(one),), str(path), input_names=["pixels"],
                              output_names=["score"], dynamic_axes={"pixels": {0: "n"}, "score": {0: "n"}},
                              opset_version=17, dynamo=False)
            export_s = round(time.perf_counter() - t, 1)
        except Exception as e:  # noqa: BLE001
            return {"status": "error", "reason": f"export failed: {type(e).__name__}: {str(e)[:200]}"}
        size_mb = round(path.stat().st_size / 2**20, 1)
        run = _ort_runner(ort, path, threads)
        res: dict[str, Any] = {"status": "ok", "export_s": export_s, "file_mb": size_mb,
                               "onnxruntime": ort.__version__,
                               "single_image_flip_avg": _time(lambda: run(one), iters, warmup)}
        res["max_abs_raw_diff_vs_fp32"] = float(f"{float(np.abs(run(many) - ref).max()):.3g}")
        res["diff_note"] = "export fidelity on identical weights (valid for random-init too)"
        if keep:
            Path(keep).parent.mkdir(parents=True, exist_ok=True)
            Path(keep).write_bytes(path.read_bytes())
            res["exported_to"] = keep
        return res


def _ort_runner(ort: Any, path: Path, threads: int | None) -> Any:
    opts = ort.SessionOptions()
    if threads:
        opts.intra_op_num_threads = int(threads)
    sess = ort.InferenceSession(str(path), opts, providers=["CPUExecutionProvider"])

    def run(x: np.ndarray) -> np.ndarray:
        a = sess.run(None, {"pixels": x})[0]
        b = sess.run(None, {"pixels": np.ascontiguousarray(x[..., ::-1])})[0]
        return 0.5 * (a + b)

    return run


def bench_onnx(path: str, *, threads: int | None = None, iters: int = 10, warmup: int = 2) -> dict[str, Any]:
    """ONNX Runtime alone — no torch / transformers in the process — i.e. the footprint of a slim deployment."""
    out: dict[str, Any] = {"status": None, "rss_start_mb": current_rss_mb()}
    p = Path(path)
    if not p.is_file():
        out.update(status="model_unavailable", prerequisite="export first: bench --variants onnxruntime --export-onnx P")
        return out
    t = time.perf_counter()
    try:
        import onnxruntime as ort
    except ImportError:
        out.update(status="dependency_missing", prerequisite="pip install onnxruntime")
        return out
    out["ort_import_s"] = round(time.perf_counter() - t, 2)
    out["rss_after_import_mb"] = current_rss_mb()
    t = time.perf_counter()
    run = _ort_runner(ort, p, threads)
    out["load_s"] = round(time.perf_counter() - t, 2)
    out["rss_after_load_mb"] = current_rss_mb()
    one = np.random.default_rng(0).standard_normal((1, 3, 224, 224)).astype(np.float32)
    out["single_image_flip_avg"] = _time(lambda: run(one), iters, warmup)
    import sys

    out.update(status="ok", file_mb=round(p.stat().st_size / 2**20, 1), onnxruntime=ort.__version__,
               torch_loaded="torch" in sys.modules, peak_rss_mb=peak_rss_mb(), threads=threads or "ort default",
               environment=environment())
    return out
