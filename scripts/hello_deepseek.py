"""W1-T1 smoke test: one vision call to the production model with a tiny JSON contract.

    python scripts/hello_deepseek.py --photo data/p01/front.jpg

Prints the parsed JSON plus model, tokens, latency, stop reason and estimated cost.
Does not save the photo or the output anywhere.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from aesthetic_passport.providers import ImageInput, ProviderError, from_config, load_models_config

SYSTEM = "You are a connectivity check for a vision pipeline. Describe only what is visible. Reply in JSON."
USER = "Return a JSON object describing the photo."
SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["face_count", "framing", "lighting"],
    "properties": {
        "face_count": {"type": "integer", "minimum": 0},
        "framing": {"type": "string", "enum": ["head_only", "head_shoulders", "half_body", "full_body", "no_person"]},
        "lighting": {"type": "string", "enum": ["dim", "even", "harsh", "backlit"]},
    },
}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--photo", required=True, type=Path)
    args = ap.parse_args(argv)

    spec = load_models_config()["production"]["analysis"]
    image = ImageInput.from_path("front", args.photo, max_long_side=spec["image_max_long_side"],
                                 jpeg_quality=spec.get("image_jpeg_quality", 90))
    try:
        provider = from_config()
        result = provider.analyze([image], SYSTEM, USER, SCHEMA)
    except ProviderError as e:
        print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print(json.dumps(result.data, ensure_ascii=False, indent=2) if result.data else result.raw_text)
    print(json.dumps(result.log_record(), ensure_ascii=False))
    return 0 if result.data is not None else 2


if __name__ == "__main__":
    sys.exit(main())
