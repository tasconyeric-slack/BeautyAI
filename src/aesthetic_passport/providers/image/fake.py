"""Deterministic stand-in for an image-edit model (no keys, CI, demo mode).

It restyles the whole image (hair-dark pixels lifted to a warm brown, slight blur so it looks "re-rendered")
— deliberately changing the face too, so tests can prove the composite keeps the face pixels original.
`fail=True` simulates an API error for the fallback path.
"""
from __future__ import annotations

import os
import time

import numpy as np
from PIL import Image, ImageFilter

from .base import ImageEditError, ImageEditResult

FAKE_MODEL = "fake-image-edit"


class FakeImageEditProvider:
    name = "fake"

    def __init__(self, model: str = FAKE_MODEL, *, fail: bool | None = None, delay_s: float | None = None, **_ignored):
        self.model = model
        # Env switches let the running app demonstrate the slow and failing paths (FAKE_IMAGE_EDIT_FAIL=1).
        self.fail = os.environ.get("FAKE_IMAGE_EDIT_FAIL", "") in ("1", "true") if fail is None else fail
        self.delay_s = float(os.environ.get("FAKE_IMAGE_EDIT_DELAY_S", "0")) if delay_s is None else delay_s

    def edit(self, image: Image.Image, prompt: str, *, negative_prompt: str | None = None) -> ImageEditResult:
        t0 = time.perf_counter()
        if self.delay_s:
            time.sleep(self.delay_s)
        if self.fail:
            raise ImageEditError("simulated image-edit failure")
        a = np.asarray(image.convert("RGB")).astype(np.float32)
        lum = a.mean(axis=2, keepdims=True)
        dark = np.clip((110 - lum) / 110, 0, 1)                     # weight toward dark (hair-like) pixels
        tint = np.array([96, 62, 38], np.float32)                     # warm brown
        out = a * (1 - 0.8 * dark) + tint * 0.8 * dark
        out = out * 0.97 + 4                                          # global shift: the face changes too
        img = Image.fromarray(out.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
        # Mimic a model's output size rounding (multiples of 16), so the un-pad / resize path is exercised.
        w, h = img.size
        img = img.resize((max(16, w // 16 * 16), max(16, h // 16 * 16)))
        return ImageEditResult(img, self.model, int((time.perf_counter() - t0) * 1000), 0.0)
