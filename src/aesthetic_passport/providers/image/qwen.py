"""Alibaba Model Studio (DashScope, China Beijing region) image editing — `qwen-image-edit-plus` by default.

Request shape verified 2026-10-22 against the Model Studio image-edit API reference: POST
{base_url}/services/aigc/multimodal-generation/generation with input.messages = [one user message whose content
is 1–3 {"image": URL | data URI} items plus exactly one {"text": prompt}], parameters {n, negative_prompt,
prompt_extend, watermark, seed}. Synchronous; the result is a PNG URL in output.choices[0].message.content[i].image,
valid for 24 h, so it is downloaded immediately. Input: 384–3072 px per side, ≤ 10 MB. No mask parameter.
The model id comes from config (qwen-image-edit / -plus / -max, or the newer qwen-image-2.0 family on the same API).
"""
from __future__ import annotations

import base64
import io
import math
import os
import re
import time
from typing import Any

import httpx
from PIL import Image

from .base import ImageEditError, ImageEditResult

MIN_SIDE, MAX_SIDE = 384, 3072


def output_size(image: Image.Image) -> str:
    """Qwen 2.0: keep the crop's geometry/detail within its documented 0.25–4 megapixel output range."""
    w, h = image.size
    pixels = min(max(w * h, 512 ** 2), 2048 ** 2)
    scale = math.sqrt(pixels / (w * h))
    ow, oh = max(16, round(w * scale / 16) * 16), max(16, round(h * scale / 16) * 16)
    # Rounding to the model grid must not put the request outside the area limits.
    while ow * oh < 512 ** 2:
        if ow >= oh:
            ow += 16
        else:
            oh += 16
    while ow * oh > 2048 ** 2:
        if ow >= oh:
            ow -= 16
        else:
            oh -= 16
    return f"{ow}*{oh}"


def to_data_uri(image: Image.Image, quality: int = 92) -> str:
    buf = io.BytesIO()
    image.convert("RGB").save(buf, format="JPEG", quality=quality)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def fit_for_model(image: Image.Image) -> Image.Image:
    """Scale so both sides are within the model's accepted range (keeps aspect)."""
    w, h = image.size
    s = 1.0
    if min(w, h) < MIN_SIDE:
        s = MIN_SIDE / min(w, h)
    if max(w, h) * s > MAX_SIDE:
        s = MAX_SIDE / max(w, h)
    return image if s == 1.0 else image.resize((round(w * s), round(h * s)), Image.Resampling.LANCZOS)


def is_unroutable(status: int | None, code: str | None, message: str) -> bool:
    """HTTP 404, or DashScope's `InvalidParameter / Model not exist`: the model id does not resolve on this host for
    this API key (e.g. a legacy endpoint instead of the workspace endpoint). It is deterministic, so a retry only
    repeats the failed request."""
    return status == 404 or (code == "InvalidParameter" and "model not exist" in message.lower())


def resolve_base_url(configured: str, override: str | None = None) -> str:
    """The override (an env var holding a pasted console value) wins over the configured URL when non-blank.
    Tolerates the usual paste slips: no scheme → https; a bare host → the DashScope `/api/v1` path."""
    raw = (override or "").strip()
    if not raw:
        return configured
    if "://" not in raw:
        raw = "https://" + raw
    scheme, rest = raw.split("://", 1)
    host, sep, path = rest.partition("/")
    return f"{scheme}://{host}" + (sep + path if path.strip("/") else "/api/v1")


