"""Batch evaluation: production geometric score vs a geometry-only ridge baseline vs the pretrained MEBeauty model.

Methods
    train_mean        predicts the train-split mean label (floor for MAE; no ranking ability)
    geometric         production `score_face` overall score (aes-geo-1.0, 0–100) — unchanged engine, read-only
    geometry_ridge    ridge regression on the D36 geometry measurements + pose, fitted on the TRAIN split only
    mebeauty_dinov2   published MEBeauty dinov2-partial weights (1–10)

Scales are never mixed. Spearman/Pearson are scale-free and always reported. MAE/RMSE are reported
    native              when the method predicts on this dataset's own label scale,
    calibrated_on_train after a linear map fitted on TRAIN rows only (label ≈ a + b·score), applied to test,
and never on raw cross-scale numbers. Every method is reported on its own coverage AND on the common subset
where all available methods produced a prediction.
"""
from __future__ import annotations

import json
import time
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np

from . import TOOL_VERSION
from . import preprocess as pp
from .datasets import EvalSet, Item
from .metrics import apply_calibration, fit_linear_calibration, point_metrics, ridge_fit, ridge_predict
from .model import MEBeautyDinoV2, ModelUnavailable
from .runtime import environment, peak_rss_mb

METHODS = ("train_mean", "geometric", "geometry_ridge", "mebeauty_dinov2")
# Max |Δ score| (1–10 scale) vs the published predictions. The maintainers report the hosted weights reproduce the
# published metrics bit-exactly on MPS; CPU vs MPS and transformers versions give ~1e-4-level float differences.
PARITY_TOLERANCE = 1e-3
MODEL = "mebeauty_dinov2"


def _subsample(items: list[Item], n: int | None, seed: int) -> list[Item]:
    if not n or n >= len(items):
        return items
    idx = np.sort(np.random.default_rng(seed).choice(len(items), n, replace=False))
    return [items[i] for i in idx]


class _Recorder:
    """Per-image predictions + failure reasons, kept in memory; only dataset ids, labels and scores are written."""

    def __init__(self, item: Item) -> None:
        self.item = item
        self.pred: dict[str, float | None] = {}
        self.fail: dict[str, str] = {}
        self.features: list[float] | None = None
        self.face: str | None = None

    def row(self) -> dict[str, Any]:
        return {"id": self.item.id, "split": self.item.split, "label": self.item.label, "groups": self.item.groups,
                "face": self.face, "pred": self.pred, "fail": self.fail}


def _process(items: list[Item], *, want_geometry: bool, want_model: bool, model: MEBeautyDinoV2 | None,
             crop: str, margin: float, flip: bool, batch: int, timers: Counter) -> list[_Recorder]:
    recs = [_Recorder(it) for it in items]
    queue: list[tuple[_Recorder, np.ndarray]] = []

    def flush() -> None:
        if not queue:
            return
        t = time.perf_counter()
        clipped, _raw = model.predict(np.stack([x for _, x in queue]), flip=flip)   # type: ignore[union-attr]
        timers[MODEL] += time.perf_counter() - t
        for (rec, _), v in zip(queue, clipped):
            rec.pred[MODEL] = float(v)
        queue.clear()

    for rec in recs:
        try:
            t = time.perf_counter()
            im = pp.load_rgb(rec.item.load())
            timers["decode"] += time.perf_counter() - t
        except pp.ImageUnreadable:
            rec.face = pp.UNREADABLE
            for m in ("geometric", "geometry_ridge", MODEL):
                rec.fail[m] = pp.UNREADABLE
            continue
        face = pp.FaceInfo(checked=False)
        if want_geometry or crop == "face":
            t = time.perf_counter()
            face = pp.detect_face(im)
            timers["face_detect"] += time.perf_counter() - t
            rec.face = (pp.OK if face.count else pp.NO_FACE) if face.checked else pp.DEPENDENCY_MISSING
        if want_geometry:
            if not face.checked:
                rec.fail["geometric"] = rec.fail["geometry_ridge"] = pp.DEPENDENCY_MISSING
            elif face.landmarks is None:
                rec.fail["geometric"] = rec.fail["geometry_ridge"] = pp.NO_FACE
            else:
                t = time.perf_counter()
                summary, feats = pp.geometry(face)
                timers["geometric"] += time.perf_counter() - t
                overall = summary["overall_score"] if summary else None
                rec.pred["geometric"] = overall
                if overall is None:
                    rec.fail["geometric"] = pp.GEOMETRY_UNAVAILABLE
                rec.features = feats
                if feats is None:
                    rec.fail["geometry_ridge"] = pp.GEOMETRY_UNAVAILABLE
        if want_model and model is not None:
            if crop == "face" and face.box is None:
                rec.fail[MODEL] = pp.NO_FACE if face.checked else pp.DEPENDENCY_MISSING
                continue
            cropped, _ = pp.crop_for_model(im, face, crop, margin)
            queue.append((rec, pp.to_model_input(cropped)))
            if len(queue) >= batch:
                flush()
    flush()
    return recs


