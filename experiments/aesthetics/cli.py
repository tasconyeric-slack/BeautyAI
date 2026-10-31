"""python -m experiments.aesthetics {doctor,predict,evaluate,bench} — see experiments/aesthetics/README.md."""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import time
from pathlib import Path
from typing import Any

from . import TOOL_VERSION

ROOT = Path(__file__).resolve().parents[2]


def _emit(obj: dict[str, Any], out: str | None = None) -> None:
    text = json.dumps(obj, indent=2, ensure_ascii=False)
    print(text)
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        Path(out).write_text(text + "\n", encoding="utf-8")


def _model_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--weights", help="local dinov2-partial.pt (default models/aesthetics/mebeauty-fbp/ or "
                                     "$AESTHETICS_WEIGHTS)")
    p.add_argument("--backbone-config", help="optional local facebook/dinov2-base config.json "
                                             "(default: inferred from the checkpoint)")
    p.add_argument("--model-config", help="the model repo's config.json (default: next to the weights)")
    p.add_argument("--device", default="cpu")
    p.add_argument("--threads", type=int, help="torch CPU threads")
    p.add_argument("--no-flip", dest="flip", action="store_false", help="skip test-time flip averaging "
                                                                       "(faster; does not match published metrics)")


def cmd_doctor(_: argparse.Namespace) -> int:
    from .model import default_weights, download_hint

    def has(mod: str) -> bool:
        return importlib.util.find_spec(mod) is not None

    def mediapipe_loads() -> bool:
        try:
            from aesthetic_passport import cv

            return cv.available()
        except (ImportError, OSError, RuntimeError):   # OSError: libEGL / libGLES missing on the host
            return False

    w = default_weights()
    checks = {
        "numpy/pillow": has("numpy") and has("PIL"),
        "mediapipe (face check, geometric score)": mediapipe_loads(),
        "torch": has("torch"), "transformers": has("transformers"),
        "datasets (MEBeauty loader)": has("datasets"),
        f"weights {w.relative_to(ROOT) if w.is_relative_to(ROOT) else w}": w.is_file(),
    }
    hints = {
        "mediapipe (face check, geometric score)": "make install && make models (+ system libegl1 libgles2)",
        "torch": "pip install -r experiments/aesthetics/requirements.txt",
        "transformers": "pip install -r experiments/aesthetics/requirements.txt",
        "datasets (MEBeauty loader)": "pip install -r experiments/aesthetics/requirements.txt",
    }
    missing = {k: hints.get(k, download_hint()) for k, ok in checks.items() if not ok}
    _emit({"tool_version": TOOL_VERSION, "checks": checks, "missing": missing,
           "ready": {"predict": not missing, "evaluate_geometry_only": checks["mediapipe (face check, geometric score)"],
                     "bench_random_init": checks["torch"] and checks["transformers"]}})
    return 0 if not missing else 3


def cmd_predict(a: argparse.Namespace) -> int:
    from .predict import EXIT, predict_photo

    res = predict_photo(a.photo, weights=a.weights, crop=a.crop, margin=a.margin, flip=a.flip,
                        face_check=a.face_check, device=a.device, threads=a.threads,
                        backbone_config=a.backbone_config, model_config=a.model_config)
    _emit(res, a.out)
    return EXIT.get(res["status"], 1)


def cmd_evaluate(a: argparse.Namespace) -> int:
    from .datasets import DatasetUnavailable, load_csv, load_mebeauty, load_scut
    from .evaluate import evaluate, to_markdown, write_outputs

    try:
        if a.dataset == "mebeauty":
            ds = load_mebeauty(a.source, config=a.hf_config, test_split=a.split)
        elif a.dataset == "scut-fbp5500":
            ds = load_scut(a.images_dir or "", splits_dir=a.splits_dir, fold=a.fold, train_file=a.train_file,
                           test_file=a.test_file)
        else:
            ds = load_csv(a.csv or "", a.images_dir, (a.label_min, a.label_max))
    except DatasetUnavailable as e:
        _emit({"status": "dataset_unavailable", "dataset": a.dataset, "error": str(e), "prerequisite": e.prerequisite})
        return 3
    methods = tuple(m.strip() for m in a.methods.split(",") if m.strip())
    try:
        report, rows = evaluate(ds, methods=methods, weights=a.weights, backbone_config=a.backbone_config,
                                model_config=a.model_config, crop=a.crop, margin=a.margin, flip=a.flip,
                                device=a.device, threads=a.threads, batch=a.batch, max_test=a.max_test,
                                max_train=a.max_train, calibration_n=a.calibration_n, bootstrap=a.bootstrap,
                                min_group=a.min_group, reference_predictions=a.reference_predictions,
                                parity_tolerance=a.parity_tolerance,
                                ridge_artifact_out=a.ridge_artifact_out)
    except ValueError as e:
        _emit({"status": "error", "error": str(e)})
        return 1
    out = Path(a.out or ROOT / "runs" / "aesthetics" / f"eval-{ds.name}-{time.strftime('%Y%m%d-%H%M%S')}")
    write_outputs(out, report, rows)
    print(to_markdown(report))
    print(f"\nwrote {out}/report.json, report.md, predictions.jsonl", file=sys.stderr)
    return 0 if report["status"] == "complete" or not a.require_all else 3


