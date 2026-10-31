"""Predict the official SCUT held-out images with frozen Ridge; no fitting or labels used."""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

from aesthetic_passport.attractiveness.artifact import predict_features
from aesthetic_passport.attractiveness.service import identity, load_config, verified_artifact
from aesthetic_passport.attractiveness_rank.ingest import build_image_reference

from .datasets import load_scut
from .evaluate import _process


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", type=Path, default=Path("data/scut-fbp5500/SCUT-FBP5500_v2"))
    ap.add_argument("--out", type=Path, default=Path("models/aesthetics/geometry-ridge/scut-heldout-reference-v1.json"))
    args = ap.parse_args()
    if args.out.exists():
        ap.error("refusing to overwrite a versioned reference")
    cfg = load_config()
    artifact = verified_artifact(cfg)
    split = args.root / "train_test_files/split_of_60%training and 40%testing"
    if hashlib.sha256((split / "test.txt").read_bytes()).hexdigest() != artifact["provenance"]["test_split_sha256"]:
        raise ValueError("test_split_mismatch")
    ds = load_scut(args.root / "Images", train_file=split / "train.txt", test_file=split / "test.txt")
    ds.check_disjoint()
    if len(ds.test) != 2200:
        raise ValueError("test_split_incomplete")
    records = _process(ds.test, want_geometry=True, want_model=False, model=None, crop="none",
                       margin=0.25, flip=True, batch=8, timers=Counter())
    valid = [r for r in records if r.features is not None]
    if len(valid) != 2128:
        raise ValueError("feature_coverage_drift")
    # Byte duplicates can be checked without inferring identities or demographic attributes.
    hashes = {hashlib.sha256(Path(r.item.load()).read_bytes()).hexdigest() for r in valid}
    if len(hashes) != len(valid):
        raise ValueError("duplicate_images_require_new_version")
    manifest = {"cohort_id": cfg["reference_id"], "cohort_label": "SCUT 留出测试照片（研究样本）",
                    "distribution_version": cfg["reference_version"], "reference_unit": "image",
                    "definition": "2128 evaluable photos of the official held-out 2200; unique identities and ages unverified",
                    "sampling": "convenience", "identity": identity(cfg), "native_score_bounds": cfg["native_bounds"],
                    "provenance": {"data_kind": "research_only", "source_reference": "https://github.com/HCIILAB/SCUT-FBP5500-Database-Release",
                                    "license_id": "SCUT-noncommercial-research", "permission_reference": cfg["research_permission"],
                                    "ranking_authorized": True, "research_authorized": True, "aggregate_retention_authorized": True,
                                    "model_production_authorized": False, "adults_confirmed": False},
                    "qc": {"status": "passed", "evidence_reference": "official-split-hash-in-model-artifact; 2128/2200; byte-dedup-pass",
                            "deduplication_version": "image-bytes-sha256-v1-not-identity-dedup"}}
    ref = build_image_reference(manifest, (predict_features(r.features, artifact) for r in valid))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(ref, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    with args.out.open("x", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print(json.dumps({"status": "ok", "n_images": len(valid), "n_unique_subjects": None,
                          "reference_sha256": hashlib.sha256(content.encode()).hexdigest(),
                          "model_sha256": cfg["artifact_sha256"], "research_only": True}))


if __name__ == "__main__":
    main()
