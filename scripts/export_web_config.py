"""Export the parts of config/*.yaml the web report displays (style prototypes, label names, the face atlas).

Run by `make types`. Keeps config as the single source of truth instead of copying numbers into TypeScript.
"""
from __future__ import annotations

import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    rules = yaml.safe_load((ROOT / "config" / "rules.yaml").read_text(encoding="utf-8"))
    out = {
        "rules_version": rules["rules_version"],
        "style_prototypes": rules["style_labels"]["prototypes"],
        "style_names": rules["style_labels"]["names_zh"],
        "face_common_ranges": rules["face_common_ranges"],
    }
    write(ROOT / "web" / "lib" / "generated" / "rules-config.json", out)
    write(ROOT / "web" / "lib" / "generated" / "face-atlas.json", face_atlas(rules))


def face_atlas(rules: dict) -> dict:
    """config/face_atlas.yaml (D39) plus the rules layer's advice areas (area → page, label) the cues link to."""
    atlas = yaml.safe_load((ROOT / "config" / "face_atlas.yaml").read_text(encoding="utf-8"))
    areas = rules["measurement_insights"]["areas"]
    return {**atlas, "areas": {k: {"page": v["page"], "label_zh": v["label_zh"]} for k, v in areas.items()}}


def write(dest: Path, data: dict) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {dest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
