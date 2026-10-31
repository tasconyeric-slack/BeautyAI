"""One actual multipart upload + missing-model fallback; saves the existing report for local preview."""
from __future__ import annotations

import argparse
import json
import os
import platform
import threading
import time
from pathlib import Path
from unittest.mock import patch


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--photo", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    if args.out.exists() or not args.out.resolve().is_relative_to(Path("runs").resolve()):
        ap.error("choose a fresh path under runs/")
    import psutil

    process = psutil.Process()
    stop = threading.Event()
    peaks = []

    def sample():
        while not stop.is_set():
            mem = process.memory_info()
            peaks.append(max(mem.rss, getattr(mem, "peak_wset", 0)))
            stop.wait(0.01)

    monitor = threading.Thread(target=sample, daemon=True)
    monitor.start()
    start = time.perf_counter()
    metrics = {"status": "failed", "platform": platform.platform(), "python": platform.python_version(),
                   "research_only": True, "analysis_provider": "fake", "qc_mode": "real"}
    try:
        from fastapi.testclient import TestClient

        from aesthetic_passport import cv
        from aesthetic_passport.api.app import create_app
        from aesthetic_passport.api.settings import Settings
        from aesthetic_passport.schema_io import validate_passport

        calls = []
        original = cv.MODELS.faces

        def faces(rgb):
            calls.append(1)
            return original(rgb)

        settings = Settings(runs_dir=args.out / "jobs", run_jobs_inline=True)
        env = {"APP_ENV": "development", "BEAUTYAI_RIDGE_MODE": "research", "ANALYSIS_PROVIDER": "fake",
                   "IMAGE_EDIT_PROVIDER": "fake", "PAYMENT_PROVIDER": "fake", "QC_MODE": "real", "FAKE_ANALYSIS_DELAY_S": "0"}
        with patch.dict(os.environ, env), patch.object(cv.MODELS, "faces", faces), TestClient(create_app(settings)) as c:
            def submit():
                with args.photo.open("rb") as source:
                    response = c.post("/api/passport", files={"front": ("front.jpg", source, "image/jpeg")},
                                      data={"consent": "true", "context": json.dumps({"user_context": {
                                          "presentation": "androgynous"}})})
                assert response.status_code == 202
                pid = response.json()["id"]
                body = c.get(f"/api/passport/{pid}").json()
                assert body["status"] == "full_ready"
                full = json.loads((settings.runs_dir / pid / "passport.json").read_text(encoding="utf-8"))
                assert not validate_passport(full)
                return pid, full

            pid, full = submit()
            learned, rank = full["learned_attractiveness"], full["learned_reference_rank"]
            assert learned["status"] == "research_only" and learned["raw_score"] is not None
            assert rank["status"] == "available" and rank["n_reference"] == 2128
            assert rank["n_unique_subjects"] is None and rank["reference_unit"] == "image"
            assert rank["research_only"] and not learned["production_authorized"]
            assert len(calls) == 1
            metrics.update(primary_report_ready=True, face_detections_primary=len(calls),
                           inference_ms=learned["inference_ms"], primary_elapsed_s=round(time.perf_counter() - start, 3))
            # Identifier is a local navigation handle, not a measurement or model output.
            (args.out / "preview-id.txt").write_text(pid, encoding="utf-8")
            with patch.dict(os.environ, {"BEAUTYAI_RIDGE_ARTIFACT": str(args.out / "missing-model.json")}):
                fallback_id, fallback = submit()
            assert fallback["learned_attractiveness"]["unavailable_reason"] == "model_missing"
            assert fallback["learned_attractiveness"]["raw_score"] is None
            assert fallback["learned_reference_rank"]["percentile"] is None
            assert fallback["aesthetic_score"]["overall_score"] is not None
            assert len(calls) == 2
            assert c.delete(f"/api/passport/{fallback_id}").status_code == 200
            metrics.update(status="ok", missing_model_fallback=True, reference_n_images=2128,
                           production_authorized=False)
    except Exception as exc:  # noqa: BLE001 -- no sensitive error messages or per-person values in logs
        metrics["failure_type"] = type(exc).__name__
    finally:
        stop.set()
        monitor.join()
        from .runtime import peak_rss_mb

        metrics.update(peak_rss_mib=round(max(max(peaks, default=0) / 1024**2, peak_rss_mb() or 0), 2),
                       elapsed_s=round(time.perf_counter() - start, 3))
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "runtime.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metrics, indent=2))
    return 0 if metrics["status"] == "ok" else 3


if __name__ == "__main__":
    raise SystemExit(main())
