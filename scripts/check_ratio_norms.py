"""Check our 12 reference-ratio definitions against the published quantiles on a folder of consented front photos.

    PYTHONPATH=src python scripts/check_ratio_norms.py data/ratio_check/

Prints only cohort aggregates (n, our median, published p25 / p50 / p75 and whether our median falls inside the
published IQR). Nothing per photo is printed or written. A ratio whose median sits outside the IQR on a reasonable
sample (≥ 30 faces) probably uses a different landmark definition: fix it or drop that rail (docs/scoring/
REFERENCE_DISTRIBUTIONS.md, "Landmark match").
"""
from __future__ import annotations

import statistics
import sys
from pathlib import Path

from PIL import Image

from aesthetic_passport import cv
from aesthetic_passport.percentiles import compute_reference_ratios, load_reference

EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def main(folder: str) -> int:
    vals: dict[str, list[float]] = {}
    n = 0
    for path in sorted(Path(folder).iterdir()):
        if path.suffix.lower() not in EXTS:
            continue
        rgb = cv.as_rgb(Image.open(path).convert("RGB"))
        faces = cv.MODELS.faces(rgb)
        if not faces:
            continue
        yaw, pitch, _ = faces[0].pose()
        n += 1
        for k, r in compute_reference_ratios(faces[0].landmarks, yaw=yaw, pitch=pitch).items():
            if r["value"] is not None:
                vals.setdefault(k, []).append(r["value"])
    print(f"faces measured: {n}")
    print(f"{'ratio':<20}{'n':>5}{'ours p50':>10}{'pub p25':>9}{'pub p50':>9}{'pub p75':>9}  inside IQR")
    for m in load_reference()["ratio_norms"]["metrics"]:
        xs = vals.get(m["id"], [])
        q = dict(zip(load_reference()["ratio_norms"]["quantile_levels"], m["quantiles"]))
        med = statistics.median(xs) if xs else float("nan")
        inside = "yes" if xs and q[25] <= med <= q[75] else "NO" if xs else "-"
        print(f"{m['id']:<20}{len(xs):>5}{med:>10.3f}{q[25]:>9}{q[50]:>9}{q[75]:>9}  {inside}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
