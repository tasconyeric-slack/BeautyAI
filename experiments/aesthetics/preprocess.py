"""Image loading, face check / crop, and the MEBeauty evaluation transform. numpy + Pillow only.

The model transform reproduces fbp_benchmark's evaluation preprocessing exactly (MEBeauty-Benchmark,
`pretrained.predict` / `FaceDataset` at eval time):

    torchvision Resize((256, 256))  → PIL bilinear resize to 256×256 (aspect NOT preserved)
    CenterCrop(224)                 → offset round((256 − 224) / 2) = 16 on both axes
    ToTensor + Normalize            → /255, ImageNet mean/std, CHW float32
    test-time horizontal flip       → done by the model adapter (mean of both passes)

torchvision's Resize on a PIL image delegates to `PIL.Image.resize(..., BILINEAR)`, so this is the same
computation, not an approximation. Nothing here writes to disk or logs image content (invariant 7).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, UnidentifiedImageError

RESIZE = 256
CROP = 224
MEAN = np.array((0.485, 0.456, 0.406), dtype=np.float32)
STD = np.array((0.229, 0.224, 0.225), dtype=np.float32)

# Statuses shared by predict and evaluate (one vocabulary, truthful by construction).
OK = "ok"
NO_FACE = "no_face"
UNREADABLE = "unreadable_image"
MODEL_UNAVAILABLE = "model_unavailable"
MODEL_INCOMPATIBLE = "model_incompatible"
DEPENDENCY_MISSING = "dependency_missing"
GEOMETRY_UNAVAILABLE = "geometry_unavailable"
ERROR = "error"


class ImageUnreadable(ValueError):
    pass


def load_rgb(source: str | Path | Image.Image) -> Image.Image:
    """Open a path or PIL image as RGB; raises ImageUnreadable on anything Pillow cannot decode."""
    if isinstance(source, Image.Image):
        return source.convert("RGB")
    p = Path(source)
    if not p.is_file():
        raise ImageUnreadable(f"not a file: {p.name}")
    try:
        try:
            import pillow_heif  # optional: iPhone HEIC, same as the production uploader

            pillow_heif.register_heif_opener()
        except ImportError:
            pass
        with Image.open(p) as im:
            im.load()
            from PIL import ImageOps

            return ImageOps.exif_transpose(im).convert("RGB")
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as e:
        raise ImageUnreadable(f"{type(e).__name__}") from e


def to_model_input(im: Image.Image) -> np.ndarray:
    """(3, 224, 224) float32, exactly the reference eval transform (without the flip)."""
    resized = im.convert("RGB").resize((RESIZE, RESIZE), Image.BILINEAR)
    top = left = round((RESIZE - CROP) / 2.0)
    arr = np.asarray(resized, dtype=np.float32)[top:top + CROP, left:left + CROP] / 255.0
    arr = (arr - MEAN) / STD
    return np.ascontiguousarray(arr.transpose(2, 0, 1), dtype=np.float32)


def square_crop_box(box: tuple[float, float, float, float], width: int, height: int,
                    margin: float) -> tuple[int, int, int, int]:
    """Square around a face box, expanded by `margin` × side on each side, shifted (then shrunk) to stay
    inside the image — no padding, so no artificial borders the model never saw in training."""
    x0, y0, x1, y1 = box
    side = max(x1 - x0, y1 - y0) * (1 + 2 * margin)
    side = min(side, width, height)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    left = min(max(cx - side / 2, 0.0), width - side)
    top = min(max(cy - side / 2, 0.0), height - side)
    s = math.floor(side)
    return round(left), round(top), round(left) + s, round(top) + s


@dataclass
class FaceInfo:
    """What the face check found. Landmarks stay in memory only."""

    checked: bool
    count: int = 0
    reason: str | None = None              # why the check could not run (e.g. MediaPipe models missing)
    landmarks: np.ndarray | None = None    # (478, 3) of the largest face
    yaw: float | None = None
    pitch: float | None = None
    box: tuple[int, int, int, int] | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def summary(self) -> dict[str, Any]:
        return {"checked": self.checked, "faces_detected": self.count if self.checked else None,
                "used": "largest" if self.count else None, "skipped_reason": self.reason,
                "yaw_deg": self.yaw, "pitch_deg": self.pitch}


def detect_face(im: Image.Image) -> FaceInfo:
    """MediaPipe FaceLandmarker via the production CV wrapper (read-only reuse of aesthetic_passport.cv)."""
    try:
        from aesthetic_passport import cv
    except ImportError as e:   # running outside the repo's environment
        return FaceInfo(checked=False, reason=f"aesthetic_passport.cv not importable ({type(e).__name__})")
    try:
        faces = cv.MODELS.faces(np.asarray(im.convert("RGB")))
    except (cv.CVUnavailable, OSError, RuntimeError) as e:   # OSError: libEGL/libGLES missing on the host
        return FaceInfo(checked=False, reason=f"MediaPipe unavailable: {type(e).__name__}: {str(e)[:160]}")
    if not faces:
        return FaceInfo(checked=True, count=0)
    main = faces[0]
    yaw, pitch, _roll = main.pose()
    return FaceInfo(checked=True, count=len(faces), landmarks=main.landmarks, yaw=yaw, pitch=pitch, box=main.box)


def crop_for_model(im: Image.Image, face: FaceInfo, mode: str, margin: float) -> tuple[Image.Image, dict[str, Any]]:
    """`none`: the image as-is (how dataset images are fed in the reference harness).
    `face`: square crop around the detected face — an approximation of the dataset framing for arbitrary
    portraits; it is NOT verified to match how MEBeauty images were cropped (see README)."""
    details: dict[str, Any] = {"crop_mode": mode, "input_size": [im.width, im.height]}
    if mode == "none":
        return im, details
    if mode != "face":
        raise ValueError(f"unknown crop mode {mode!r}")
    if face.box is None:
        raise ValueError("face crop requested without a detected face")
    box = square_crop_box(face.box, im.width, im.height, margin)
    details.update(crop_margin=margin, crop_size_px=box[2] - box[0],
                   framing_matches_training="unverified")
    return im.crop(box), details


def preprocessing_details(crop: dict[str, Any], flip: bool) -> dict[str, Any]:
    return {**crop, "resize": [RESIZE, RESIZE], "resize_filter": "PIL bilinear (aspect not preserved)",
            "center_crop": CROP, "normalize": {"mean": MEAN.tolist(), "std": STD.tolist()},
            "test_time_flip_average": flip, "reference": "fbp_benchmark.pretrained.predict (MEBeauty-Benchmark)"}


def geometry(face: FaceInfo) -> tuple[dict[str, Any] | None, list[float] | None]:
    """Production D36 geometric score (unchanged engine) + the flat feature vector for the ridge baseline.

    Returns (score summary, features). Features are None unless all four components were measured."""
    if face.landmarks is None:
        return None, None
    from aesthetic_passport.scoring import score_face

    s = score_face(face.landmarks, yaw=face.yaw, pitch=face.pitch)
    summary = {"overall_score": s["overall_score"], "status": s["status"], "scoring_version": s["scoring_version"],
               "quality_flags": s["quality_flags"]}
    comps = {c["key"]: c for c in s["components"]}
    if any(comps[k]["measured"] is None for k in ("symmetry", "thirds", "fifths", "golden_ratio")):
        return summary, None
    sym, th, fi, gr = (comps[k]["measured"] for k in ("symmetry", "thirds", "fifths", "golden_ratio"))
    feats = [sym["mean_residual"], *sym["features"].values(), *th["shares"], *fi["segments_eye_widths"],
             gr["ratio"], float(face.yaw or 0.0), float(face.pitch or 0.0)]
    return summary, [float(v) for v in feats]


GEOMETRY_FEATURES = ("symmetry.mean_residual", "symmetry.eyes", "symmetry.brows", "symmetry.nose", "symmetry.mouth",
                     "symmetry.jaw", "thirds.upper", "thirds.middle", "thirds.lower", "fifths.1", "fifths.2",
                     "fifths.3", "fifths.4", "fifths.5", "golden_ratio.ratio", "pose.yaw", "pose.pitch")
