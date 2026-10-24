"""Draw every configured anchor landmark (and candidate alternatives) on a photo, for visual verification.

    python scripts/debug_landmarks.py data/test_faces/portrait.jpg --out runs/debug/landmarks.jpg

Writes a crop around the face, upscaled, with labelled points and the measured spans. Open the result and check
each name sits where it says before trusting any ratio (MVP_BRIEF §6.2). Output stays under runs/ (git-ignored).
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
import yaml

from aesthetic_passport.cv import FACE_OVAL, MODELS
from aesthetic_passport.imaging import open_rgb

ROOT = Path(__file__).resolve().parents[1]
# Alternatives under comparison: haircut-vision-advisor uses forehead 103/332; the repo config started at 54/284.
CANDIDATES = {"alt_forehead_left_103": 103, "alt_forehead_right_332": 332, "alt_forehead_left_54": 54,
              "alt_forehead_right_284": 284, "alt_forehead_left_67": 67, "alt_forehead_right_297": 297}
SPANS = [("forehead_left", "forehead_right"), ("cheek_left", "cheek_right"), ("jaw_left", "jaw_right"),
         ("forehead_top", "chin"), ("glabella", "subnasale")]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("photo", type=Path)
    ap.add_argument("--out", type=Path, default=ROOT / "runs" / "debug" / "landmarks.jpg")
    args = ap.parse_args(argv)

    cfg = yaml.safe_load((ROOT / "config" / "qc.yaml").read_text(encoding="utf-8"))["anchors"]["landmarks"]
    rgb = np.asarray(open_rgb(args.photo))
    faces = MODELS.faces(rgb)
    if not faces:
        print("no face found")
        return 1
    f = faces[0]
    x0, y0, x1, y1 = f.box
    pad = int(0.25 * (x1 - x0))
    x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), min(rgb.shape[1], x1 + pad), min(rgb.shape[0], y1 + pad)
    scale = 1100 / max(x1 - x0, y1 - y0)
    img = cv2.resize(cv2.cvtColor(rgb[y0:y1, x0:x1], cv2.COLOR_RGB2BGR), None, fx=scale, fy=scale)

    def p(i: int) -> tuple[int, int]:
        x, y = f.landmarks[i, :2]
        return int((x - x0) * scale), int((y - y0) * scale)

    oval = np.array([p(i) for i in FACE_OVAL], np.int32)
    cv2.polylines(img, [oval], True, (200, 200, 200), 1, cv2.LINE_AA)
    for a, b in SPANS:
        cv2.line(img, p(cfg[a]), p(cfg[b]), (0, 200, 255), 2, cv2.LINE_AA)
    for name, i in {**cfg, **CANDIDATES}.items():
        alt = name.startswith("alt_")
        color = (255, 120, 0) if alt else (0, 0, 255)
        cv2.circle(img, p(i), 5 if not alt else 4, color, -1, cv2.LINE_AA)
        label = f"{name.replace('alt_', '')}" if alt else f"{name} ({i})"
        cv2.putText(img, label, (p(i)[0] + 7, p(i)[1] - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 3, cv2.LINE_AA)
        cv2.putText(img, label, (p(i)[0] + 7, p(i)[1] - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(args.out), img)
    yaw, pitch, roll = f.pose()
    print(f"wrote {args.out}  yaw={yaw} pitch={pitch} roll={roll}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
