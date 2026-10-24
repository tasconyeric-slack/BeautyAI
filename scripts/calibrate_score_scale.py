"""Calibrate the AI 面部美学参考分 scale against the published reference cohort (Issue #41).

    PYTHONPATH=src python scripts/calibrate_score_scale.py data/score_calibration/

Runs real CV + the production scorer (#31) on every front photo in the folder (consented scans only) and prints
aggregates only: n, the compatibility verdict against the published bins / median / top shares, our component medians
next to the publisher's, and — when the sample is large enough — crosswalk knots to paste into config/percentiles.yaml
(`score_mappings.<scoring_version>`, with the date, n and verdict in `checked`). Nothing per photo is printed or saved.
Only `full` scores count: limited scores are never ranked, so they must not shape the mapping either.
"""
from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

from PIL import Image

from aesthetic_passport import cv
from aesthetic_passport.percentiles import check_scale_compatibility, fit_crosswalk, load_reference
from aesthetic_passport.scoring import COMPONENTS, score_face

EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def main(folder: str) -> int:
    overall: list[float] = []
    comps: dict[str, list[float]] = {k: [] for k in COMPONENTS}
    version, skipped = None, 0
    for path in sorted(Path(folder).iterdir()):
        if path.suffix.lower() not in EXTS:
            continue
        faces = cv.MODELS.faces(cv.as_rgb(Image.open(path).convert("RGB")))
        if not faces:
            skipped += 1
            continue
        yaw, pitch, _ = faces[0].pose()
        s = score_face(faces[0].landmarks, yaw=yaw, pitch=pitch)
        if s["status"] != "full":
            skipped += 1
            continue
        version = s["scoring_version"]
        overall.append(s["overall_score"])
        for k in COMPONENTS:
            comps[k].append(s["component_scores"][k])
    ref = load_reference()["overall_score"]
    report = check_scale_compatibility(overall)
    print(f"scoring_version: {version} · full scores: {len(overall)} · skipped (no face / not full): {skipped}")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    pub = ref.get("component_medians", {})
    if overall:
        print("component medians (ours vs published):")
        for k in COMPONENTS:
            print(f"  {k:<13}{statistics.median(comps[k]):>7.1f}{pub.get('values', {}).get(k, float('nan')):>7}")
    if report["verdict"] == "needs_crosswalk":
        print("crosswalk knots:", json.dumps(fit_crosswalk(overall)))
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