class QwenImageEditProvider:
    name = "qwen"

    def __init__(self, model: str, *, base_url: str, api_key: str | None = None, api_key_env: str = "DASHSCOPE_API_KEY",
                 timeout_s: float = 120, seed: int | None = 1234, price_per_image: float | None = None,
                 client: httpx.Client | None = None, **_ignored: Any):
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.seed = seed
        self.price = price_per_image
        key = api_key or os.environ.get(api_key_env)
        if not key and client is None:
            raise ImageEditError(f"{api_key_env} is not set (see .env.example)", stage="config",
                                 category="missing_api_key")
        # The key goes only on the DashScope call, never on the client: the result-image URL is a pre-signed
        # OSS URL, and OSS rejects a request that carries an Authorization header as well as a URL signature
        # (it would also send the DashScope key to a different host).
        self._auth = {"Authorization": f"Bearer {key}"} if key else {}
        self._client = client or httpx.Client(timeout=timeout_s)

    def request_body(self, image: Image.Image, prompt: str, negative_prompt: str | None) -> dict[str, Any]:
        params: dict[str, Any] = {"n": 1, "prompt_extend": False, "watermark": False}
        fitted = fit_for_model(image)
        if self.model.startswith("qwen-image-2.0"):
            params["size"] = output_size(fitted)
        if negative_prompt:
            params["negative_prompt"] = negative_prompt[:500]
        if self.seed is not None:
            params["seed"] = self.seed
        return {
            "model": self.model,
            "input": {"messages": [{"role": "user", "content": [{"image": to_data_uri(fitted)},
                                                                 {"text": prompt}]}]},
            "parameters": params,
        }

    def edit(self, image: Image.Image, prompt: str, *, negative_prompt: str | None = None) -> ImageEditResult:
        t0 = time.perf_counter()

        def fail(msg: str, stage: str, category: str, *, status: int | None = None, code: str | None = None,
                 request_id: str | None = None, retryable: bool = True) -> ImageEditError:
            return ImageEditError(msg, stage=stage, http_status=status, code=code, request_id=request_id,
                                  elapsed_ms=int((time.perf_counter() - t0) * 1000), category=category,
                                  retryable=retryable)

        url = f"{self.base_url}/services/aigc/multimodal-generation/generation"
        try:
            resp = self._client.post(url, json=self.request_body(image, prompt, negative_prompt), headers=self._auth)
        except httpx.HTTPError as e:
            raise fail(f"image edit request failed: {type(e).__name__}", "request", type(e).__name__) from e
        rid = _request_id(resp)
        try:
            body = resp.json()
        except ValueError as e:      # gateway / proxy pages are not JSON: keep the status, drop the body
            raise fail(f"image edit returned a non-JSON response (HTTP {resp.status_code})", "response",
                       "invalid_json", status=resp.status_code, request_id=rid,
                       retryable=not is_unroutable(resp.status_code, None, "")) from e
        if not isinstance(body, dict):
            raise fail("image edit returned an unexpected JSON shape", "response", "invalid_json",
                       status=resp.status_code, request_id=rid, retryable=not is_unroutable(resp.status_code, None, ""))
        rid = rid or _str(body.get("request_id"))
        if resp.status_code != 200 or "output" not in body:
            code = _str(body.get("code")) or str(resp.status_code)
            message = _safe_message(body.get("message"))
            raise fail(f"image edit refused: {code} {message}".rstrip(), "response", "api_error",
                       status=resp.status_code, code=code, request_id=rid,
                       retryable=not is_unroutable(resp.status_code, code, message))
        try:
            choice = body["output"]["choices"][0]
            image_url = next(c["image"] for c in choice["message"]["content"] if "image" in c)
        except (KeyError, IndexError, StopIteration, TypeError) as e:
            raise fail("image edit returned no image", "parse", "no_image", status=resp.status_code,
                       code=_str(body.get("code")), request_id=rid) from e
        try:
            img_resp = self._client.get(image_url)      # no Authorization header: pre-signed URL
        except httpx.HTTPError as e:
            raise fail(f"could not download the edited image: {type(e).__name__}", "download", type(e).__name__,
                       request_id=rid) from e
        if img_resp.status_code != 200:
            raise fail(f"could not download the edited image (HTTP {img_resp.status_code})", "download",
                       "download_http_error", status=img_resp.status_code, request_id=rid)
        try:
            out = Image.open(io.BytesIO(img_resp.content)).convert("RGB")
        except OSError as e:
            raise fail("the edited image could not be decoded", "decode", type(e).__name__, request_id=rid) from e
        return ImageEditResult(out, self.model, int((time.perf_counter() - t0) * 1000), self.price)


def _str(v: Any) -> str | None:
    return str(v)[:80] if v not in (None, "") else None


def _request_id(resp: httpx.Response) -> str | None:
    for h in ("x-dashscope-request-id", "x-request-id", "x-acs-request-id"):
        if resp.headers.get(h):
            return resp.headers[h][:80]
    return None


_UNSAFE = re.compile(r"data:[^\s]*|https?://\S+|[A-Za-z0-9+/=_-]{32,}")


def _safe_message(msg: Any) -> str:
    """The provider's short error message with URLs, data URIs and long tokens removed, capped at 160 chars."""
    return _UNSAFE.sub("[redacted]", str(msg or ""))[:160]
