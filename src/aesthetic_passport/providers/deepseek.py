"""DeepSeek adapter (production analysis model), via DeepSeek's OpenAI-compatible chat endpoint.

JSON mode (`response_format={"type": "json_object"}`) guarantees parseable JSON but not schema
conformance, so the full schema is appended to the system prompt; the analyzer validates afterwards.

Thinking mode is ON server-side by default and ignores `temperature`. We always send an explicit
`extra_body={"thinking": {"type": ...}}` so behaviour never depends on a server default (D16);
`reasoning_effort` is sent only when thinking is enabled.
"""
from __future__ import annotations

import base64
import json
import os
import time
from collections.abc import Sequence
from typing import Any

from .base import ImageInput, ProviderError, ProviderResult, Repair, estimate_cost

SCHEMA_HEADER = (
    "## OUTPUT FORMAT\n"
    "Return exactly one JSON object, with no text before or after it, that validates against this JSON Schema. "
    "Include every required field; use null only where the schema allows it.\n"
)
MAX_REPAIR_ERRORS = 30


def system_with_schema(system: str, schema: dict[str, Any]) -> str:
    return f"{system.rstrip()}\n\n{SCHEMA_HEADER}```json\n{json.dumps(schema, ensure_ascii=False)}\n```"


def repair_message(errors: list[str]) -> str:
    shown = errors[:MAX_REPAIR_ERRORS]
    more = f"\n- … and {len(errors) - len(shown)} more" if len(errors) > len(shown) else ""
    return (
        "Your previous JSON failed validation:\n"
        + "\n".join(f"- {e}" for e in shown) + more
        + "\n\nReturn the complete corrected JSON object (not a diff), still following every rule above."
    )


def parse_json_object(text: str) -> tuple[dict[str, Any] | None, str | None]:
    s = text.strip()
    if s.startswith("```"):  # tolerate a fenced reply even in JSON mode
        s = s.split("\n", 1)[1] if "\n" in s else ""
        s = s.rsplit("```", 1)[0]
    if not s:
        return None, "empty response"
    try:
        data = json.loads(s)
    except json.JSONDecodeError as e:
        return None, f"invalid JSON: {e}"
    if not isinstance(data, dict):
        return None, f"expected a JSON object, got {type(data).__name__}"
    return data, None


PROXY_PLACEHOLDER_KEY = "proxy-injected"


def proxy_auth_enabled(proxy_auth_env: str | None) -> bool:
    """True when the deployment declares that an egress proxy injects the real credential (the key never enters
    this process). Refused in production, where a missing key must keep failing loudly."""
    from ..runtime import is_production

    if not proxy_auth_env or is_production():
        return False
    return os.environ.get(proxy_auth_env, "").strip().lower() in ("1", "true", "yes")


def proxy_placeholder_key(proxy_auth_env: str | None) -> str | None:
    """The SDK always sends an Authorization header; the proxy overwrites this placeholder with the real key."""
    return PROXY_PLACEHOLDER_KEY if proxy_auth_enabled(proxy_auth_env) else None


class DeepSeekProvider:
    name = "deepseek"

    def __init__(
        self,
        model: str,
        *,
        base_url: str,
        api_key: str | None = None,
        api_key_env: str = "DEEPSEEK_API_KEY",
        proxy_auth_env: str | None = None,
        temperature: float = 0.2,
        max_output_tokens: int = 8000,
        timeout_s: float = 120,
        sdk_max_retries: int = 2,
        prices: dict[str, float | None] | None = None,
        thinking: str = "disabled",
        reasoning_effort: str = "high",
        client: Any = None,
    ):
        if thinking not in ("disabled", "enabled"):
            raise ProviderError(f"thinking must be 'disabled' or 'enabled', got {thinking!r}")
        self.model = model
        self.thinking = thinking
        self.reasoning_effort = reasoning_effort
        self.temperature = temperature
        self.max_output_tokens = max_output_tokens
        self.prices = prices
        if client is None:
            key = api_key or os.environ.get(api_key_env) or proxy_placeholder_key(proxy_auth_env)
            if not key:
                raise ProviderError(f"{api_key_env} is not set (see .env.example)")
            from openai import OpenAI

            client = OpenAI(api_key=key, base_url=base_url, timeout=timeout_s, max_retries=sdk_max_retries)
        self._client = client

    def build_messages(
        self,
        images: Sequence[ImageInput],
        system: str,
        user: str,
        schema: dict[str, Any],
        repair: Repair | None = None,
    ) -> list[dict[str, Any]]:
        content: list[dict[str, Any]] = []
        for img in images:
            b64 = base64.b64encode(img.data).decode("ascii")
            content.append({"type": "text", "text": f"Photo [{img.photo_id}]:"})
            content.append({"type": "image_url", "image_url": {"url": f"data:{img.media_type};base64,{b64}"}})
        content.append({"type": "text", "text": user})
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_with_schema(system, schema)},
            {"role": "user", "content": content},
        ]
        if repair:
            messages.append({"role": "assistant", "content": repair.previous_output})
            messages.append({"role": "user", "content": repair_message(repair.errors)})
        return messages

    def request_kwargs(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "max_tokens": self.max_output_tokens,
            "extra_body": {"thinking": {"type": self.thinking}},
        }
        if self.thinking == "enabled":
            kwargs["reasoning_effort"] = self.reasoning_effort
        else:
            kwargs["temperature"] = self.temperature  # ignored by the server while thinking
        return kwargs

    def analyze(
        self,
        images: Sequence[ImageInput],
        system: str,
        user: str,
        schema: dict[str, Any],
        *,
        repair: Repair | None = None,
    ) -> ProviderResult:
        from openai import APIError

        messages = self.build_messages(images, system, user, schema, repair)
        t0 = time.perf_counter()
        try:
            resp = self._client.chat.completions.create(**self.request_kwargs(messages))
        except APIError as e:
            raise ProviderError(f"DeepSeek call failed: {e}") from e
        latency_ms = int((time.perf_counter() - t0) * 1000)

        choice = resp.choices[0]
        raw = choice.message.content or ""
        data, parse_error = parse_json_object(raw)
        usage = resp.usage
        input_tokens = getattr(usage, "prompt_tokens", 0) or 0
        output_tokens = getattr(usage, "completion_tokens", 0) or 0
        cache_hit = getattr(usage, "prompt_cache_hit_tokens", None)  # DeepSeek-specific usage field
        return ProviderResult(
            data=data,
            raw_text=raw,
            provider=self.name,
            model=getattr(resp, "model", None) or self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            stop_reason=choice.finish_reason or "unknown",
            cost_usd_est=estimate_cost(self.prices, input_tokens=input_tokens,
                                       output_tokens=output_tokens, cache_hit_tokens=cache_hit),
            parse_error=parse_error,
        )
