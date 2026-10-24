"""Production analysis calls: fill the prompt, call the one configured provider, validate, repair once.

Two entry points (D21), same provider and model:
    run_quick()     prompts/analyzer_quick.md → validate_quick + check_quick_contract   (first look, front only)
    run_analysis()  prompts/production_analyzer.md → validate_analysis + check_output_contract   (full analysis)

Flow (D12): provider.analyze → parse → validate → contract. Any failure → one repair turn in the same conversation
with the error list → validate again → otherwise raise AnalysisFailed. Every attempt is appended to
runs/<id>/calls.jsonl with its `kind` (metrics and error messages only; no image data, no raw model output).
"""
from __future__ import annotations

import json
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

from .providers import ImageInput, Provider, ProviderResult, Repair, from_config, load_models_config
from .schema_io import (
    analysis_schema_for_prompt,
    check_output_contract,
    check_quick_contract,
    quick_schema_for_prompt,
    validate_analysis,
    validate_quick,
)

ROOT = Path(__file__).resolve().parents[2]
PROMPT_PATH = ROOT / "prompts" / "production_analyzer.md"
QUICK_PROMPT_PATH = ROOT / "prompts" / "analyzer_quick.md"
EXTRA_CONTEXT_KEYS = ("hair", "haircut_budget", "occasions", "current_style_picks", "body", "style_preferences",
                      "target_style")

PHOTO_DESCRIPTIONS = {
    "front": "straight-on, neutral expression",
    "profile45": "~45° head turn (cheekbone and jawline visible)",
    "smile": "natural smile, straight-on",
    "hair": "usual hairstyle from the side or back",
}


@dataclass(frozen=True)
class AnalyzerPrompt:
    version: str
    system: str
    user_template: str


@lru_cache(maxsize=4)
def load_prompt(path: str | None = None) -> AnalyzerPrompt:
    """Parse a prompt file (default prompts/production_analyzer.md): version line, `## SYSTEM`, fenced USER template."""
    text = Path(path or PROMPT_PATH).read_text(encoding="utf-8")
    version = re.search(r"`prompt_version:\s*([^`]+)`", text)
    system = re.search(r"^## SYSTEM\s*\n(.*?)\n---\s*\n", text, re.DOTALL | re.MULTILINE)
    user = re.search(r"^## USER.*?```\s*\n(.*?)```", text, re.DOTALL | re.MULTILINE)
    if not (version and system and user):
        raise ValueError(f"{PROMPT_PATH.name}: could not find version / SYSTEM / USER sections")
    # Drop example comment lines ("# e.g. ...") from the template.
    template = "\n".join(line for line in user.group(1).splitlines() if not line.startswith("# "))
    return AnalyzerPrompt(version.group(1).strip(), system.group(1).strip(), template.strip() + "\n")


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=None) if value is not None else "null"


def qc_warning_lines(input_quality: dict[str, Any]) -> str:
    lines = []
    for p in input_quality["photos"]:
        if p["status"] != "ok" and p["issues"]:
            lines.append(f"[{p['photo_id']}] {p['status']}: {', '.join(p['issues'])}")
    return "\n".join(lines) or "none"


def build_user_prompt(
    template: str,
    photo_ids: Sequence[str],
    user_context: dict[str, Any],
    input_quality: dict[str, Any],
    anchors: dict[str, Any] | None,
    extra: dict[str, Any] | None = None,
) -> str:
    """Deterministically fill the USER template. Unknown placeholders in `extra` are filled as JSON."""
    manifest = " · ".join(f"[{pid}] {PHOTO_DESCRIPTIONS.get(pid, pid)}" for pid in photo_ids)
    anchors_for_prompt = None
    heuristic = None
    if anchors:
        anchors_for_prompt = {k: v for k, v in anchors.items()
                              if k not in ("method", "source_photo", "face_shape_heuristic")}
        heuristic = anchors.get("face_shape_heuristic")
    values = {
        "photo_manifest": manifest,
        "anchors_json": _json(anchors_for_prompt) if anchors else "null (not measured — rely on the photos)",
        "lighting_consistency": input_quality["lighting_consistency"],
        "qc_warnings": qc_warning_lines(input_quality),
        "presentation": user_context["presentation"],
        "optimize_focus": ", ".join(user_context["optimize_focus"]),
        "desired_impression": ", ".join(user_context["desired_impression"]),
        "constraints_json": _json(user_context["constraints"]),
        "face_shape_heuristic_json": _json(heuristic) if heuristic else "null (not measured)",
        "color_measurements_json": "null (not measured)",
        "user_context_extra_json": _json({k: user_context[k] for k in EXTRA_CONTEXT_KEYS if k in user_context}),
        "garment_ids": garment_id_list(user_context["presentation"]),
    }
    for k, v in (extra or {}).items():
        values[k] = v if isinstance(v, str) else _json(v)
    return template.format(**values)


@dataclass
class AnalysisOutcome:
    analysis: dict[str, Any]
    attempts: list[ProviderResult] = field(default_factory=list)
    prompt_version: str = ""

    @property
    def retries(self) -> int:
        return len(self.attempts) - 1

    @property
    def latency_ms(self) -> int:
        return sum(a.latency_ms for a in self.attempts)

    @property
    def cost_usd_est(self) -> float | None:
        costs = [a.cost_usd_est for a in self.attempts]
        return None if any(c is None for c in costs) else round(sum(costs), 6)  # type: ignore[arg-type]

    @property
    def model(self) -> str:
        return self.attempts[-1].model if self.attempts else "unknown"