def _arrays(recs: list[_Recorder], method: str) -> tuple[np.ndarray, np.ndarray, list[_Recorder]]:
    ok = [r for r in recs if r.pred.get(method) is not None]
    return (np.array([r.pred[method] for r in ok], float), np.array([r.item.label for r in ok], float), ok)


def evaluate(ds: EvalSet, *, methods: tuple[str, ...] = METHODS, weights: str | None = None,
             backbone_config: str | None = None, model_config: str | None = None, crop: str = "none",
             margin: float = 0.25, flip: bool = True, device: str = "cpu", threads: int | None = None, batch: int = 8,
             max_test: int | None = None, max_train: int | None = None, calibration_n: int = 500,
             bootstrap: int = 1000, min_group: int = 30, seed: int = 0,
             reference_predictions: str | None = None,
             parity_tolerance: float = PARITY_TOLERANCE,
             ridge_artifact_out: str | None = None) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    unknown = set(methods) - set(METHODS)
    if unknown:
        raise ValueError(f"unknown method(s) {sorted(unknown)}; choose from {METHODS}")
    if ridge_artifact_out and "geometry_ridge" not in methods:
        raise ValueError("Ridge artifact export requires geometry_ridge in --methods")
    ds.check_disjoint()
    test = _subsample(ds.test, max_test, seed)
    train = _subsample(ds.train, max_train, seed)
    lo, hi = ds.label_range
    t_start = time.perf_counter()
    report: dict[str, Any] = {
        "report_version": 1, "tool_version": TOOL_VERSION, "dataset": ds.describe(),
        "subsampled": {"test": len(test) != len(ds.test), "train": len(train) != len(ds.train),
                       "n_test": len(test), "n_train": len(train), "seed": seed},
        "settings": {"crop": crop, "crop_margin": margin if crop == "face" else None, "flip": flip, "device": device,
                     "calibration_n": calibration_n, "bootstrap": bootstrap, "min_group": min_group},
        "methods": {}, "notes": list(ds.notes)}

    # model availability is decided once, before touching any image
    model = None
    model_info: dict[str, Any] = {}
    if MODEL in methods:
        if MODEL in ds.blocked:
            model_info = {"status": "blocked", "reason": ds.blocked[MODEL]}
        else:
            try:
                model = MEBeautyDinoV2(weights, backbone_config=backbone_config, model_config=model_config,
                                       device=device, threads=threads)
                model_info = {"status": "ok", "model_version": model.model_version, "model": model.describe(),
                              "load_s": model.load_seconds}
            except ModelUnavailable as e:
                model_info = {"status": e.status, "reason": str(e), "prerequisite": e.prerequisite}
    model_native = ds.native_scale == "mebeauty"
    want_geo = bool({"geometric", "geometry_ridge"} & set(methods))

    timers: Counter = Counter()
    test_recs = _process(test, want_geometry=want_geo, want_model=model is not None, model=model, crop=crop,
                         margin=margin, flip=flip, batch=batch, timers=timers)
    # train rows: geometry for calibration / ridge fit; the model only for calibration when it is off-scale
    cal_ids = {it.id for it in _subsample(train, calibration_n, seed + 1)}
    train_geo = _process(train, want_geometry=want_geo, want_model=False, model=None, crop=crop, margin=margin,
                         flip=flip, batch=batch, timers=timers) if want_geo else []
    train_model = []
    if model is not None and not model_native:
        train_model = _process([it for it in train if it.id in cal_ids], want_geometry=False, want_model=True,
                               model=model, crop=crop, margin=margin, flip=flip, batch=batch, timers=timers)

    y_train = np.array([it.label for it in train], float)
    final: dict[str, dict[str, Any]] = {}

    # --- per-method predictions on test ------------------------------------------------------------------------
    for m in methods:
        info: dict[str, Any] = {"status": "ok"}
        if m == "train_mean":
            if not len(y_train):
                info = {"status": "unavailable", "reason": "no train rows"}
            else:
                mean = float(y_train.mean())
                for r in test_recs:
                    r.pred[m] = mean
                info.update(scale="native", train_mean=round(mean, 4))
        elif m == "geometric":
            px, py, _ = _arrays(train_geo, "geometric")
            cal = fit_linear_calibration(px, py)
            info.update(scale="calibrated_on_train" if cal else "rank_only", calibration=cal,
                        native_range=[0, 100], scoring_version=_scoring_version())
            if cal:
                for r in test_recs:
                    if r.pred.get(m) is not None:
                        r.pred[f"{m}@cal"] = float(apply_calibration([r.pred[m]], cal, lo, hi)[0])
        elif m == "geometry_ridge":
            rows = [r for r in train_geo if r.features is not None]
            if len(rows) < 30:
                info = {"status": "unavailable",
                        "reason": f"only {len(rows)} train images with full geometry (need ≥ 30)"}
                for r in test_recs:
                    r.pred.pop(m, None)
            else:
                fit = ridge_fit(np.array([r.features for r in rows]), np.array([r.item.label for r in rows]))
                if ridge_artifact_out:
                    from .ridge_artifact import make_artifact, save_artifact

                    artifact = make_artifact(fit, dataset=ds.name, label_name=ds.label_name,
                                             label_range=ds.label_range)
                    save_artifact(ridge_artifact_out, artifact)
                    info["research_artifact_written"] = True
                for r in test_recs:
                    if r.features is not None:
                        r.pred[m] = float(np.clip(ridge_predict(fit, np.array([r.features]))[0], lo, hi))
                info.update(scale="native", features=list(pp.GEOMETRY_FEATURES), alpha=fit["alpha"],
                            train_cv_mae=fit["cv_mae"], n_train=fit["n_train"])
        elif m == MODEL:
            info = dict(model_info)
            if model is None:
                for r in test_recs:
                    r.pred.pop(m, None)
                    r.fail.pop(m, None)
            elif model_native:
                info["scale"] = "native"
            else:
                px, py, _ = _arrays(train_model, MODEL)
                cal = fit_linear_calibration(px, py)
                info.update(scale="calibrated_on_train" if cal else "rank_only", calibration=cal,
                            native_range=list(model.score_range))
                if cal:
                    for r in test_recs:
                        if r.pred.get(m) is not None:
                            r.pred[f"{m}@cal"] = float(apply_calibration([r.pred[m]], cal, lo, hi)[0])
        final[m] = info

    # --- metrics -----------------------------------------------------------------------------------------------
    available = [m for m in methods if final[m]["status"] == "ok"]
    ranked = [m for m in available if m != "train_mean"]
    common = [r for r in test_recs if all(r.pred.get(m) is not None for m in ranked)]

    def metric_block(recs: list[_Recorder], m: str, boot: int) -> dict[str, Any] | None:
        x, y, ok = _arrays(recs, m)
        if not len(ok):
            return None
        scale = final[m].get("scale")
        if m == "train_mean":
            out = point_metrics(x, y, with_errors=True, bootstrap=0)
            out["spearman"] = out["pearson"] = None
            return out
        out = point_metrics(x, y, with_errors=scale == "native", bootstrap=boot)
        if scale == "calibrated_on_train":
            xc, yc, _ = _arrays(recs, f"{m}@cal")
            cal_m = point_metrics(xc, yc, with_errors=True, bootstrap=0)
            out.update(mae=cal_m["mae"], rmse=cal_m["rmse"])
        out["error_basis"] = {"native": "native", "calibrated_on_train": "calibrated_on_train"}.get(scale)
        return out

    for m in methods:
        info = final[m]
        if info["status"] != "ok":
            info["coverage"] = {"n_total": len(test_recs), "n_scored": 0}
            report["methods"][m] = info
            continue
        _, _, ok = _arrays(test_recs, m)
        fails = Counter(r.fail.get(m, "unknown") for r in test_recs if r.pred.get(m) is None)
        info["coverage"] = {"n_total": len(test_recs), "n_scored": len(ok),
                            "rate": round(len(ok) / max(1, len(test_recs)), 4), "failures": dict(fails)}
        info["metrics"] = metric_block(test_recs, m, bootstrap)
        info["metrics_common_subset"] = metric_block(common, m, bootstrap)
        groups: dict[str, dict[str, Any]] = {}
        keys = sorted({k for r in test_recs for k in r.item.groups})
        for key in keys:
            vals = Counter(r.item.groups.get(key) for r in test_recs if r.item.groups.get(key))
            for v, _n in sorted(vals.items()):
                sub = [r for r in test_recs if r.item.groups.get(key) == v]
                n_ok = sum(1 for r in sub if r.pred.get(m) is not None)
                if n_ok >= min_group:
                    blk = metric_block(sub, m, 0)
                    groups.setdefault(key, {})[v] = {k: blk[k] for k in ("n", "spearman", "mae")} if blk else None
                else:
                    groups.setdefault(key, {})[v] = {"n": n_ok, "skipped": f"n < {min_group}"}
        info["breakdowns"] = groups
        secs = timers.get(m)
        if secs:
            n_runs = len(ok) + (len(train_model) if m == MODEL else 0)
            info["runtime"] = {"seconds": round(secs, 2), "per_image_ms": round(1000 * secs / max(1, n_runs), 1)}
        report["methods"][m] = info

    report["common_subset"] = {"n": len(common), "methods": ranked}
    face_counts = Counter(r.face for r in test_recs if r.face)
    report["face_detection"] = dict(face_counts)
    if reference_predictions and model is not None:
        report["parity_with_published_predictions"] = _parity(reference_predictions, ds, test_recs, report,
                                                              parity_tolerance)
    report["runtime"] = {"total_s": round(time.perf_counter() - t_start, 1), "peak_rss_mb": peak_rss_mb(),
                         "stages_s": {k: round(v, 2) for k, v in timers.items()}}
    report["environment"] = environment()
    expected = [m for m in methods if m != MODEL or MODEL not in ds.blocked]
    # complete = every requested (non-blocked) method ran AND scored at least one test image; a requested parity
    # check must also pass. Anything else is partial, with the reasons listed.
    incomplete = {m: final[m]["status"] for m in expected if final[m]["status"] != "ok"}
    incomplete.update({m: "zero_test_samples_scored" for m in expected
                       if final[m]["status"] == "ok" and not report["methods"][m]["coverage"]["n_scored"]})
    parity = report.get("parity_with_published_predictions")
    if parity and parity["status"] != "pass":
        incomplete["parity"] = parity["status"]
    report["incomplete_reasons"] = incomplete
    report["status"] = "partial" if incomplete else "complete"
    return report, [r.row() for r in test_recs]


