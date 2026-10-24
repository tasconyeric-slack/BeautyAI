"""Analysis model providers. Production uses DeepSeek only (D10); `fake` returns the fixture so the product
runs without keys. Add another vendor by writing an adapter with the same `analyze(...)` signature and
registering it in `_REGISTRY`.

Provider selection: env `ANALYSIS_PROVIDER` (`deepseek` | `fake` | `auto`; default `auto`). `auto` uses the
configured provider when its API key is set, else `fake` — so a deploy without keys runs in demo mode, never errors.
"""
from __future__ import annotations

import os
from typing import Any

from ..runtime import mocks_allowed
from .base import (
    ImageInput,
    PhotoId,
    Provider,
    ProviderError,
    ProviderResult,
    Repair,
    estimate_cost,
    load_models_config,
)
from .deepseek import DeepSeekProvider, proxy_auth_enabled
from .fake import FakeProvider

_REGISTRY: dict[str, type] = {"deepseek": DeepSeekProvider, "fake": FakeProvider}

__all__ = [
    "DeepSeekProvider", "FakeProvider", "ImageInput", "PhotoId", "Provider", "ProviderError", "ProviderResult", "Repair",
    "estimate_cost", "from_config", "get_provider", "load_models_config",
]


def get_provider(name: str, model: str, **opts: Any) -> Provider:
    try:
        cls = _REGISTRY[name]
    except KeyError:
        raise ProviderError(f"Unknown provider {name!r}; available: {sorted(_REGISTRY)}") from None
    return cls(model, **opts)


def from_config(role: str = "analysis", cfg: dict[str, Any] | None = None, **overrides: Any) -> Provider:
    """Build the production provider for `role` from config/models.yaml (loads .env if present)."""
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass
    cfg = cfg or load_models_config()
    spec = cfg["production"][role]
    choice = resolve_provider_name(spec["provider"], cfg)
    if choice == "fake":
        if not mocks_allowed():
            raise ProviderError("mock analysis is disabled in production (APP_ENV=production)")
        return FakeProvider(**overrides)
    pcfg = cfg["providers"][spec["provider"]]
    opts: dict[str, Any] = {
        "base_url": pcfg["base_url"],
        "api_key_env": pcfg["api_key_env"],
        "proxy_auth_env": pcfg.get("proxy_auth_env"),
        "timeout_s": pcfg.get("timeout_s", 120),
        "sdk_max_retries": pcfg.get("sdk_max_retries", 2),
        "temperature": spec.get("temperature", 0.2),
        "max_output_tokens": spec.get("max_output_tokens", 8000),
        "thinking": spec.get("thinking", "disabled"),
        "reasoning_effort": spec.get("reasoning_effort", "high"),
        "prices": cfg.get("pricing", {}).get(spec["model"]),
    }
    opts.update(overrides)
    return get_provider(spec["provider"], spec["model"], **opts)


def resolve_provider_name(configured: str, cfg: dict[str, Any] | None = None) -> str:
    """Apply the ANALYSIS_PROVIDER env override. Returns the provider name that will actually serve."""
    choice = os.environ.get("ANALYSIS_PROVIDER", "auto").strip().lower() or "auto"
    if choice == "auto":
        cfg = cfg or load_models_config()
        pcfg = cfg["providers"].get(configured, {})
        key_env = pcfg.get("api_key_env")
        if (key_env and os.environ.get(key_env)) or proxy_auth_enabled(pcfg.get("proxy_auth_env")):
            return configured
        # Production never falls back to the fixture silently: the configured provider then fails on its missing key.
        return "fake" if mocks_allowed() else configured
    return choice