def cmd_ridge_predict(a: argparse.Namespace) -> int:
    from .ridge_artifact import predict_photo

    res = predict_photo(a.photo, a.artifact)
    _emit(res, a.out)
    return 0 if res["status"] == "ok" else 3


def cmd_bench(a: argparse.Namespace) -> int:
    from .bench import bench

    res = bench(weights=a.weights, random_init=a.random_init, threads=a.threads, device=a.device, iters=a.iters,
                batch=a.batch, variants=tuple(v for v in a.variants.split(",") if v), export_onnx=a.export_onnx)
    _emit(res, a.out)
    return 0 if res["status"] == "ok" else 3


def cmd_bench_onnx(a: argparse.Namespace) -> int:
    from .bench import bench_onnx

    res = bench_onnx(a.onnx, threads=a.threads, iters=a.iters)
    _emit(res, a.out)
    return 0 if res["status"] == "ok" else 3


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="python -m experiments.aesthetics",
                                 description="Offline MEBeauty facial-attractiveness predictor: predict / evaluate / "
                                             "bench. Research-only; not wired into the product.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("doctor", help="list which local prerequisites are present").set_defaults(fn=cmd_doctor)

    p = sub.add_parser("predict", help="score one local portrait")
    p.add_argument("photo")
    _model_args(p)
    p.add_argument("--crop", choices=("face", "none"), default="face",
                   help="face: square crop around the detected face (default); none: image as-is")
    p.add_argument("--margin", type=float, default=0.25, help="face-crop margin per side, × face box side")
    p.add_argument("--no-face-check", dest="face_check", action="store_false",
                   help="with --crop none, skip the face detector (presence then reported as not verified)")
    p.add_argument("--out", help="also write the JSON here")
    p.set_defaults(fn=cmd_predict)

    e = sub.add_parser("evaluate", help="benchmark methods on a labelled dataset")
    e.add_argument("--dataset", choices=("mebeauty", "scut-fbp5500", "csv"), required=True)
    e.add_argument("--source", help="mebeauty: Hub repo id (default) or local snapshot dir")
    e.add_argument("--hf-config", default="fbp_extended")
    e.add_argument("--split", default="test", help="mebeauty evaluation split (only `test` is fair for the weights)")
    e.add_argument("--images-dir")
    e.add_argument("--splits-dir", help="scut: <SCUT-FBP5500-Database-Release>/data")
    e.add_argument("--fold", type=int, default=1)
    e.add_argument("--train-file")
    e.add_argument("--test-file")
    e.add_argument("--csv")
    e.add_argument("--label-min", type=float, default=1.0)
    e.add_argument("--label-max", type=float, default=10.0)
    e.add_argument("--methods", default="train_mean,geometric,geometry_ridge,mebeauty_dinov2")
    _model_args(e)
    e.add_argument("--crop", choices=("none", "face"), default="none",
                   help="none (default): dataset images as-is, as in the reference harness")
    e.add_argument("--margin", type=float, default=0.25)
    e.add_argument("--batch", type=int, default=8)
    e.add_argument("--max-test", type=int, help="seeded subsample for a quick run (reported as subsampled)")
    e.add_argument("--max-train", type=int)
    e.add_argument("--calibration-n", type=int, default=500,
                   help="train images the model scores to fit an off-scale calibration")
    e.add_argument("--bootstrap", type=int, default=1000)
    e.add_argument("--min-group", type=int, default=30)
    e.add_argument("--reference-predictions",
                   help="MEBeauty-Benchmark results/dinov2-partial_predictions.npz for a parity check")
    e.add_argument("--parity-tolerance", type=float, default=1e-3,
                   help="max |Δ score| vs the published predictions for parity PASS (default 1e-3)")
    e.add_argument("--ridge-artifact-out",
                   help="optional git-ignored local research-only Ridge coefficient JSON; fits on existing TRAIN rows")
    e.add_argument("--require-all", action="store_true", help="exit 3 unless every method ran")
    e.add_argument("--out", help="output dir (default runs/aesthetics/eval-<dataset>-<time>, git-ignored)")
    e.set_defaults(fn=cmd_evaluate)

    r = sub.add_parser("ridge-predict", help="local research-only inference from exported Ridge coefficients")
    r.add_argument("photo")
    r.add_argument("--artifact", required=True, help="JSON produced by evaluate --ridge-artifact-out")
    r.add_argument("--out")
    r.set_defaults(fn=cmd_ridge_predict)

    b = sub.add_parser("bench", help="measure load time, latency and memory")
    _model_args(b)
    b.add_argument("--random-init", action="store_true",
                   help="time the identical architecture with untrained weights (no weights needed; no score)")
    b.add_argument("--iters", type=int, default=10)
    b.add_argument("--batch", type=int, default=8)
    b.add_argument("--variants", default="", help="comma list: int8_dynamic,onnxruntime")
    b.add_argument("--export-onnx", help="keep the exported ONNX file here (put it under git-ignored models/)")
    b.add_argument("--out")
    b.set_defaults(fn=cmd_bench)

    o = sub.add_parser("bench-onnx", help="time an exported ONNX model with onnxruntime only (no torch)")
    o.add_argument("--onnx", required=True)
    o.add_argument("--threads", type=int)
    o.add_argument("--iters", type=int, default=10)
    o.add_argument("--out")
    o.set_defaults(fn=cmd_bench_onnx)
    return ap


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.fn(args))
