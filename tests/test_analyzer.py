"""Analyzer: prompt filling, validation, the single repair turn, calls.jsonl logging. No network."""
import copy
import json
from pathlib import Path

import pytest

from aesthetic_passport.analyzer import (
    AnalysisFailed,
    build_user_prompt,
    load_prompt,
    output_errors,
    run_analysis,
    run_quick,
)
from aesthetic_passport.pipeline import PipelineError, run_pipeline
from aesthetic_passport.providers import ImageInput, ProviderResult
from aesthetic_passport.providers.fake import FakeProvider, quick_from_analysis

EX = Path(__file__).resolve().parents[1] / "examples"
CTX = json.loads((EX / "sample_context.json").read_text(encoding="utf-8"))
GOOD = json.loads((EX / "sample_analysis.json").read_text(encoding="utf-8"))
QUICK = quick_from_analysis(GOOD)
MALE_CTX = json.loads((EX / "sample_male_context.json").read_text(encoding="utf-8"))
IMG = [ImageInput("front", b"x"), ImageInput("profile45", b"y")]


def result(data, *, raw=None, stop="stop", cost=0.001, parse_error=None):
    return ProviderResult(data=data, raw_text=raw if raw is not None else json.dumps(data or {}), provider="scripted",
                          model="scripted-1", input_tokens=100, output_tokens=50, latency_ms=10,
                          stop_reason=stop, cost_usd_est=cost, parse_error=parse_error)


class Scripted:
    """Returns pre-baked results in order and records every call (incl. the repair payload)."""
    name, model = "scripted", "scripted-1"

    def __init__(self, *results):
        self.results = list(results)
        self.calls = []

    def analyze(self, images, system, user, schema, *, repair=None):
        self.calls.append({"system": system, "user": user, "repair": repair})
        return self.results.pop(0)


def bad_schema():
    d = copy.deepcopy(GOOD)
    del d["recommendations"][0]["avoid"]
    return d


def bad_contract():
    d = copy.deepcopy(GOOD)
    d["recommendations"] = d["recommendations"][:5]
    return d


# --- prompt ---------------------------------------------------------------------------

def test_prompt_file_parses():
    p = load_prompt()
    assert p.version.startswith("analyzer-")
    assert "Hard rules" in p.system and "No attractiveness judgments" in p.system
    assert "{photo_manifest}" in p.user_template and "# e.g." not in p.user_template


def test_user_prompt_is_deterministic_and_complete():
    tpl = load_prompt().user_template
    args = (tpl, ["front", "profile45"], CTX["user_context"], CTX["input_quality"], CTX["anchors"])
    a, b = build_user_prompt(*args), build_user_prompt(*args)
    assert a == b
    assert "[front]" in a and "[profile45]" in a
    assert '"face_length_width_ratio": 1.36' in a and "mediapipe_face_landmarker" not in a
    assert "accepts_dye" in a and "{" not in a.split("constraints =")[0].split("ANCHORS")[0]


def test_user_prompt_lists_qc_warnings_and_missing_anchors():
    iq = copy.deepcopy(MALE_CTX["input_quality"])
    iq["photos"][1].update(status="warn", issues=["blurry"])
    text = build_user_prompt(load_prompt().user_template, ["front"], MALE_CTX["user_context"], iq, None)
    assert "[smile] warn: blurry" in text
    assert "null (not measured" in text


# --- validation + repair ------------------------------------------------------------------

def test_valid_first_try(tmp_path):
    prov = Scripted(result(GOOD))
    out = run_analysis(IMG, CTX["user_context"], CTX["input_quality"], CTX["anchors"], provider=prov, run_dir=tmp_path)
    assert out.retries == 0 and out.analysis == GOOD and out.cost_usd_est == 0.001
    rows = [json.loads(line) for line in (tmp_path / "calls.jsonl").read_text().splitlines()]
    assert len(rows) == 1 and rows[0]["valid"] and rows[0]["attempt"] == 0
    assert "raw_text" not in rows[0] and "data" not in rows[0]       # no model output / photo data in logs


@pytest.mark.parametrize("first", [bad_schema(), bad_contract()])
def test_one_repair_turn_with_error_list(tmp_path, first):
    prov = Scripted(result(first), result(GOOD))
    out = run_analysis(IMG, CTX["user_context"], CTX["input_quality"], CTX["anchors"], provider=prov, run_dir=tmp_path)
    assert out.retries == 1 and out.cost_usd_est == 0.002
    repair = prov.calls[1]["repair"]
    assert repair is not None and repair.errors and repair.previous_output == json.dumps(first)
    rows = [json.loads(line) for line in (tmp_path / "calls.jsonl").read_text().splitlines()]
    assert [r["valid"] for r in rows] == [False, True]


def test_fails_loudly_after_second_invalid(tmp_path):
    prov = Scripted(result(bad_schema()), result(bad_schema()))
    with pytest.raises(AnalysisFailed) as e:
        run_analysis(IMG, CTX["user_context"], CTX["input_quality"], CTX["anchors"], provider=prov, run_dir=tmp_path)
    assert len(e.value.attempts) == 2 and e.value.errors
    assert len(prov.calls) == 2                                   # never a third call


def test_unparseable_and_truncated_outputs_are_errors():
    assert output_errors(result(None, raw="not json", parse_error="invalid JSON: x"))[0].startswith("<root>: invalid JSON")
    assert any("truncated" in e for e in output_errors(result(GOOD, stop="length")))


def test_unknown_cost_propagates_as_none():
    prov = Scripted(result(GOOD, cost=None))
    out = run_analysis(IMG, CTX["user_context"], CTX["input_quality"], CTX["anchors"], provider=prov)
    assert out.cost_usd_est is None


