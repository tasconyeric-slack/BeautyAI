"""Privately issue single-use BeautyAI unlock codes against the SAME persistent DB as the API.

Example (run in the API environment, where RUNS_DIR points to the production persistent disk):
    python scripts/generate_invite_codes.py --count 100 --ttl-hours 24 --output /secure/invites-20261031.csv

The CSV contains bearer secrets. Keep it outside the repo and never publish it.
"""
from __future__ import annotations

import argparse
import csv
import os
from pathlib import Path

from aesthetic_passport.api.settings import Settings
from aesthetic_passport.api.store import Store


def main() -> None:
    parser = argparse.ArgumentParser(description="Create one-time premium passport unlock codes")
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument("--ttl-hours", type=int, default=24)
    parser.add_argument("--output", type=Path, required=True, help="Private CSV destination (must not exist)")
    args = parser.parse_args()
    if not 1 <= args.count <= 5000 or not 1 <= args.ttl_hours <= 8760:
        parser.error("count must be 1..5000 and ttl-hours must be 1..8760")
    path = args.output.resolve()
    if path.exists():
        parser.error("output file already exists: refusing overwrite")

    store = Store(Settings.from_env().db_path)
    batch_id, codes, expires_at = store.issue_invite_codes(args.count, args.ttl_hours)
    # O_EXCL prevents clobber; 0600 limits access to the local account.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["batch_id", "invitation_code", "expires_at_utc", "status"])
        writer.writerows((batch_id, code, expires_at, "unused") for code in codes)
    print(f"Created batch {batch_id}: {len(codes)} codes, expire at {expires_at}. CSV saved privately to {path}")


if __name__ == "__main__":
    main()