class AnalysisFailed(RuntimeError):
    def __init__(self, message: str, errors: list[str], attempts: list[ProviderResult]):
        super().__init__(message)
        self.errors = errors
        self.attempts = attempts


def garment_id_list(presentation: str) -> str:
    """Garment ids the model may cite (filtered by presentation); a note when the catalog is absent."""
    from .styling import PRESENTATION_KEY, load_garments

    catalog = load_garments()
    if not catalog:
        return "(catalog unavailable — use short snake_case ids like top_silk_blouse)"
    pres = PRESENTATION_KEY.get(presentation, "neutral")
    return ", ".join(sorted(i for i, g in catalog.items() if pres in g.get("presentations", [pres])))


def output_errors(result: ProviderResult, kind: str = "analysis") -> list[str]:
    if result.data is None:
        return [f"<root>: {result.parse_error or 'no JSON object returned'}"]
    validate, contract = (validate_quick, check_quick_contract) if kind == "quick" else \
        (validate_analysis, check_output_contract)
    errors = validate(result.data)
    if not errors:
        errors = contract(result.data)
    if result.stop_reason == "length":
        errors.append("<root>: output was truncated (max tokens reached); be more concise")
    return errors


def _log(calls_path: Path | None, result: ProviderResult, attempt: int, errors: list[str], kind: str = "analysis") -> None:
    if not calls_path:
        return
    calls_path.parent.mkdir(parents=True, exist_ok=True)
    rec = {"kind": kind, **result.log_record(), "attempt": attempt, "valid": not errors,
           "errors": [e[:200] for e in errors[:20]]}
    with calls_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def _run(
    kind: str,
    prompt: AnalyzerPrompt,
    schema: dict[str, Any],
    images: Sequence[ImageInput],
    user_context: dict[str, Any],
    input_quality: dict[str, Any],
    anchors: dict[str, Any] | None,
    *,
    extra_signals: dict[str, Any] | None,
    provider: Provider,
    max_retries: int,
    run_dir: Path | None,
) -> AnalysisOutcome:
    user = build_user_prompt(prompt.user_template, [i.photo_id for i in images], user_context,
                             input_quality, anchors, extra_signals)
    calls_path = run_dir / "calls.jsonl" if run_dir else None
    attempts: list[ProviderResult] = []
    repair: Repair | None = None
    errors: list[str] = []
    for attempt in range(max_retries + 1):
        result = provider.analyze(images, prompt.system, user, schema, repair=repair)
        attempts.append(result)
        errors = output_errors(result, kind)
        _log(calls_path, result, attempt, errors, kind)
        if not errors:
            return AnalysisOutcome(result.data, attempts, prompt.version)  # type: ignore[arg-type]
        repair = Repair(previous_output=result.raw_text, errors=errors)
    raise AnalysisFailed(f"{kind} invalid after {len(attempts)} attempt(s)", errors, attempts)


def run_analysis(
    images: Sequence[ImageInput],
    user_context: dict[str, Any],
    input_quality: dict[str, Any],
    anchors: dict[str, Any] | None,
    *,
    extra_signals: dict[str, Any] | None = None,
    provider: Provider | None = None,
    run_dir: Path | None = None,
) -> AnalysisOutcome:
    """The full analysis (analyzer-0.3)."""
    max_retries = load_models_config()["production"]["analysis"].get("max_retries_on_invalid", 1)
    return _run("analysis", load_prompt(), analysis_schema_for_prompt(), images, user_context, input_quality, anchors,
                extra_signals=extra_signals, provider=provider or from_config("analysis"), max_retries=max_retries,
                run_dir=run_dir)


def run_quick(
    images: Sequence[ImageInput],
    user_context: dict[str, Any],
    input_quality: dict[str, Any],
    anchors: dict[str, Any] | None,
    *,
    provider: Provider | None = None,
    run_dir: Path | None = None,
) -> AnalysisOutcome:
    """The first-look call (analyzer-quick-0.1): front photo only, small output budget."""
    qcfg = load_models_config()["production"].get("quick", {})
    provider = provider or from_config("analysis", max_output_tokens=qcfg.get("max_output_tokens", 1200))
    front = [i for i in images if i.photo_id == "front"] or list(images[:1])
    return _run("quick", load_prompt(str(QUICK_PROMPT_PATH)), quick_schema_for_prompt(), front, user_context,
                input_quality, anchors, extra_signals=None, provider=provider,
                max_retries=qcfg.get("max_retries_on_invalid", 1), run_dir=run_dir)


def load_images(photos: dict[str, Path]) -> list[ImageInput]:
    spec = load_models_config()["production"]["analysis"]
    order = [p for p in ("front", "profile45", "smile", "hair") if p in photos]
    return [ImageInput.from_path(pid, photos[pid], max_long_side=spec["image_max_long_side"],  # type: ignore[arg-type]
                                 jpeg_quality=spec.get("image_jpeg_quality", 90)) for pid in order]
