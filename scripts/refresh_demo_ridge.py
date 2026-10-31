"""Refresh an approved synthetic sample using its stored real CV geometry and PhotoCheck pose.

No analysis API or training. Published input hashes are verified; existing analysis is preserved.
Run with APP_ENV=development BEAUTYAI_RIDGE_MODE=research and the private model/reference installed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

from aesthetic_passport.attractiveness.service import evaluate, load_config
from aesthetic_passport.schema_io import validate_passport

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--person", choices=["person-001", "person-002"], default="person-001")
    args = ap.parse_args()
    folder = ROOT / "examples/demo_cases" / args.person
    passport = json.loads((folder / "passport.json").read_text(encoding="utf-8"))
    provenance = json.loads((folder / "provenance.json").read_text(encoding="utf-8"))
    for asset in provenance["published_images"].values():
        path = ROOT / "web/public" / asset["path"].lstrip("/")
        if hashlib.sha256(path.read_bytes()).hexdigest() != asset["sha256"]:
            raise ValueError("published_sample_image_mismatch")
    # The snapshot contains real PhotoCheck pose and the complete D36 measurements.
    # `face` is only a presence guard in evaluate; inference reads the stored geometry, not pixels.
    photo = next(p for p in passport["input_quality"]["photos"] if p["photo_id"] == "front")
    front = SimpleNamespace(face=True, status=photo["status"], issues=photo["issues"],
                            yaw=photo["yaw"], pitch=photo["pitch"])
    prediction, rank = evaluate(front, passport["aesthetic_score"])
    if prediction["raw_score"] is None or rank["status"] != "available":
        raise ValueError("sample_ridge_or_reference_unavailable")
    from aesthetic_passport.scoring.reference import evaluate_geometry_reference

    passport["geometry_reference_rank"] = evaluate_geometry_reference(passport.get("aesthetic_score"))
    passport.update(schema_version="0.10", learned_attractiveness=prediction, learned_reference_rank=rank)
    if validate_passport(passport):
        raise ValueError("invalid_refreshed_passport")
    cfg = load_config()
    provenance["layers"]["learned_attractiveness"] = {
        "status": prediction["status"], "source": "frozen Ridge inference on original real CV snapshot",
        "model_id": prediction["model_id"], "artifact_sha256": cfg["artifact_sha256"],
        "reference_sha256": cfg["reference_sha256"], "distribution_version": rank["distribution_version"],
        "reference_unit": rank["reference_unit"], "research_only": rank["research_only"],
        "refreshed_at": datetime.now(UTC).isoformat(), "analysis_reused": True,
    }
    for name, value in (("passport", passport), ("provenance", provenance)):
        source = folder / f"{name}.json"
        source.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        shutil.copyfile(source, ROOT / "web/lib/fixtures/demo_cases" / f"{args.person}.{name}.json")
    print("Approved sample refreshed; analysis preserved; model/reference gates passed.")


if __name__ == "__main__":
    main()
