"""One local research upload-to-report check; never installs a production scorer.

Run in a fresh process with --photo and --artifact. Only aggregate runtime metadata
is written; Ridge consumes the pipeline's existing PhotoCheck face in memory.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import threading
import time
from pathlib import Path
from unittest.mock import patch


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--photo", required=True, type=Path)
    ap.add_argument("--artifact", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path, help="New directory under git-ignored runs/")
    ap.add_argument("--memory-target-mib", type=float, default=400)
    args = ap.parse_args()
    if args.out.exists():
        ap.error("output directory must be new (one execution per measurement)")
    if not args.out.resolve().is_relative_to(Path("runs").resolve()):
        ap.error("output must be under runs/")
    import psutil  # optional measurement dependency, not required by production

    proc = psutil.Process()
    peaks = []
    stop = threading.Event()

    def sample():
        while not stop.is_set():
            mem = proc.memory_info()
            peaks.append(max(mem.rss, getattr(mem, "peak_wset", 0)))
            stop.wait(0.01)

    monitor = threading.Thread(target=sample, daemon=True)
    monitor.start()
    started = time.perf_counter()
    report = {"status": "failed", "research_only": True, "platform": platform.platform(),
              "python": platform.python_version(), "target_mib": args.memory_target_mib,
              "analysis_provider": "fake", "qc_mode": "real", "http_transport": "in_process_testclient"}
    try:
        from fastapi.testclient import TestClient

        from aesthetic_passport import cv, pipeline
        from aesthetic_passport.api.app import create_app
        from aesthetic_passport.api.settings import Settings
        from aesthetic_passport.schema_io import validate_passport

        from .preprocess import FaceInfo, geometry
        from .ridge_artifact import load_artifact, predict_features

        artifact = load_artifact(args.artifact)
        report["artifact_sha256"] = hashlib.sha256(args.artifact.read_bytes()).hexdigest()
        calls = {"faces": 0, "ridge": 0}
        prediction = {}
        original_faces, original_score = cv.MODELS.faces, pipeline._score

        def faces(rgb):
            calls["faces"] += 1
            return original_faces(rgb)

        def score(front, profile, log):
            summary, features = geometry(FaceInfo(checked=True, count=front.face_count,
                                                  landmarks=front.face.landmarks,
                                                  yaw=front.yaw, pitch=front.pitch))
            if not summary or summary["status"] != "full" or features is None:
                raise ValueError("ridge_quality_limited")
            # Keep the separate learned result only in the in-memory research
            # report; never relabel D36 or send the value to runtime logs.
            prediction.update(score=predict_features(features, artifact), target=artifact["target"],
                              research_only=True, percentile=None)
            calls["ridge"] += 1
            return original_score(front, profile, log)

        env = {"APP_ENV": "development", "ANALYSIS_PROVIDER": "fake", "QC_MODE": "real",
               "IMAGE_EDIT_PROVIDER": "fake", "PAYMENT_PROVIDER": "fake", "FAKE_ANALYSIS_DELAY_S": "0"}
        settings = Settings(runs_dir=args.out / "jobs", run_jobs_inline=True)
        with patch.dict(os.environ, env), patch.object(cv.MODELS, "faces", faces), \
                patch.object(pipeline, "_score", score), TestClient(create_app(settings)) as client:
            with args.photo.open("rb") as source:
                response = client.post("/api/passport", files={"front": ("front.jpg", source, "image/jpeg")},
                                       data={"consent": "true", "context": json.dumps({"user_context": {
                                           "presentation": "androgynous"}})})
            if response.status_code != 202:
                raise ValueError("upload_failed")
            pid = response.json()["id"]
            body = client.get(f"/api/passport/{pid}").json()
            if body["status"] != "full_ready":
                raise ValueError("report_not_ready")
            # The free HTTP view intentionally trims paid arrays. Validate the
            # assembled full artifact against Passport, not that entitlement view.
            full = json.loads((settings.runs_dir / pid / "passport.json").read_text(encoding="utf-8"))
            if validate_passport(full):
                raise ValueError("invalid_passport")
            research_report = json.loads(json.dumps({"passport": full, "ridge": prediction}))
            lo, hi = artifact["target"]["label_range"]
            if not lo <= research_report["ridge"]["score"] <= hi:
                raise ValueError("invalid_ridge_report")
            if calls != {"faces": 1, "ridge": 1}:
                raise ValueError("expected_one_face_detection_and_one_ridge_prediction")
            report.update(status="ok", face_detection_calls=1, ridge_predictions=1, passport_valid=True,
                          ridge_report_valid=True,
                          segmentation_loaded=cv.MODELS._segmenter is not None)
            # Research run stores no portrait, geometry or derived report beyond this check.
            if client.delete(f"/api/passport/{pid}").status_code != 200:
                raise ValueError("cleanup_failed")
    except Exception as exc:  # noqa: BLE001 -- only exception class is safe to log
        report["failure_type"] = type(exc).__name__
    finally:
        stop.set()
        monitor.join()
        from .runtime import peak_rss_mb

        peak = max(max(peaks, default=0) / 1024**2, peak_rss_mb() or 0)
        report.update(peak_rss_mib=round(peak, 2), within_memory_target=peak < args.memory_target_mib,
                      elapsed_s=round(time.perf_counter() - started, 3))
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "runtime.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "ok" and report["within_memory_target"] else 3


if __name__ == "__main__":
    raise SystemExit(main())