def test_rules_layer_outcomes_do_not_trigger_retry():
    d = copy.deepcopy(GOOD)
    d["recommendations"][0]["evidence"] = ["o99"]                 # dangling → C4 in rules, not a retry
    prov = Scripted(result(d))
    out = run_analysis(IMG, CTX["user_context"], CTX["input_quality"], CTX["anchors"], provider=prov)
    assert out.retries == 0


# --- pipeline ------------------------------------------------------------------------------

def _photos(tmp_path):
    from PIL import Image

    paths = {}
    for role in ("front", "profile45"):
        p = tmp_path / f"{role}.jpg"
        Image.new("RGB", (300, 400), (180, 160, 140)).save(p)
        paths[role] = p
    return paths


def test_pipeline_reports_every_stage_and_writes_passport(tmp_path, monkeypatch):
    monkeypatch.setenv("QC_MODE", "stub")
    stages = []
    partials = []
    passport = run_pipeline(_photos(tmp_path), CTX["user_context"], run_dir=tmp_path / "run", passport_id="ap_0123456789ab",
                            on_stage=stages.append, on_partial=lambda k, _v: partials.append(k),
                            provider=Scripted(result(QUICK), result(GOOD)))
    assert stages == ["qc", "anchors", "color", "quick", "analysis", "rules", "assemble"]
    assert partials == ["anchors", "quick", "analysis"]                     # the reveal order (D21)
    assert passport["meta"]["analysis_model"] == "scripted-1" and passport["meta"]["retries"] == 0
    assert passport["meta"]["quick"]["ok"] is True and passport["schema_version"] == "0.9"
    assert json.loads((tmp_path / "run" / "passport.json").read_text())["passport_id"] == "ap_0123456789ab"
    kinds = [json.loads(line)["kind"] for line in (tmp_path / "run" / "calls.jsonl").read_text().splitlines()]
    assert kinds == ["quick", "analysis"]


def test_pipeline_front_only_with_fake_provider(tmp_path, monkeypatch):
    monkeypatch.setenv("QC_MODE", "stub")
    photos = {"front": _photos(tmp_path)["front"]}
    passport = run_pipeline(photos, {"presentation": "feminine"}, run_dir=tmp_path / "run",
                            provider=FakeProvider(delay_s=0))
    assert passport["input_quality"]["passed"] and [p["photo_id"] for p in passport["input_quality"]["photos"]] == ["front"]
    assert passport["user_context"]["hair"]["texture"] == "unknown"           # defaults filled
    assert passport["analysis"]["makeup_direction"]["mode"] == "makeup"
    male = run_pipeline(photos, {"presentation": "masculine"}, run_dir=tmp_path / "run2", provider=FakeProvider(delay_s=0))
    assert male["analysis"]["makeup_direction"]["mode"] == "grooming"


def test_pipeline_quick_failure_does_not_block_full(tmp_path, monkeypatch):
    monkeypatch.setenv("QC_MODE", "stub")
    partials = []
    bad_quick = dict(QUICK, summary_zh="")
    passport = run_pipeline(_photos(tmp_path), CTX["user_context"], run_dir=tmp_path / "run",
                            on_partial=lambda k, _v: partials.append(k),
                            provider=Scripted(result(bad_quick), result(bad_quick), result(GOOD)))
    assert partials == ["anchors", "quick_failed", "analysis"]
    assert passport["meta"]["quick"]["ok"] is False


def test_run_quick_validates_and_repairs(tmp_path):
    prov = Scripted(result(dict(QUICK, feature_signature=QUICK["feature_signature"][:2])), result(QUICK))
    out = run_quick(IMG, CTX["user_context"], CTX["input_quality"], CTX["anchors"], provider=prov, run_dir=tmp_path)
    assert out.retries == 1 and out.prompt_version == "analyzer-quick-0.1"
    assert "feature_signature" in prov.calls[1]["repair"].errors[0]
    assert "presentation = feminine" in prov.calls[0]["user"] and "GARMENT IDS" not in prov.calls[0]["user"]


def test_pipeline_failed_analysis_is_a_user_facing_error(tmp_path, monkeypatch):
    monkeypatch.setenv("QC_MODE", "stub")
    with pytest.raises(PipelineError) as e:
        run_pipeline(_photos(tmp_path), CTX["user_context"], run_dir=tmp_path / "run",
                     provider=Scripted(result(QUICK), result(bad_schema()), result(bad_schema())))
    assert e.value.code == "analysis_failed"


def test_pipeline_requires_front_only(tmp_path):
    photos = _photos(tmp_path)
    del photos["front"]
    with pytest.raises(PipelineError) as e:
        run_pipeline(photos, CTX["user_context"], run_dir=tmp_path / "run", provider=Scripted())
    assert e.value.code == "missing_photos"


def test_safety_grep_catches_banned_terms():
    import importlib.util

    import yaml

    spec = importlib.util.spec_from_file_location("summ", EX.parent / "scripts" / "summarize_runs.py")
    summ = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(summ)
    terms = yaml.safe_load((EX.parent / "config" / "rules.yaml").read_text(encoding="utf-8"))["safety_terms"]
    p = {"analysis": copy.deepcopy(GOOD)}
    assert summ.safety_hits(summ.model_text(p), terms) == {}
    p["analysis"]["works"][0]["text"] = "颜值很高，可以考虑玻尿酸"
    hits = summ.safety_hits(summ.model_text(p), terms)
    assert "颜值" in hits["attractiveness"] and "玻尿酸" in hits["medical"]
