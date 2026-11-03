"""Print aggregate score-to-rank diagnostics, never run portrait inference."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from aesthetic_passport.attractiveness.service import display_score, load_config
from aesthetic_passport.attractiveness_rank.continuous import continuous_rank
from aesthetic_passport.attractiveness_rank.engine import DEFAULT_POLICY as policy
from aesthetic_passport.attractiveness_rank.reference import validate_registry


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", type=Path)
    args = parser.parse_args()
    cfg = load_config()
    content = args.reference.read_bytes()
    if hashlib.sha256(content).hexdigest() != cfg["reference_sha256"]:
        raise ValueError("reference_hash_mismatch")
    registry = json.loads(content)
    validate_registry(registry)
    cohort = next(c for c in registry["cohorts"] if c["cohort_id"] == cfg["reference_id"]
                  and c["distribution_version"] == cfg["reference_version"])
    points = cohort["distribution"]
    n = sum(p["count"] for p in points)
    print("| Native score | Display /10 | Empirical Top % | Continuous Top % | Estimated |")
    print("|---|---|---|---|---|")
    for score in [3, 3.5, 3.65, 3.85, 4, points[-1]["score"], 4.3, 4.5, 5]:
        empirical = 100 * sum(p["count"] * (1 if p["score"] > score else .5 if p["score"] == score else 0)
                              for p in points) / n
        top, estimated = continuous_rank(points, score, policy.tail_fit_low, policy.tail_fit_high,
                                         policy.tail_join_quantile)
        display = display_score(score, cfg["native_bounds"], cfg["display_bounds"])
        print(f"| {score:.5f} | {display:.3f} | {empirical:.5g} | {top:.6g} | {estimated} |")


if __name__ == "__main__":
    main()
