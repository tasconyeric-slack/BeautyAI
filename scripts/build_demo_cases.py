"""Build the pipeline-backed sample reports (Issue #14) from owner-approved synthetic portraits.

Reads examples/demo_cases/manifest.json, checks every master image against its approved sha256, then runs the real
production pipeline (`run_pipeline`: MediaPipe QC → anchors → measurements → D36 score → DeepSeek quick + full
analysis → rules → validated passport) for each case. It refuses to run on the fake analysis provider or on stub QC,
so a snapshot can never be fixture output presented as real.

Writes, per case (all versioned by the manifest's snapshot_version):
  examples/demo_cases/<person>/passport.json      the validated passport, exactly as the pipeline assembled it
  examples/demo_cases/<person>/geometry.json      the pipeline's own geometry export (polygons + measurement points)
  examples/demo_cases/<person>/provenance.json    inputs, published assets, CV / scoring / model versions, call stats
  web/lib/fixtures/demo_cases/<person>.{passport,geometry}.json   byte-identical copies the web app imports
  web/public/sample/demo/<person>/{front,profile90}.jpg          published copies of the approved masters (same
                                                                  pixel size, metadata stripped; masters untouched)
The glasses reference photo is checked against its hash but never measured, sent to the model or published.
Image previews are generated only when a real image provider is configured; otherwise provenance says unavailable.

Run: ANALYSIS_PROVIDER=deepseek PYTHONPATH=src python scripts/build_demo_cases.py --assets data/demo-assets
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

MANIFEST = ROOT / "examples" / "demo_cases" / "manifest.json"
OUT = ROOT / "examples" / "demo_cases"
WEB_FIX = ROOT / "web" / "lib" / "fixtures" / "demo_cases"
WEB_PUB = ROOT / "web" / "public" / "sample" / "demo"
PIPELINE_ROLES = ("front", "profile90")       # the glasses photo is a styling reference only
JPEG_QUALITY = 92


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dump(name: str, data: Any) -> str:
    """Geometry stays compact, exactly as the pipeline writes it; passport and provenance are indented for review."""
    if name == "geometry":
        return json.dumps(data, separators=(",", ":")) + "\n"
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def git_head() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def publish_image(src: Path, dst: Path) -> dict[str, Any]:
    """Same pixel size, RGB JPEG, no metadata (the masters are opaque RGBA PNGs and stay untouched)."""
    from PIL import Image

    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        size = im.size
        im.convert("RGB").save(dst, "JPEG", quality=JPEG_QUALITY, optimize=True)
    return {"path": f"/{dst.relative_to(ROOT / 'web' / 'public').as_posix()}", "width": size[0], "height": size[1],
            "sha256": sha256(dst), "encoding": f"jpeg q{JPEG_QUALITY}, metadata stripped"}


def call_stats(run_dir: Path) -> list[dict[str, Any]]:
    """Per-attempt metrics from runs/<id>/calls.jsonl (already free of image data and raw model output)."""
    p = run_dir / "calls.jsonl"
    if not p.exists():
        return []
    keep = ("kind", "attempt", "provider", "model", "latency_ms", "input_tokens", "output_tokens", "stop_reason",
            "cost_usd_est", "valid")
    rows = [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]
    return [{**{k: r[k] for k in keep if k in r}, "validation_errors": len(r.get("errors") or [])} for r in rows]


def cv_versions() -> dict[str, Any]:
    import mediapipe

    from aesthetic_passport.cv import FACE_MODEL, SEG_MODEL, models_dir

    d = models_dir()
    return {"engine": f"mediapipe {mediapipe.__version__}",
            "models": {name: sha256(d / name) for name in (FACE_MODEL, SEG_MODEL) if (d / name).exists()}}


def require_real_providers() -> Any:
    from aesthetic_passport.pipeline import qc_mode
    from aesthetic_passport.providers import from_config

    if qc_mode() != "real":
        sys.exit("QC_MODE must be real: stub QC would invent passing checks")
    provider = from_config("analysis")
    if provider.name == "fake":
        sys.exit("analysis provider resolved to `fake`; set ANALYSIS_PROVIDER=deepseek with a real credential")
    return provider


def image_provider_state() -> dict[str, Any]:
    from aesthetic_passport.providers.image import resolve_image_provider

    try:
        name = resolve_image_provider()
    except Exception as e:  # noqa: BLE001 — only reported, never fatal: previews are optional for a sample
        return {"status": "unavailable", "reason": type(e).__name__}
    if name in ("fake", "none"):
        return {"status": "unavailable", "reason": "no real image-edit provider configured (DASHSCOPE_API_KEY)"}
    return {"status": "not_requested", "provider": name,
            "reason": "previews need a paid Look selection; this build generates none"}


def build_case(case: dict[str, Any], assets: Path, provider: Any, manifest: dict[str, Any]) -> dict[str, Any]:
    from aesthetic_passport.pipeline import run_pipeline
    from aesthetic_passport.schema_io import validate_passport

    pid = case["person_id"]
    inputs: dict[str, Any] = {}
    for role, spec in case["photos"].items():
        path = assets / spec["path"]
        got = sha256(path)
        if got != spec["sha256"]:
            sys.exit(f"{pid}/{role}: sha256 mismatch ({got}); refusing to build from an unapproved image")
        inputs[role] = {"file": spec["path"], "sha256": got, "use": spec["use"], "sent_to_pipeline": role in PIPELINE_ROLES}

    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    run_dir = ROOT / "runs" / f"demo_{pid}_{stamp}"
    photos = {r: assets / case["photos"][r]["path"] for r in PIPELINE_ROLES}
    passport = run_pipeline(photos, case["user_context"], run_dir=run_dir, passport_id=case["sample_id"],
                            provider=provider, media_dir=run_dir / "media")
    errs = validate_passport(passport)
    if errs:
        sys.exit(f"{pid}: assembled passport failed validation: {errs[:5]}")
    geometry = json.loads((run_dir / "media" / "geometry.json").read_text(encoding="utf-8"))

    side = next((v for v in passport.get("measurement_profile", {}).get("views", []) if v.get("role") == "profile90"), None)
    published = {"front": publish_image(photos["front"], WEB_PUB / pid / "front.jpg")}
    side_ok = bool(side) and side.get("status") == "measured"
    if side_ok:
        published["profile90"] = publish_image(photos["profile90"], WEB_PUB / pid / "profile90.jpg")
    else:
        (WEB_PUB / pid / "profile90.jpg").unlink(missing_ok=True)

    meta = passport["meta"]
    score = passport.get("aesthetic_score") or {}
    pct = passport.get("reference_percentiles") or {}
    provenance = {
        "snapshot_version": manifest["snapshot_version"],
        "person_id": pid,
        "sample_id": case["sample_id"],
        "display_label": case["display_label"],
        "subject": "AI-synthesized fictional adult; not a photograph of a real person",
        "asset_source": manifest["asset_source"],
        "built_at": passport["created_at"],
        "code_commit": git_head(),
        "inputs": inputs,
        "published_images": published,
        "layers": {
            "cv": {"source": "real", "qc_mode": "real", **cv_versions(),
                   "side_view": {"qc_accepted": side_ok, "status": (side or {}).get("status"),
                                 "reason": (side or {}).get("reason")}},
            "scoring": {"source": "real (deterministic D36 geometric reference, front landmarks)",
                        **{k: score.get(k) for k in ("scoring_version", "status", "overall_score", "confidence")}},
            "percentiles": {"source": "real (D37, published self-selected reference cohort; not a population rank)",
                            **{k: pct.get(k) for k in ("engine_version", "reference_distribution_version")}},
            "analysis": {"source": "real", "provider": provider.name, "model": meta["analysis_model"],
                         "prompt_version": meta["prompt_version"], "retries": meta["retries"],
                         "latency_ms": meta["latency_ms"], "cost_usd_est": meta["cost_usd_est"],
                         "quick": meta.get("quick"), "calls": call_stats(run_dir)},
            "rules": {"source": "real (rules layer, config/rules.yaml)", "schema_version": passport["schema_version"]},
            "previews": image_provider_state(),
            "learned_attractiveness": {"status": "not_included",
                                       "reason": "Issue #13 licence gate; no learned-attractiveness model is used"},
        },
        "user_context_note": "styling context is a fictional, user-declared profile from the demo manifest",
    }

    dst = OUT / pid
    dst.mkdir(parents=True, exist_ok=True)
    WEB_FIX.mkdir(parents=True, exist_ok=True)
    for name, data in (("passport", passport), ("geometry", geometry), ("provenance", provenance)):
        (dst / f"{name}.json").write_text(dump(name, data), encoding="utf-8")
    for name in ("passport", "geometry", "provenance"):
        shutil.copyfile(dst / f"{name}.json", WEB_FIX / f"{pid}.{name}.json")
    return provenance


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--assets", type=Path, default=ROOT / "data" / "demo-assets")
    ap.add_argument("--only", help="build one person_id")
    args = ap.parse_args(argv)
    os.environ.setdefault("QC_MODE", "real")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    provider = require_real_providers()
    for case in manifest["cases"]:
        if args.only and case["person_id"] != args.only:
            continue
        prov = build_case(case, args.assets, provider, manifest)
        a = prov["layers"]
        print(f"{case['person_id']}: score={a['scoring']['status']} side={a['cv']['side_view']} "
              f"model={a['analysis']['model']} retries={a['analysis']['retries']} previews={a['previews']['status']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
