"""Image loading shared by the API, the pipeline and the CV modules.

Everything enters as bytes or a path, gets EXIF-transposed (phones store rotation in EXIF), converted to RGB,
downscaled to a working size and re-encoded as JPEG. HEIC (iPhone) is supported when `pillow-heif` is installed.
"""
from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

try:  # iPhone uploads
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:  # pragma: no cover - optional dependency
    pass

WORKING_LONG_SIDE = 1600
THUMB_LONG_SIDE = 320


class UnreadableImage(ValueError):
    pass


def open_rgb(source: bytes | Path, *, max_long_side: int | None = WORKING_LONG_SIDE) -> Image.Image:
    """Decode, apply EXIF orientation, convert to RGB and (optionally) downscale."""
    try:
        im = Image.open(io.BytesIO(source) if isinstance(source, bytes | bytearray) else source)
        im.load()
    except (UnidentifiedImageError, OSError) as e:
        raise UnreadableImage("无法读取这张图片，请上传 JPG、PNG 或 HEIC 格式的照片。") from e
    im = ImageOps.exif_transpose(im).convert("RGB")
    if max_long_side:
        im.thumbnail((max_long_side, max_long_side), Image.Resampling.LANCZOS)
    return im


def to_jpeg_bytes(im: Image.Image, quality: int = 90) -> bytes:
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def save_jpeg(im: Image.Image, path: Path, quality: int = 90) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, format="JPEG", quality=quality)
    return path


def thumbnail(im: Image.Image, long_side: int = THUMB_LONG_SIDE) -> Image.Image:
    t = im.copy()
    t.thumbnail((long_side, long_side), Image.Resampling.LANCZOS)
    return t
