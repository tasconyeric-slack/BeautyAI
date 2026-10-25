"""Live acceptance run for Issue #1: real hairstyle previews on an owner-approved synthetic demo portrait.

Drives the production job path (`api.previews.request_previews` → `run_preview_job`: crop → Qwen edit → registration →
masked composite → quality gate → retry seed → saved preview) against a throw-away store, and writes only operational
facts: status, attempts, model, provider latency, estimated cost, stage timings, sanitized diagnostics. It refuses to
run unless a real image provider is configured, so the result can never be fixture output.

Inputs are the published demo portraits and passports (`examples/demo_cases/`, `web/public/sample/demo/`): fully
AI-synthesized fictional adults, owner-approved (D41). Do not point this at a real person's photo without consent.

Writes under --out (default runs/live-hair-preview, git-ignored):
  summary.json                                   the facts above
  <passport id>/media/preview_hair_<target>.jpg  the labelled "AI 试看" result
  <passport id>/media/before_hair_<target>.jpg   the matched original crop
  <passport id>/calls.jsonl                      one sanitized line per attempt

Run: IMAGE_EDIT_PROVIDER=qwen PYTHONPATH=src python scripts/live_hair_preview.py --targets safe easy
Needs DASHSCOPE_API_KEY (and DASHSCOPE_BASE_URL for a workspace endpoint); about USD 0.03 per generated image.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from aesthetic_passport.api.previews import request_previews, run_preview_job
from aesthetic_passport.api.retention import media_dir
from aesthetic_passport.api.settings import Settings
from aesthetic_passport.api.store import Store
from aesthetic_passport.providers.image import resolve_image_provider

CALL_KEYS = ("attempt", "ok", "model", "latency_ms", "provider_latency_ms", "cost_usd_est", "error", "diag",
             "prompt_version")


def attempts_of(run_dir: Path, target: str) -> list[dict[str, Any]]:
    """The sanitized per-attempt call records for one hair target (no prompts, pixels or provider URLs)."""
    path = run_dir / "calls.jsonl"
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()] if path.exists() else []
    out = []
    for r in rows:
        if r.get("target") == f"hair:{target}":
            out.append({**{k: r.get(k) for k in CALL_KEYS},
                        "stages": {s["stage"]: s["elapsed_ms"] for s in r.get("trace") or []}})
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--person", default="person-001", choices=["person-001", "person-002"])
    ap.add_argument("--targets", nargs="+", default=["safe", "easy"], help="hair directions (safe | bold | easy | …)")
    ap.add_argument("--out", type=Path, default=ROOT / "runs" / "live-hair-preview")
    args = ap.parse_args()

    provider = resolve_image_provider()
    if provider != "qwen":
        print(f"refusing to run: image provider resolves to {provider!r}; set IMAGE_EDIT_PROVIDER=qwen with real "
              "credentials (a fake or disabled provider would not be a live check)", file=sys.stderr)
        return 2

    passport = json.loads((ROOT / "examples" / "demo_cases" / args.person / "passport.json").read_text("utf-8"))
    pid = passport["passport_id"]
    shutil.rmtree(args.out, ignore_errors=True)
    settings = Settings(runs_dir=args.out, run_jobs_inline=True)
    store = Store(settings.db_path)
    store.create(pid, None, settings.media_ttl_hours)
    store.finish(pid, passport)
    store.set_paid(pid)                       # lifts the free-preview quota; targets are still validated
    media = media_dir(args.out, pid)
    media.mkdir(parents=True)
    shutil.copyfile(ROOT / "web" / "public" / "sample" / "demo" / args.person / "front.jpg", media / "front.jpg")

    results = []
    for target in args.targets:
        _states, start = request_previews(settings, store, store.get(pid), "hair", [target])
        status = run_preview_job(settings, store, pid, "hair", target) if start else "not_started"
        row = next((p for p in store.previews(pid) if p["target_id"] == target), {})
        calls = attempts_of(args.out / pid, target)
        results.append({"target": target, "status": status, "attempts": row.get("attempts"),
                        "image_model": row.get("image_model"), "user_error": row.get("error"),
                        "output": f"{pid}/media/preview_hair_{target}.jpg" if status == "succeeded" else None,
                        "calls": calls})
        ok = [c for c in calls if c["ok"]]
        print(f"hair:{target}  {status}  attempts={row.get('attempts')}  model={row.get('image_model')}  "
              f"provider_latency_ms={ok[-1]['provider_latency_ms'] if ok else None}  "
              f"cost_usd_est={sum(c['cost_usd_est'] or 0 for c in ok) if ok else None}  error={row.get('error')}")
    (args.out / "summary.json").write_text(json.dumps({"person": args.person, "provider": provider, "results": results},
                                                      ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0 if all(r["status"] == "succeeded" for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
