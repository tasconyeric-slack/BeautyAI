"""Image-edit provider interface (Recommended Look). One method: edit(image, prompt) → edited image.

Providers never see masks: no supported model takes one, so identity protection is done afterwards by the
deterministic composite in preview.py (D17).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from PIL import Image


class ImageEditError(RuntimeError):
    """Any failure: transport, auth, refusal, unusable output. The preview falls back to text.

    Carries safe-to-log diagnostics (never keys, prompts, images or bodies): the failing `stage`
    (config | request | response | parse | download | decode), the HTTP status, the provider's error `code`
    and `request_id`, the elapsed time and a short exception `category`.

    `retryable=False` marks a failure that another identical call cannot fix (e.g. the model id or endpoint does
    not resolve), so the caller must not spend a second request on it.
    """

    def __init__(self, message: str, *, stage: str | None = None, http_status: int | None = None,
                 code: str | None = None, request_id: str | None = None, elapsed_ms: int | None = None,
                 category: str | None = None, retryable: bool = True):
        super().__init__(message)
        self.stage, self.http_status, self.code = stage, http_status, code
        self.request_id, self.elapsed_ms, self.category = request_id, elapsed_ms, category
        self.retryable = retryable

    def diagnostics(self) -> dict[str, Any]:
        return {"stage": self.stage, "http_status": self.http_status, "code": self.code,
                "request_id": self.request_id, "elapsed_ms": self.elapsed_ms, "category": self.category,
                "retryable": self.retryable}


@dataclass
class ImageEditResult:
    image: Image.Image
    model: str
    latency_ms: int
    cost_usd_est: float | None


class ImageEditProvider(Protocol):
    name: str
    model: str

    def edit(self, image: Image.Image, prompt: str, *, negative_prompt: str | None = None) -> ImageEditResult: ...