def _parity(path: str, ds: EvalSet, recs: list[_Recorder], report: dict[str, Any],
            tolerance: float = PARITY_TOLERANCE) -> dict[str, Any]:
    """Compare against MEBeauty-Benchmark results/dinov2-partial_predictions.npz (holdout test, dataset order).

    status: "pass" only if EVERY reference row was scored and max |Δ| ≤ tolerance; otherwise "fail" (with a reason),
    "skipped" (not applicable) or "error" (reference unreadable / wrong length)."""
    base: dict[str, Any] = {"tolerance": tolerance, "reference": Path(path).name}
    if ds.name != "mebeauty" or report["subsampled"]["test"]:
        return {**base, "status": "skipped", "reason": "needs the full, unsubsampled MEBeauty holdout test split"}
    try:
        ref = np.load(path)["predictions"].astype(float)
    except (OSError, KeyError, ValueError) as e:
        return {**base, "status": "error", "reason": f"{type(e).__name__}: {e}"}
    ours = np.array([np.nan if r.pred.get(MODEL) is None else r.pred[MODEL] for r in recs], float)
    if len(ref) != len(ours):
        return {**base, "status": "error", "reason": f"reference has {len(ref)} rows, test split has {len(ours)}"}
    ok = ~np.isnan(ours)
    out = {**base, "n_reference": len(ref), "n_compared": int(ok.sum())}
    if not ok.any():
        return {**out, "status": "fail", "reason": "no reference row was scored by the model"}
    diff = np.abs(ours[ok] - ref[ok])
    labels = np.array([r.item.label for r in recs])
    out.update(max_abs_diff=float(f"{diff.max():.3g}"), mean_abs_diff=float(f"{diff.mean():.3g}"),
               n_over_tolerance=int((diff > tolerance).sum()),
               published_predictions_metrics=point_metrics(ref, labels, bootstrap=0))
    if not ok.all():
        return {**out, "status": "fail", "reason": f"{int((~ok).sum())} reference rows were not scored"}
    if diff.max() > tolerance:
        return {**out, "status": "fail", "reason": f"max |Δ| {diff.max():.3g} > tolerance {tolerance}"}
    return {**out, "status": "pass"}


