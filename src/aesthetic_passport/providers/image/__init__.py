"""Image-edit providers. Selection: env IMAGE_EDIT_PROVIDER (qwen | fake | none | auto) over config/models.yaml.
`auto` = the configured provider when its API key is set, else `fake` (demo: shows the composite pipeline)."""
from __future__ import annotations

import os
from typing import Any

from ...runtime import mocks_allowed
from ..base import load_models_config
from .base import ImageEditError, ImageEditProvider, ImageEditResult
from .fake import FakeImageEditProvider
from .qwen import QwenImageEditProvider, resolve_base_url

__all__ = ["FakeImageEditProvider", "ImageEditError", "ImageEditProvider", "ImageEditResult", "QwenImageEditProvider",
           "image_from_config", "resolve_image_provider"]


def resolve_image_provider(cfg: dict[str, Any] | None = None) -> str:
    cfg = cfg or load_models_config()
    spec = cfg["production"]["image_edit"]
    choice = os.environ.get("IMAGE_EDIT_PROVIDER", "auto").strip().lower() or "auto"
    if choice == "auto":
        key_env = cfg["providers"].get(spec["provider"], {}).get("api_key_env")
        if key_env and os.environ.get(key_env):
            return spec["provider"]
        return "fake" if mocks_allowed() else spec["provider"]
    return choice


def image_from_config(cfg: dict[str, Any] | None = None, **overrides: Any) -> ImageEditProvider | None:
    """The configured image-edit provider, or None when previews are disabled (IMAGE_EDIT_PROVIDER=none)."""
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass
    cfg = cfg or load_models_config()
    name = resolve_image_provider(cfg)
    if name == "none":
        return None
    if name == "fake":
        if not mocks_allowed():
            raise ImageEditError("mock image editing is disabled in production (APP_ENV=production)")
        return FakeImageEditProvider(**overrides)
    spec = cfg["production"]["image_edit"]
    pcfg = cfg["providers"][spec["provider"]]
    base_url = resolve_base_url(pcfg["base_url"], os.environ.get(pcfg.get("base_url_env", "")))
    opts = {"base_url": base_url, "api_key_env": pcfg["api_key_env"], "timeout_s": pcfg.get("timeout_s", 120),
            "seed": spec.get("seed"), "price_per_image": cfg.get("pricing", {}).get(spec["model"], {}).get("per_image")}
    opts.update(overrides)
    if name == "qwen":
        return QwenImageEditProvider(spec["model"], **opts)
    raise ImageEditError(f"unknown image-edit provider {name!r}")
