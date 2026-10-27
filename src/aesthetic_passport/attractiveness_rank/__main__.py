"""Import local predictions without logging person records or input paths."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .ingest import build_reference
from .reference import ReferenceDataError


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--predictions", required=True, type=Path, help="Private JSONL, never commit")
    parser.add_argument("--out", required=True, type=Path, help="New aggregate registry; never overwrites")
    args = parser.parse_args()
    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        with args.predictions.open(encoding="utf-8") as source:
            registry = build_reference(manifest, (json.loads(line) for line in source))
        content = json.dumps(registry, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
        with args.out.open("x", encoding="utf-8") as output:
            output.write(content)
    except ReferenceDataError as exc:
        parser.exit(2, f"Reference import rejected: {exc}\n")
    except (OSError, ValueError, TypeError):
        parser.exit(2, "Reference import rejected: invalid_or_unreadable_input_or_output\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
