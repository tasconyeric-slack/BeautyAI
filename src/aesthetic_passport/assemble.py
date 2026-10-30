"""Assemble a Passport from a (validated) model analysis plus CV outputs and user context.

CLI (used by W1 examples and tests):
    python -m aesthetic_passport.assemble \
        --analysis examples/sample_analysis.json \
        --context  examples/sample_context.json \
        --out      examples/sample_passport.json
"""
from __future__ import annotations

import argparse
import json
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .rules import derive, free_preview_targets, load_rules
from .schema_io import validate_analysis, validate_passport

SCHEMA_VERSION = "0.8"
AI_LABEL = "AI 试看"

# V2 onboarding asks only for the presentation (D20); everything else starts from these defaults and is refined later
# on /p/[id]/more (enrich) without a new model call unless the input to the model changes.
USER_CONTEXT_DEFAULTS: dict[str, Any] = {
    "optimize_focus": ["hair", "overall_style"],
    "desired_impression": ["refined", "approachable"],
    "constraints": {"dress_code": "none", "accepts_dye": True, "accepts_perm": True, "accepts_glasses_change": True,
                    "budget_level": "medium", "daily_minutes": 15, "other": ""},
    "hair": {"texture": "unknown", "density": "unknown", "grow_out_ok": True},
    "haircut_budget": "medium",
    "occasions": [],
    "current_style_picks": [],
    "body": {"frame": None, "height_cm": None},
    "style_preferences": {"liked": [], "disliked": []},
    "target_style": None,
    "topic": None,
    "ref": None,
}


def complete_user_context(partial: dict[str, Any]) -> dict[str, Any]:
    """Fill every V2 field with its default; nested dicts are merged one level deep. Pure."""
    out: dict[str, Any] = {"presentation": partial.get("presentation", "feminine")}
    for k, default in USER_CONTEXT_DEFAULTS.items():
        v = partial.get(k)
        if isinstance(default, dict):
            out[k] = {**default, **(v or {})}
        else:
            out[k] = default if v is None and k not in partial else (v if v is not None else default)
    return out


def preview_entry(target_id: str, kind: str = "hair", *, status: str = "pending", rec_id: str | None = None,
                  image_model: str | None = None, after_ref: str | None = None, prompt: str | None = None) -> dict[str, Any]:
    """One `previews[]` item (schema v0.3)."""
    return {"rec_id": rec_id, "target_id": target_id, "kind": kind, "status": status, "image_model": image_model,
            "before_ref": f"before_{kind}_{target_id}.jpg" if after_ref else "front", "after_ref": after_ref,
            "identity_check": "unchecked", "prompt_used": prompt, "ai_label": AI_LABEL}


class InvalidAnalysis(ValueError):
    pass


def build_passport(
    analysis: dict[str, Any],
    user_context: dict[str, Any],
    input_quality: dict[str, Any],
    anchors: dict[str, Any] | None,
    meta: dict[str, Any],
    *,
    color_measurements: dict[str, Any] | None = None,
    measurement_profile: dict[str, Any] | None = None,
    aesthetic_score: dict[str, Any] | None = None,
    reference_percentiles: dict[str, Any] | None = None,
    learned_attractiveness: dict[str, Any] | None = None,
    learned_reference_rank: dict[str, Any] | None = None,
    locale: str = "zh-CN",
    passport_id: str | None = None,
    created_at: str | None = None,
    preference_events: list[dict[str, Any]] | tuple = (),
    previews: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    errors = validate_analysis(analysis)
    if errors:
        raise InvalidAnalysis("; ".join(errors[:10]))

    cfg = load_rules()
    user_context = complete_user_context(user_context)
    derived = derive(analysis, anchors, input_quality, user_context, cfg, color_measurements, preference_events,
                     measurement_profile=measurement_profile)
    if previews is None:  # the free preview (D27): the first non-excluded hair direction
        targets = free_preview_targets(analysis, derived)
        previews = [preview_entry(targets[0])] if targets else []

    passport = {
        "schema_version": SCHEMA_VERSION,
        "passport_id": passport_id or f"ap_{uuid.uuid4().hex[:12]}",
        "created_at": created_at or datetime.now(UTC).isoformat(timespec="seconds"),
        "locale": locale,
        "user_context": user_context,
        "input_quality": input_quality,
        "anchors": anchors,
        "color_measurements": color_measurements,
        "measurement_profile": measurement_profile,
        "aesthetic_score": aesthetic_score,
        "reference_percentiles": reference_percentiles,
        "learned_attractiveness": learned_attractiveness,
        "learned_reference_rank": learned_reference_rank,
        "analysis": analysis,
        "derived": derived,
        "previews": previews,
        "meta": {"quick": None, **meta, "rules_version": cfg["rules_version"]},
    }
    errors = validate_passport(passport)
    if errors:
        raise ValueError("Assembled passport failed schema validation: " + "; ".join(errors[:10]))
    return passport


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--analysis", required=True, type=Path)
    ap.add_argument("--context", required=True, type=Path,
                    help="JSON with user_context, input_quality, anchors, color_measurements, measurement_profile, "
                         "aesthetic_score, reference_percentiles, meta "
                         "(and optional passport_id/created_at)")
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args(argv)

    analysis = json.loads(args.analysis.read_text(encoding="utf-8"))
    ctx = json.loads(args.context.read_text(encoding="utf-8"))
    passport = build_passport(
        analysis,
        ctx["user_context"],
        ctx["input_quality"],
        ctx.get("anchors"),
        ctx["meta"],
        color_measurements=ctx.get("color_measurements"),
        measurement_profile=ctx.get("measurement_profile"),
        aesthetic_score=ctx.get("aesthetic_score"),
        reference_percentiles=ctx.get("reference_percentiles"),
        passport_id=ctx.get("passport_id"),
        created_at=ctx.get("created_at"),
    )
    args.out.write_text(json.dumps(passport, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    d = passport["derived"]
    sp = d["style_profile"]
    print(f"OK {passport['passport_id']}: top5={d['top5']} "
          f"style={sp['names_zh'][sp['primary']]}{'/' + sp['names_zh'][sp['secondary']] if sp['between'] else ''} "
          f"hair={[c['tier'] + ':' + c['status'] for c in d['hair_option_checks']]} "
          f"overall_confidence={d['overall_confidence']} flags={[f['code'] for f in d['consistency_flags']]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
