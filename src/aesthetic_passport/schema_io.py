"""Schema loading and validation.

`schema/analysis.schema.json` is the model's output contract.
`schema/passport.schema.json` is the assembled product object and $refs the analysis schema.
`schema/quick.schema.json` is the quick (first-look) analysis; `schema/api.schema.json` the API response shell.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = ROOT / "schema"
BASE_URI = "https://aesthetic-passport.local/schema/"
SCHEMA_NAMES = ("analysis.schema.json", "passport.schema.json", "quick.schema.json", "api.schema.json")
GARMENTS_PATH = ROOT / "config" / "garments.yaml"


def _load(name: str) -> dict[str, Any]:
    return json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _registry() -> Registry:
    resources = []
    for name in SCHEMA_NAMES:
        schema = _load(name)
        resources.append((BASE_URI + name, Resource.from_contents(schema)))
    return Registry().with_resources(resources)


@lru_cache(maxsize=8)
def _validator(name: str) -> Draft202012Validator:
    return Draft202012Validator(_load(name), registry=_registry(), format_checker=FormatChecker())


def _errors(name: str, instance: Any) -> list[str]:
    errs = sorted(_validator(name).iter_errors(instance), key=lambda e: list(e.absolute_path))
    return [f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}" for e in errs]


def validate_analysis(instance: Any) -> list[str]:
    """Return a list of human-readable errors (empty list = valid).

    Feed these errors back to the model on the single allowed retry.
    """
    return _errors("analysis.schema.json", instance)


def validate_passport(instance: Any) -> list[str]:
    return _errors("passport.schema.json", instance)


def validate_quick(instance: Any) -> list[str]:
    return _errors("quick.schema.json", instance)


def validate_api_response(instance: Any) -> list[str]:
    return _errors("api.schema.json", instance)


def quick_schema_for_prompt() -> dict[str, Any]:
    """Self-contained quick schema for the prompt (the $refs into analysis.schema.json are inlined)."""
    quick = _load("quick.schema.json")
    defs = _load("analysis.schema.json")["$defs"]
    sig = defs["feature_signature"]
    quick["$defs"] = {"region": defs["region"], "feature_signature": sig, "observation": defs["observation"]}
    quick["properties"]["feature_signature"] = {"$ref": "#/$defs/feature_signature"}
    quick["properties"]["observations"]["items"] = {"$ref": "#/$defs/observation"}
    return quick


@lru_cache(maxsize=1)
def garment_ids() -> frozenset[str] | None:
    """Ids in config/garments.yaml, or None while the catalog does not exist (K2 developed in parallel)."""
    if not GARMENTS_PATH.exists():
        return None
    data = yaml.safe_load(GARMENTS_PATH.read_text(encoding="utf-8")) or {}
    return frozenset(g["id"] for g in data.get("garments", []))


def analysis_schema_for_prompt() -> dict[str, Any]:
    """Schema to show the model in its system prompt.

    DeepSeek JSON mode (W1) takes no schema parameter and only guarantees parseable JSON, so the full
    schema goes into the prompt. Local `validate_analysis` + `check_output_contract` enforce it afterwards.
    """
    return _load("analysis.schema.json")


# Output contract the schema cannot express (stated in prompts/production_analyzer.md).
# A failure here triggers the analyzer's single retry, same as a schema error.
REC_COUNT_MIN, REC_COUNT_MAX = 6, 8
REC_MIN_CATEGORIES = 3


def check_output_contract(analysis: dict[str, Any]) -> list[str]:
    """Deterministic contract checks beyond JSON Schema. Call only on schema-valid analyses.

    Rules-layer outcomes (dangling evidence, constraint overrides, confidence caps, ranking) are
    deliberately NOT checked here: they are handled and flagged by rules.py, not retried.
    """
    errors: list[str] = []
    recs = analysis["recommendations"]
    if not REC_COUNT_MIN <= len(recs) <= REC_COUNT_MAX:
        errors.append(f"recommendations: expected {REC_COUNT_MIN}-{REC_COUNT_MAX} items, got {len(recs)}")
    categories = {r["category"] for r in recs}
    if len(categories) < REC_MIN_CATEGORIES:
        errors.append(f"recommendations: must cover at least {REC_MIN_CATEGORIES} distinct categories, "
                      f"got {len(categories)} ({', '.join(sorted(categories))})")
    for section, items in (("observations", analysis["observations"]), ("recommendations", recs)):
        ids = [item["id"] for item in items]
        dupes = sorted({i for i in ids if ids.count(i) > 1})
        if dupes:
            errors.append(f"{section}: duplicate ids {', '.join(dupes)}")
    errors += _signature_errors(analysis["feature_signature"], {o["id"] for o in analysis["observations"]})
    tiers = sorted(h["tier"] for h in analysis["hair_options"])
    if tiers != ["bold", "easy", "safe"]:
        errors.append(f"hair_options: need exactly one each of safe, bold, easy; got {', '.join(tiers)}")
    for h in analysis["hair_options"]:
        if h["visual_edit_spec"]["region"] != "hair":
            errors.append(f"hair_options[{h['tier']}].visual_edit_spec.region must be hair")
    rec_ids = {r["id"] for r in recs}
    for r in recs:
        bad = [x for x in r["pairs_with"] if x not in rec_ids or x == r["id"]]
        if bad:
            errors.append(f"recommendations[{r['id']}].pairs_with: unknown or self ids {', '.join(bad)}")
    known = garment_ids()
    if known is not None:
        missing = [i["garment_id"] for i in analysis["outfit_direction"]["items"] if i["garment_id"] not in known]
        if missing:
            errors.append(f"outfit_direction.items: garment_id not in config/garments.yaml: {', '.join(missing)}")
    return errors


def _signature_errors(signature: list[dict[str, Any]], obs_ids: set[str]) -> list[str]:
    dangling = sorted({o for s in signature for o in s["observation_ids"]} - obs_ids)
    return [f"feature_signature: cites unknown observation ids {', '.join(dangling)}"] if dangling else []


def check_quick_contract(quick: dict[str, Any]) -> list[str]:
    """Quick-analysis contract: the signature cites only observations included in the same result."""
    ids = [o["id"] for o in quick["observations"]]
    errors = _signature_errors(quick["feature_signature"], set(ids))
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        errors.append(f"observations: duplicate ids {', '.join(dupes)}")
    return errors
