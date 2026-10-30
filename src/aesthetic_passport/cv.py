"""MediaPipe wrappers shared by QC, anchors, color sampling and preview masks.

Models (Apache 2.0) live in models/ (`make models`), overridable with MODELS_DIR. They are loaded lazily once per
process and guarded by a lock: MediaPipe task objects are not safe to call from several threads at once.
"""
from __future__ import annotations

import atexit
import math
import os
import threading
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
FACE_MODEL = "face_landmarker.task"
SEG_MODEL = "selfie_multiclass_256x256.tflite"

# selfie_multiclass_256x256 categories
SEG_BACKGROUND, SEG_HAIR, SEG_BODY_SKIN, SEG_FACE_SKIN, SEG_CLOTHES, SEG_OTHERS = range(6)

# MediaPipe FaceMesh face-oval contour, in drawing order (from FaceLandmarksConnections.FACE_OVAL).
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
             176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
# Point sets from mediapipe FaceLandmarksConnections. LEFT/RIGHT are the subject's sides (LEFT = image right).
# They are not single closed contours, so masks use their convex hull.
LEFT_EYE = [249, 263, 362, 373, 374, 380, 381, 382, 384, 385, 386, 387, 388, 390, 398, 466]
RIGHT_EYE = [7, 33, 133, 144, 145, 153, 154, 155, 157, 158, 159, 160, 161, 163, 173, 246]
LEFT_BROW = [276, 282, 283, 285, 293, 295, 296, 300, 334, 336]
RIGHT_BROW = [46, 52, 53, 55, 63, 65, 66, 70, 105, 107]
LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
LIPS_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]
LEFT_IRIS = [474, 475, 476, 477]   # centre 473
RIGHT_IRIS = [469, 470, 471, 472]  # centre 468


class CVUnavailable(RuntimeError):
    """Model files missing or MediaPipe not importable (run `make models`)."""


def models_dir() -> Path:
    return Path(os.environ.get("MODELS_DIR", ROOT / "models"))


@dataclass
class Face:
    landmarks: np.ndarray        # (478, 3) — x, y in pixels; z in MediaPipe's relative units
    matrix: np.ndarray | None    # 4×4 facial transformation matrix

    @cached_property
    def box(self) -> tuple[int, int, int, int]:
        x0, y0 = self.landmarks[:, :2].min(axis=0)
        x1, y1 = self.landmarks[:, :2].max(axis=0)
        return int(x0), int(y0), math.ceil(x1), math.ceil(y1)

    @property
    def box_area(self) -> int:
        x0, y0, x1, y1 = self.box
        return max(0, x1 - x0) * max(0, y1 - y0)

    @property
    def box_short_side(self) -> int:
        x0, y0, x1, y1 = self.box
        return min(x1 - x0, y1 - y0)

    def pts(self, idx: list[int] | int) -> np.ndarray:
        return self.landmarks[idx, :2]

    def pose(self) -> tuple[float | None, float | None, float | None]:
        """(yaw, pitch, roll) in degrees from the facial transformation matrix."""
        if self.matrix is None:
            return None, None, None
        r = self.matrix[:3, :3]
        pitch = math.degrees(math.atan2(r[2, 1], r[2, 2]))
        yaw = math.degrees(math.asin(max(-1.0, min(1.0, -r[2, 0]))))
        roll = math.degrees(math.atan2(r[1, 0], r[0, 0]))
        return round(yaw, 1), round(pitch, 1), round(roll, 1)


class _Models:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._landmarker = None
        self._segmenter = None

    def _load(self) -> None:
        if self._landmarker is not None:
            return
        d = models_dir()
        if not (d / FACE_MODEL).exists():
            raise CVUnavailable(f"MediaPipe models not found in {d} — run `make models`")
        try:
            from mediapipe.tasks.python import BaseOptions, vision
        except (ImportError, OSError) as e:  # OSError: missing libEGL / libGLES on the host
            raise CVUnavailable(f"MediaPipe could not load: {e}") from e
        self._landmarker = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(d / FACE_MODEL)),
            running_mode=vision.RunningMode.IMAGE,
            num_faces=4,
            min_face_detection_confidence=0.5,
            output_facial_transformation_matrixes=True,
            output_face_blendshapes=False,
        ))

    def _load_segmenter(self) -> None:
        if self._segmenter is not None:
            return
        d = models_dir()
        if not (d / SEG_MODEL).exists():
            raise CVUnavailable(f"MediaPipe segmentation model not found in {d} — run `make models`")
        try:
            from mediapipe.tasks.python import BaseOptions, vision
        except (ImportError, OSError) as e:
            raise CVUnavailable(f"MediaPipe could not load: {e}") from e
        self._segmenter = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
            base_options=BaseOptions(model_asset_path=str(d / SEG_MODEL)),
            running_mode=vision.RunningMode.IMAGE,
            output_category_mask=True,
            output_confidence_masks=False,
        ))

    @staticmethod
    def _mp_image(rgb: np.ndarray):
        import mediapipe as mp

        return mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb, dtype=np.uint8))

    def faces(self, rgb: np.ndarray) -> list[Face]:
        with self._lock:
            self._load()
            res = self._landmarker.detect(self._mp_image(rgb))
        h, w = rgb.shape[:2]
        out = []
        for i, lms in enumerate(res.face_landmarks):
            arr = np.array([(p.x * w, p.y * h, p.z * w) for p in lms], dtype=np.float64)
            mat = np.array(res.facial_transformation_matrixes[i]) if res.facial_transformation_matrixes else None
            out.append(Face(arr, mat))
        out.sort(key=lambda f: -f.box_area)
        return out

    def segment(self, rgb: np.ndarray) -> np.ndarray:
        """Per-pixel category mask (H×W uint8) at the input resolution."""
        with self._lock:
            self._load_segmenter()
            res = self._segmenter.segment(self._mp_image(rgb))
        return np.array(res.category_mask.numpy_view()).reshape(rgb.shape[:2])

    def close(self) -> None:
        with self._lock:
            for m in (self._landmarker, self._segmenter):
                if m is not None:
                    try:
                        m.close()
                    except Exception:  # noqa: BLE001,S110 — best effort at interpreter exit
                        pass
            self._landmarker = self._segmenter = None


MODELS = _Models()
atexit.register(MODELS.close)


def available() -> bool:
    try:
        with MODELS._lock:
            MODELS._load()
        return True
    except CVUnavailable:
        return False


def as_rgb(im: Image.Image | np.ndarray) -> np.ndarray:
    return np.asarray(im.convert("RGB")) if isinstance(im, Image.Image) else im


def polygon_mask(shape: tuple[int, int], pts: np.ndarray) -> np.ndarray:
    import cv2

    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [np.round(pts).astype(np.int32)], 255)
    return m


def hull_mask(shape: tuple[int, int], pts: np.ndarray) -> np.ndarray:
    import cv2

    m = np.zeros(shape, np.uint8)
    cv2.fillConvexPoly(m, cv2.convexHull(np.round(pts).astype(np.int32)), 255)
    return m


def face_oval_mask(face: Face, shape: tuple[int, int]) -> np.ndarray:
    return polygon_mask(shape, face.pts(FACE_OVAL))