def _scoring_version() -> str | None:
    try:
        from aesthetic_passport.scoring import load_scoring_config

        return load_scoring_config()["version"]
    except Exception:  # noqa: BLE001
        return None


# --- writing ------------------------------------------------------------------------------------------------------
def _fmt(v: Any) -> str:
    return "—" if v is None else (f"{v:.4f}" if isinstance(v, float) else str(v))


def to_markdown(report: dict[str, Any]) -> str:
    d = report["dataset"]
    lines = [f"# Aesthetics evaluation — {d['name']}", "",
             f"- Source: `{d['source']}` · label `{d['label']}` on its native range {d['label_range']}",
             f"- Protocol: {d['protocol']} · test n = {report['subsampled']['n_test']}"
             + (" (subsampled)" if report["subsampled"]["test"] else ""),
             (f"- Status: **{report['status']}** · tool {report['tool_version']} · commit "
              f"{report['environment'].get('repo_commit')}"), "",
             "| Method | Status | Coverage | Spearman [95% CI] | Pearson | MAE | RMSE | Error basis |",
             "|---|---|---|---|---|---|---|---|"]
    for m, info in report["methods"].items():
        met = info.get("metrics") or {}
        cov = info.get("coverage", {})
        ci = met.get("spearman_ci95")
        sp = _fmt(met.get("spearman")) + (f" [{ci[0]:.3f}, {ci[1]:.3f}]" if ci else "")
        lines.append(f"| `{m}` | {info['status']} | {cov.get('n_scored', 0)}/{cov.get('n_total', 0)} | {sp} | "
                     f"{_fmt(met.get('pearson'))} | {_fmt(met.get('mae'))} | {_fmt(met.get('rmse'))} | "
                     f"{met.get('error_basis') or ('native' if m == 'train_mean' else '—')} |")
    lines += ["", f"Common subset (all ranked methods scored): n = {report['common_subset']['n']}", "",
              "| Method | Spearman | MAE |", "|---|---|---|"]
    for m, info in report["methods"].items():
        mc = info.get("metrics_common_subset") or {}
        lines.append(f"| `{m}` | {_fmt(mc.get('spearman'))} | {_fmt(mc.get('mae'))} |")
    unavailable = {m: i for m, i in report["methods"].items() if i["status"] != "ok"}
    if unavailable:
        lines += ["", "## Not run", ""]
        for m, i in unavailable.items():
            lines.append(f"- `{m}`: {i['status']} — {i.get('reason')}"
                         + (f" · prerequisite: {i['prerequisite']}" if i.get("prerequisite") else ""))
    if report.get("incomplete_reasons"):
        lines += ["", "Incomplete: " + ", ".join(f"`{k}` ({v})" for k, v in report["incomplete_reasons"].items())]
    if report.get("parity_with_published_predictions"):
        par = report["parity_with_published_predictions"]
        lines += ["", (f"## Parity with published predictions: **{par['status'].upper()}** "
                      f"(tolerance {par['tolerance']})"), "", "```json",
                  json.dumps(report["parity_with_published_predictions"], indent=2), "```"]
    lines += ["", "## Notes", ""] + [f"- {n}" for n in report["notes"]]
    lines += [("- Scores predict a specific rater panel's mean rating; MEBeauty (1–10) and SCUT (1–5) scales are "
               "kept separate. Cross-scale MAE is only reported after a train-split linear calibration."), ""]
    return "\n".join(lines)


def write_outputs(out_dir: Path, report: dict[str, Any], rows: list[dict[str, Any]]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (out_dir / "report.md").write_text(to_markdown(report), encoding="utf-8")
    with (out_dir / "predictions.jsonl").open("w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
