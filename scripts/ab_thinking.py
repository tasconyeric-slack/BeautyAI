"""S2 / D16: run the same photo sets with DeepSeek thinking disabled and enabled, then summarise both.

    python scripts/ab_thinking.py --sets data/p01 data/p02 data/p03 [--context examples/sample_context.json]

Needs DEEPSEEK_API_KEY. Spends roughly $0.02 per run (6 runs ≈ $0.12). Results go to runs/ab_<mode>_<set>/;
paste the printed summary into docs/ITERATION_LOG.md and keep the winner in config/models.yaml.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from aesthetic_passport.pipeline import PipelineError, find_photos, run_pipeline
from aesthetic_passport.providers import from_config

ROOT = Path(__file__).resolve().parents[1]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sets", nargs="+", type=Path, required=True)
    ap.add_argument("--context", type=Path, default=ROOT / "examples" / "sample_context.json")
    ap.add_argument("--out", type=Path, default=ROOT / "runs")
    args = ap.parse_args(argv)
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass
    if not os.environ.get("DEEPSEEK_API_KEY"):
        print("DEEPSEEK_API_KEY is not set — nothing to compare.", file=sys.stderr)
        return 2
    os.environ["ANALYSIS_PROVIDER"] = "deepseek"
    ctx = json.loads(args.context.read_text(encoding="utf-8"))
    user_context = ctx.get("user_context", ctx)

    groups: dict[str, list[Path]] = {}
    for mode in ("disabled", "enabled"):
        for s in args.sets:
            run_dir = args.out / f"ab_{mode}_{s.name}"
            if run_dir.exists():
                print(f"skip {run_dir} (exists)")
            else:
                provider = from_config("analysis", thinking=mode)
                try:
                    run_pipeline(find_photos(s), user_context, run_dir=run_dir, provider=provider,
                                 on_stage=lambda st, m=mode, n=s.name: print(f"[{m}] {n} · {st}"))
                except PipelineError as e:
                    print(f"[{mode}] {s.name} FAILED: {e.code}")
            groups.setdefault(mode, []).append(run_dir)

    for mode, dirs in groups.items():
        print(f"\n### thinking = {mode}")
        subprocess.run([sys.executable, str(ROOT / "scripts" / "summarize_runs.py"), *map(str, dirs)], check=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
