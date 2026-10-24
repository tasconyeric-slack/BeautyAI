"""Provider interface shared by every model adapter.

Kept deliberately small so another vendor (Qwen, GLM) is one new module plus one entry in
config/models.yaml. A provider only talks to the API: it does not validate against the schema,
retry on invalid output, or write logs. That is the analyzer's job.
"""
from __future__ import annotations

import io
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, Protocol

import yaml

ROOT = Path(__file__).resolve().parents[3]
MODELS_PATH = ROOT / "config" / "models.yaml"

PhotoId = Literal["front", "smile", "profile45", "extra1", "extra2"]


@lru_cache(maxsize=4)
def load_models_config(path: str | None = None) -> dict[str, Any]:
    return yaml.safe_load(Path(path or MODELS_PATH).read_text(encoding="utf-8"))


@dataclass(frozen=True)
class ImageInput:
    photo_id: PhotoId
    data: bytes
    media_type: str = "image/jpeg"

    @classmethod
    def from_path(cls, photo_id: PhotoId, path: Path, *, max_long_side: int, jpeg_quality: int = 90) -> ImageInput:
        """Load a photo, apply EXIF rotation, downscale so the long side is <= max_long_side, re-encode as JPEG."""
        from PIL import Image, ImageOps

        with Image.open(path) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((max_long_side, max_long_side), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=jpeg_quality)
        return cls(photo_id=photo_id, data=buf.getvalue())


@dataclass(frozen=True)
class Repair:
    """What the single retry needs: the model's previous raw output and why it was rejected."""
    previous_output: str
    errors: list[str]


@dataclass
class ProviderResult:
    data: dict[str, Any] | None   # parsed JSON object; None if the output could not be parsed as one
    raw_text: str
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    stop_reason: str               # provider's finish reason, e.g. stop | length | content_filter
    cost_usd_est: float | None
    parse_error: str | None = None

    def log_record(self) -> dict[str, Any]:
        """Row for runs/<id>/calls.jsonl (raw output excluded; stored separately if needed)."""
        rec = asdict(self)
        del rec["data"], rec["raw_text"]
        return rec


class ProviderError(RuntimeError):
    """The API call itself failed (auth, network, rate limit after SDK retries, bad request)."""


class Provider(Protocol):
    name: str
    model: str

    def analyze(
        self,
        images: Sequence[ImageInput],
        system: str,
        user: str,
        schema: dict[str, Any],
        *,
        repair: Repair | None = None,
    ) -> ProviderResult: ...


def estimate_cost(
    prices: dict[str, float | None] | None,
    *,
    input_tokens: int,
    output_tokens: int,
    cache_hit_tokens: int | None = None,
) -> float | None:
    """USD estimate from per-1M-token prices. None while any needed price is unset in config."""
    if not prices:
        return None
    hit = cache_hit_tokens or 0
    miss = input_tokens - hit
    needed = {"input_cache_miss": miss, "output": output_tokens, "input_cache_hit": hit}
    if any(prices.get(k) is None for k, n in needed.items() if n):
        return None
    return round(sum((prices.get(k) or 0.0) * n for k, n in needed.items()) / 1_000_000, 6)
