"""Rescore the SCUT held-out photos with unmodified D36; write only an aggregate."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from aesthetic_passport.attractiveness_rank.ingest import build_image_reference
from aesthetic_passport.scoring import score_face
from aesthetic_passport.scoring.reference import geometry_identity

from . import preprocess as pp
from .datasets import load_scut


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists():
        parser.error("refusing to overwrite a versioned reference")
    split = args.root / "train_test_files/split_of_60%training and 40%testing"
    dataset = load_scut(args.root / "Images", train_file=split / "train.txt", test_file=split / "test.txt")
    dataset.check_disjoint()
    if len(dataset.test) != 2200:
        raise ValueError("test_split_incomplete")
    scores, hashes = [], set()
    for item in dataset.test:
        source = Path(item.load())
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        if digest in hashes:
            continue
        hashes.add(digest)
        face = pp.detect_face(pp.load_rgb(source))
        if face.count != 1 or face.landmarks is None:
            continue
        result = score_face(face.landmarks, yaw=face.yaw, pitch=face.pitch)
        if result["status"] == "full":
            scores.append(result["overall_score"])
    manifest = {
        "cohort_id": "scut-heldout-d36-geometry", "cohort_label": "SCUT 几何分参考照片样本",
        "distribution_version": "scut-heldout-d36-full-ecdf-v1", "reference_unit": "image",
        "definition": "Full D36 QC photos from official 2200 held-out images; identities/ages unverified",
        "sampling": "convenience", "identity": geometry_identity(), "native_score_bounds": [0, 100],
        "provenance": {"data_kind": "research_only",
            "source_reference": "https://github.com/HCIILAB/SCUT-FBP5500-Database-Release",
            "license_id": "SCUT-noncommercial-research",
            "permission_reference": "owner-selected-option-B-2026-10-31",
            "ranking_authorized": True, "research_authorized": True, "aggregate_retention_authorized": True,
            "model_production_authorized": False, "adults_confirmed": False},
        "qc": {"status": "passed", "deduplication_version": "image-bytes-sha256-v1-not-identity-dedup",
            "evidence_reference": "D36-full-only; official-test-split-sha256:" +
            hashlib.sha256((split / "test.txt").read_bytes()).hexdigest()},
    }
    registry = build_image_reference(manifest, scores)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(json.dumps(registry, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    # No per-photo scores, identifiers, landmarks, or progress logs.


if __name__ == "__main__":
    main()
