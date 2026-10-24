"""Rules-only rerank (D26): new user_context and/or preference events → a new `derived`; analysis untouched."""
from __future__ import annotations

import copy
from typing import Any

from ..assemble import complete_user_context
from ..rules import derive, load_rules
from ..schema_io import validate_passport

# Fields whose change alters the model's input (→ re-analysis instead of a rerank).
MODEL_INPUT_FIELDS = ("presentation",)


def merge_context(current: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    """Shallow-merge a user_context patch (nested dicts one level deep), then fill defaults."""
    out = copy.deepcopy(current)
    for k, v in (patch or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = {**out[k], **v}
        else:
            out[k] = v
    return complete_user_context(out)


def needs_model(current: dict[str, Any], new: dict[str, Any]) -> bool:
    return any(current.get(f) != new.get(f) for f in MODEL_INPUT_FIELDS)


def rerank_passport(passport: dict[str, Any], user_context: dict[str, Any], events: list[dict[str, Any]], *,
                    context_changed: bool) -> dict[str, Any]:
    p = copy.deepcopy(passport)
    version = int(passport["derived"].get("derived_version", 1)) + 1
    p["user_context"] = user_context
    p["derived"] = derive(p["analysis"], p["anchors"], p["input_quality"], user_context, load_rules(),
                          p["color_measurements"], events, derived_version=version, context_changed=context_changed,
                          measurement_profile=p.get("measurement_profile"))
    errors = validate_passport(p)
    if errors:
        raise ValueError("reranked passport failed validation: " + "; ".join(errors[:5]))
    return p
