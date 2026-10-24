"""Summarise pipeline runs for docs/ITERATION_LOG.md (MVP_BRIEF §9 lightweight acceptance).

    python scripts/summarize_runs.py runs/ab_disabled_* [--pair runs/A runs/B ...]

Reads runs/<id>/calls.jsonl and runs/<id>/passport.json. Prints a markdown block with first-pass validity,
retries, failures, p50/p90 latency, cost per passport, a safety grep over the model's free text, and (with
--pair) the top-3 category overlap between two photo sets of the same person.
"""
from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def load_calls(run: Path, kind: str = "analysis") -> list[dict]:
    """Analysis attempts (default) or image-edit attempts (kind="image_edit") from runs/<id>/calls.jsonl."""
    f = run / "calls.jsonl"
    rows = [json.loads(line) for line in f.read_text(encoding="utf-8").splitlines()] if f.exists() else []
    return [r for r in rows if r.get("kind", "analysis") == kind]


def model_text(passport: dict) -> str:
    """All free text the model wrote (what the safety grep must cover)."""
    out: list[str] = []

    def walk(x):
        if isinstance(x, str):
            out.append(x)
        elif isinstance(x, dict):
            for k, v in x.items():
                if k not in ("target_description", "preserve"):   # English edit spec, checked separately by eye
                    walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    walk(passport["analysis"])
    return "\n".join(out)


def safety_hits(text: str, terms: dict[str, list[str]]) -> dict[str, list[str]]:
    low = text.lower()
    return {group: [t for t in ts if t.lower() in low] for group, ts in terms.items() if any(t.lower() in low for t in ts)}


def top3_categories(passport: dict) -> set[str]:
    recs = {r["id"]: r for r in passport["analysis"]["recommendations"]}
    return {recs[r]["category"] for r in passport["derived"]["top5"][:3]}


def pct(xs: list[float], q: float) -> float:
    xs = sorted(xs)
    return xs[min(len(xs) - 1, round(q * (len(xs) - 1)))]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("runs", nargs="*", type=Path)
    ap.add_argument("--pair", nargs=2, action="append", type=Path, default=[], metavar=("RUN_A", "RUN_B"))
    args = ap.parse_args(argv)
    terms = yaml.safe_load((ROOT / "config" / "rules.yaml").read_text(encoding="utf-8"))["safety_terms"]

    runs = [r for r in args.runs if (r / "calls.jsonl").exists()]
    first_pass, retries, failed, latencies, costs, unsafe = 0, 0, 0, [], [], []
    preview_ok, preview_n, preview_costs = 0, 0, []
    for r in runs:
        calls = load_calls(r)
        first_pass += bool(calls and calls[0]["valid"])
        retries += max(0, len(calls) - 1)
        ok = any(c["valid"] for c in calls)
        failed += not ok
        latencies.append(sum(c["latency_ms"] for c in calls))
        if all(c.get("cost_usd_est") is not None for c in calls):
            costs.append(sum(c["cost_usd_est"] for c in calls))
        for pv in load_calls(r, "image_edit"):
            preview_n += 1
            preview_ok += bool(pv["ok"])
            if pv.get("cost_usd_est") is not None:
                preview_costs.append(pv["cost_usd_est"])
        pp = r / "passport.json"
        if ok and pp.exists():
            hits = safety_hits(model_text(json.loads(pp.read_text(encoding="utf-8"))), terms)
            if hits:
                unsafe.append(f"{r.name}: {hits}")

    n = len(runs)
    print(f"runs: {n}")
    if n:
        print(f"first-pass validity: {first_pass}/{n}  · retries: {retries}  · failed after retry: {failed}")
        print(f"analysis latency p50/p90: {pct(latencies, .5) / 1000:.1f}s / {pct(latencies, .9) / 1000:.1f}s")
        if costs:
            print(f"cost per passport (analysis): mean ${statistics.mean(costs):.4f} · max ${max(costs):.4f}")
        print(f"safety grep: {'0 hits' if not unsafe else '; '.join(unsafe)}")
        if preview_n:
            per = (sum(costs) + sum(preview_costs)) / n if costs else None
            print(f"previews: {preview_ok}/{preview_n} succeeded"
                  + (f" · cost per passport incl. previews ${per:.4f}" if per is not None else ""))
    for a, b in args.pair:
        ca, cb = (top3_categories(json.loads((x / "passport.json").read_text(encoding="utf-8"))) for x in (a, b))
        print(f"stability {a.name} vs {b.name}: top-3 category overlap {len(ca & cb)} ({sorted(ca)} vs {sorted(cb)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
