"""End-to-end pipeline: photos + user context → validated Passport JSON (two-stage, D21).

Stages (each reported through `on_stage`, which drives the reveal UI):
    qc → anchors → color (+ measurement profile) → quick → analysis → rules → assemble
Partial results are reported through `on_partial(kind, payload)` as soon as they exist, in this order:
    anchors (input_quality + anchors, ~1 s) → quick (first look, ~15 s) → analysis (the assembled passport)
A failed quick call is logged and skipped; the full analysis still runs.

CLI:
    python -m aesthetic_passport.pipeline --photos data/p01 --context examples/sample_context.json --out runs/
The photos directory holds front.* (required) plus optional profile90.*, noglasses.*, profile45.*, smile.* and hair.*.
profile90 (true side) and noglasses (glasses-free front) are measurement-only inputs (D35): they feed the CV
measurement profile and are never sent to the analysis model, so the model contract and prompt are unchanged.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

from .analyzer import AnalysisFailed, load_images, run_analysis, run_quick
from .assemble import build_passport, complete_user_context
from .cv import CVUnavailable
from .imaging import open_rgb
from .providers import Provider

STAGES = ("qc", "anchors", "color", "quick", "analysis", "rules", "assemble")
PHOTO_ROLES = ("front", "profile90", "noglasses", "profile45", "smile", "hair")
MODEL_ROLES = ("front", "profile45", "smile", "hair")       # what the analysis model receives (prompt unchanged)
MEASURE_ROLES = ("front", "profile90", "noglasses", "smile")  # photos the measurement workbench can show
REQUIRED_ROLES = ("front",)
IMAGE_SUFFIXES = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif")

StageCallback = Callable[[str], None]
PartialCallback = Callable[[str, Any], None]


class PipelineError(RuntimeError):
    """A user-facing failure. `code` is stable (UI copy keys off it); `detail` is safe to show."""

    def __init__(self, code: str, detail: str, payload: dict[str, Any] | None = None):
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail
        self.payload = payload or {}


def qc_mode() -> str:
    """`real` (MediaPipe) or `stub` (everything passes; for dev/CI without model files). Production is always real."""
    from .runtime import mocks_allowed

    mode = os.environ.get("QC_MODE", "real").strip().lower()
    return mode if mode != "stub" or mocks_allowed() else "real"


def stub_input_quality(roles: list[str]) -> dict[str, Any]:
    photos = [
        {"photo_id": r, "status": "ok", "face_count": 1, "yaw": None, "pitch": None, "roll": None,
         "blur_score": None, "face_luma_mean": None, "face_box_px": None, "issues": []}
        for r in roles
    ]
    return {"passed": True, "photos": photos, "lighting_consistency": "unknown", "retake_guidance": []}


def _signal_colors(cm: dict[str, Any]) -> str:
    """Compact color signal for the prompt: region Lab medians + derived numbers + reliability."""
    regions = {k: v["lab"] for k, v in cm["regions"].items() if v}
    keep = ("warmth_b", "depth_L", "chroma_C", "skin_brow_contrast_dL", "reliability")
    return json.dumps({"regions_lab": regions, **{k: cm[k] for k in keep}}, ensure_ascii=False)


def find_photos(photos_dir: Path) -> dict[str, Path]:
    found: dict[str, Path] = {}
    for role in PHOTO_ROLES:
        for p in sorted(photos_dir.iterdir()):
            if p.stem.lower() == role and p.suffix.lower() in IMAGE_SUFFIXES:
                found[role] = p
                break
    return found


def run_pipeline(
    photos: dict[str, Path],
    user_context: dict[str, Any],
    *,
    run_dir: Path,
    passport_id: str | None = None,
    on_stage: StageCallback | None = None,
    on_partial: PartialCallback | None = None,
    provider: Provider | None = None,
    media_dir: Path | None = None,
    photo_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run the whole pipeline. `media_dir` (default run_dir/media) receives geometry.json, which lives and dies with
    the front photo (retention). `photo_meta` = per-role capture info from the upload page: {"front": {"eyewear": true,
    "capture": {...framing}}, ...} — provenance only, it never changes a measurement formula."""
    stage = on_stage or (lambda _s: None)
    partial = on_partial or (lambda _k, _v: None)
    user_context = complete_user_context(user_context)
    missing = [r for r in REQUIRED_ROLES if r not in photos]
    if missing:
        raise PipelineError("missing_photos", f"缺少必需的照片：{', '.join(missing)}")
    passport_id = passport_id or f"ap_{uuid.uuid4().hex[:12]}"
    run_dir.mkdir(parents=True, exist_ok=True)

    # 1. QC gate — a failed front/profile45 stops the run before any model call.
    stage("qc")
    roles = [r for r in PHOTO_ROLES if r in photos]
    checks: dict[str, Any] = {}
    cv_log: dict[str, Any] = {}
    if qc_mode() == "stub":
        input_quality = stub_input_quality(roles)
    else:
        from .qc import check_role
        from .qc import input_quality as aggregate

        try:
            checks = {r: check_role(open_rgb(photos[r]), r) for r in roles}
        except CVUnavailable as e:
            raise PipelineError("cv_unavailable", "照片检测服务暂时不可用，请稍后重试") from e
        input_quality = aggregate(list(checks.values()))
    if not input_quality["passed"]:
        raise PipelineError("qc_failed", "照片质检未通过", {"input_quality": input_quality})
    usable = [r for r in roles if r not in checks or checks[r].status != "reject"]

    # 2. Anchors (CV measurements on the front photo).
    stage("anchors")
    anchors: dict[str, Any] | None = None
    front = checks.get("front")
    if front is not None and front.face is not None:
        from .anchors import export_geometry, measure
        from .cv import MODELS

        try:
            seg = MODELS.segment(front.rgb)
        except CVUnavailable:
            seg = None
        anchors, warnings = measure(front.face, front.yaw, seg=seg)
        cv_log["anchor_warnings"] = warnings
    partial("anchors", {"input_quality": input_quality, "anchors": anchors})

    # 3. Color measurements (CV signal, D15) and the measurement profile (V3A, D34) on the same landmarks.
    stage("color")
    color_measurements: dict[str, Any] | None = None
    measurement_profile: dict[str, Any] | None = None
    aesthetic_score: dict[str, Any] | None = None
    reference_percentiles: dict[str, Any] | None = None
    if front is not None and front.face is not None:
        from .color_sample import measure_colors

        color_measurements = measure_colors(front.rgb, front.face, lighting_consistency=input_quality["lighting_consistency"],
                                            clipped_frac=front.clipped_frac, face_luma=front.face_luma_mean, seg=seg)
        if color_measurements is None:
            cv_log["color_warning"] = "not enough skin pixels to sample"
        points: dict[str, Any] = {}
        views_geo: dict[str, Any] = {}
        try:
            measurement_profile, points, views_geo = _measure(front, seg, color_measurements, checks, photo_meta)
            cv_log["measured_metrics"] = measurement_profile["coverage"]["total_measured"]
        except Exception as e:  # noqa: BLE001 — an optional CV layer never blocks the passport (face page falls back)
            cv_log["measurement_error"] = type(e).__name__
        aesthetic_score = _score(front, measurement_profile, cv_log)
        reference_percentiles = _percentiles(aesthetic_score, front, cv_log)
        # geometry.json: tint polygons + the named measurement points (+ the other measurement photos' points).
        # Lives and dies with the front photo (24 h).
        mdir = media_dir or run_dir / "media"
        mdir.mkdir(parents=True, exist_ok=True)
        geometry = {**export_geometry(front.face, front.rgb.shape[:2]), "points": points, "views": views_geo}
        (mdir / "geometry.json").write_text(json.dumps(geometry, separators=(",", ":")) + "\n", encoding="utf-8")

    if aesthetic_score is None:                 # no front landmarks (e.g. QC stub mode): say so, never invent a score
        from .scoring import unavailable

        aesthetic_score = unavailable("no_landmarks")
        reference_percentiles = _percentiles(aesthetic_score, None, cv_log)   # explicit "no score" state

    # 4a. Quick first look (front only). Never blocks the full analysis.
    images = load_images({r: photos[r] for r in usable if r in MODEL_ROLES})
    stage("quick")
    quick_meta: dict[str, Any] | None = None
    try:
        q = run_quick(images, user_context, input_quality, anchors, provider=provider, run_dir=run_dir)
        quick_meta = {"model": q.model, "prompt_version": q.prompt_version, "latency_ms": q.latency_ms, "ok": True}
        partial("quick", q.analysis)
    except Exception as e:  # noqa: BLE001 — any quick failure (invalid, provider error) only skips the first look
        cv_log["quick_error"] = type(e).__name__
        quick_meta = {"model": "unknown", "prompt_version": "analyzer-quick-0.1", "latency_ms": None, "ok": False}
        partial("quick_failed", None)

    # 4b. The full production model call (+ at most one repair turn).
    stage("analysis")
    signals = {"color_measurements_json": _signal_colors(color_measurements)} if color_measurements else None
    try:
        outcome = run_analysis(images, user_context, input_quality, anchors, extra_signals=signals,
                               provider=provider, run_dir=run_dir)
    except AnalysisFailed as e:
        raise PipelineError("analysis_failed", "分析结果未通过校验，请稍后重试", {"errors": e.errors[:10]}) from e

    # 5–6. Rules layer + assembly (build_passport validates before and after).
    stage("rules")
    meta = {
        "analysis_model": outcome.model,
        "prompt_version": outcome.prompt_version,
        "latency_ms": outcome.latency_ms,
        "cost_usd_est": outcome.cost_usd_est,
        "retries": outcome.retries,
        "quick": quick_meta,
    }
    stage("assemble")
    if cv_log:
        (run_dir / "cv.json").write_text(json.dumps(cv_log, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    passport = build_passport(outcome.analysis, user_context, input_quality, anchors, meta,
                              color_measurements=color_measurements, measurement_profile=measurement_profile,
                              aesthetic_score=aesthetic_score, reference_percentiles=reference_percentiles,
                              passport_id=passport_id)
    (run_dir / "passport.json").write_text(json.dumps(passport, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    partial("analysis", passport)
    return passport


def _score(front: Any, measurement_profile: dict[str, Any] | None, cv_log: dict[str, Any]) -> dict[str, Any]:
    """AI 面部美学参考分 (D36) on the same front landmarks the measurement layer used. Never blocks the passport:
    any failure becomes an explicit unavailable score."""
    from .scoring import score_face, unavailable

    try:
        s = score_face(front.face.landmarks, yaw=front.yaw, pitch=front.pitch,
                       flags=(measurement_profile or {}).get("flags"))
    except Exception as e:  # noqa: BLE001
        cv_log["scoring_error"] = type(e).__name__
        return unavailable("landmarks_unclear")
    return s   # nothing photo-derived goes into cv_log (invariant 7): status and flags live only in the passport


def _percentiles(aesthetic_score: dict[str, Any], front: Any, cv_log: dict[str, Any]) -> dict[str, Any] | None:
    """Reference-cohort rank + ratio rails (#41) on the same front landmarks as the score. Never blocks the passport."""
    from .percentiles import reference_percentiles

    try:
        if front is None:
            return reference_percentiles(aesthetic_score)
        return reference_percentiles(aesthetic_score, front.face.landmarks, yaw=front.yaw, pitch=front.pitch)
    except Exception as e:  # noqa: BLE001
        cv_log["percentiles_error"] = type(e).__name__
        return None


SIDE_QC_REASON = {"wrong_angle_for_role": "side_not_true_profile", "face_too_small": "resolution_too_low",
                  "profile_unclear": "landmarks_unclear"}


def _measure(front: Any, seg: Any, color: dict[str, Any] | None, checks: dict[str, Any],
             photo_meta: dict[str, Any] | None) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """The CV measurement profile over every measurement photo that passed its own QC."""
    from .face_metrics import PhotoIn, SideIn, measure_all

    meta = photo_meta or {}
    fc = checks.get("front")
    # a glasses-free supplement only makes sense when the front photo has glasses, so supplying one implies it
    eyewear = "user" if (meta.get("front") or {}).get("eyewear") or "noglasses" in checks else (
        "detected" if fc is not None and "eyewear_detected" in fc.issues else None)

    def frontal(role: str) -> PhotoIn | None:
        c = checks.get(role)
        if c is None or c.status == "reject" or c.face is None:
            return None
        return PhotoIn(face=c.face, shape=c.rgb.shape[:2], yaw=c.yaw, pitch=c.pitch, rgb=c.rgb)

    side = None
    sc = checks.get("profile90")
    if sc is not None:
        trace = sc.extra.get("trace")
        if trace is not None and sc.status != "reject":
            side = SideIn(shape=sc.rgb.shape[:2], trace=trace)
        else:
            first = next((i for i in sc.issues if i in sc.rejects), None)
            side = SideIn(shape=sc.rgb.shape[:2], reason=SIDE_QC_REASON.get(first or "", "side_photo_rejected"))
    sm = checks.get("smile")
    smile_reason = "smile_photo_rejected" if sm is not None and (sm.status == "reject" or sm.face is None) else None
    capture = {r: (meta.get(r) or {}).get("capture") for r in MEASURE_ROLES if (meta.get(r) or {}).get("capture")}
    return measure_all(front.face, shape=front.rgb.shape[:2], yaw=front.yaw, pitch=front.pitch, seg=seg,
                       rgb=front.rgb, color_measurements=color, eyewear=eyewear,
                       noglasses=frontal("noglasses") if eyewear else None, side=side, smile=frontal("smile"),
                       smile_reason=smile_reason, capture=capture)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--photos", required=True, type=Path)
    ap.add_argument("--context", required=True, type=Path,
                    help="JSON with a user_context object (examples/sample_context.json works)")
    ap.add_argument("--out", default=Path("runs"), type=Path)
    args = ap.parse_args(argv)

    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass
    ctx = json.loads(args.context.read_text(encoding="utf-8"))
    user_context = ctx.get("user_context", ctx)
    photos = find_photos(args.photos)
    pid = f"ap_{uuid.uuid4().hex[:12]}"
    run_dir = args.out / pid
    try:
        passport = run_pipeline(photos, user_context, run_dir=run_dir, passport_id=pid,
                                on_stage=lambda s: print(f"· {s}", file=sys.stderr))
    except PipelineError as e:
        print(f"FAIL {e.code}: {e.detail} {json.dumps(e.payload, ensure_ascii=False)[:2000]}", file=sys.stderr)
        return 1
    d, m = passport["derived"], passport["meta"]
    print(f"OK {run_dir / 'passport.json'}  top5={d['top5']}  quick_ok={m['quick']['ok'] if m['quick'] else None}  "
          f"overall_confidence={d['overall_confidence']}  "
          f"model={m['analysis_model']} retries={m['retries']} latency_ms={m['latency_ms']} cost=${m['cost_usd_est']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
