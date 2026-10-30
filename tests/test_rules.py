import copy
import json
from pathlib import Path

import pytest

from aesthetic_passport.assemble import InvalidAnalysis, build_passport
from aesthetic_passport.rules import derive, edit_spec_checks, load_rules, select_preview_rec
from aesthetic_passport.schema_io import validate_analysis, validate_passport

EX = Path(__file__).resolve().parents[1] / "examples"


@pytest.fixture
def analysis():
    return json.loads((EX / "sample_male_analysis.json").read_text(encoding="utf-8"))


@pytest.fixture
def ctx():
    return json.loads((EX / "sample_male_context.json").read_text(encoding="utf-8"))


def _derive(analysis, ctx, **overrides):
    c = copy.deepcopy(ctx)
    for k, v in overrides.items():
        c[k] = v
    return derive(analysis, c.get("anchors"), c["input_quality"], c["user_context"], load_rules())


# --- schema -------------------------------------------------------------------

def test_sample_analysis_is_valid(analysis):
    assert validate_analysis(analysis) == []


@pytest.mark.parametrize("name", ["sample_passport.json", "sample_male_passport.json"])
def test_committed_sample_passports_are_valid(name):
    passport = json.loads((EX / name).read_text(encoding="utf-8"))
    assert validate_passport(passport) == []
    assert passport["schema_version"] == "0.8"
    assert passport["aesthetic_score"]["overall_score"] is not None


def test_build_passport_roundtrip(analysis, ctx):
    p = build_passport(analysis, ctx["user_context"], ctx["input_quality"], ctx["anchors"], ctx["meta"])
    assert validate_passport(p) == []
    assert p["derived"]["top5"] == ["r1", "r6", "r2", "r3", "r4"]


def test_model_may_not_emit_derived_fields(analysis):
    analysis["display_labels"] = {"style": "自然型"}
    assert any("Additional properties" in e for e in validate_analysis(analysis))


def test_invalid_analysis_rejected_before_assembly(analysis, ctx):
    del analysis["recommendations"][0]["avoid"]
    with pytest.raises(InvalidAnalysis):
        build_passport(analysis, ctx["user_context"], ctx["input_quality"], ctx["anchors"], ctx["meta"])


# --- constraint guards ----------------------------------------------------------

def test_perm_guard_overrides_model_status(analysis, ctx):
    derived = _derive(analysis, ctx)
    assert {"rec_id": "r8", "reason": "violates_constraint"} in derived["excluded_recommendations"]
    assert any(f["code"] == "C5" and "r8" in f["affected"] for f in derived["consistency_flags"])


def test_negated_mention_is_not_a_violation(analysis, ctx):
    analysis["recommendations"][0]["how_to"].append("无需染发，保持自然黑色")
    derived = _derive(analysis, ctx)
    assert "r1" in derived["top5"]


def test_glasses_change_refused_excludes_all_glasses_recs(analysis, ctx):
    uc = copy.deepcopy(ctx["user_context"])
    uc["constraints"]["accepts_glasses_change"] = False
    derived = _derive(analysis, ctx, user_context=uc)
    assert {"rec_id": "r2", "reason": "violates_constraint"} in derived["excluded_recommendations"]


# --- evidence / edit specs ------------------------------------------------------

def test_dangling_evidence_rec_is_excluded(analysis, ctx):
    analysis["recommendations"][1]["evidence"] = ["o99"]
    derived = _derive(analysis, ctx)
    assert {"rec_id": "r2", "reason": "dangling_evidence"} in derived["excluded_recommendations"]
    assert any(f["code"] == "C4" and f["severity"] == "high" for f in derived["consistency_flags"])


def test_mismatched_edit_region_blocks_preview(analysis, ctx):
    analysis["recommendations"][0]["visual_edit_spec"]["region"] = "glasses"  # hairstyle rec, wrong region
    derived = _derive(analysis, ctx)
    assert any(f["code"] == "C7" for f in derived["consistency_flags"])
    _flags, unusable = edit_spec_checks(analysis)
    assert select_preview_rec(analysis, derived["top5"], unusable) == "r2"  # falls through to the next top-5 rec with a usable spec


# --- ranking --------------------------------------------------------------------

def test_category_cap(analysis, ctx):
    for rid in ("r2", "r3"):
        rec = next(r for r in analysis["recommendations"] if r["id"] == rid)
        rec["category"] = "hairstyle"
        rec["visual_edit_spec"] = None
        rec["impact"], rec["confidence"] = 5, 0.9
    derived = _derive(analysis, ctx)
    hair_in_top = [r for r in derived["top5"]
                   if next(x for x in analysis["recommendations"] if x["id"] == r)["category"] == "hairstyle"]
    assert len(hair_in_top) == 2
    assert any(e["reason"] == "category_cap" for e in derived["excluded_recommendations"])


def test_goal_bonus_applied_only_to_focus_categories(analysis, ctx):
    derived = _derive(analysis, ctx)
    bd = {r["rec_id"]: r["score_breakdown"] for r in derived["ranked_recommendations"]}
    assert bd["r1"]["goal_bonus"] == 1.2      # hairstyle ∈ hair focus
    assert bd["r6"]["goal_bonus"] == 1.0      # photo_presentation not in focus


# --- labels & consistency -------------------------------------------------------

def test_style_label_is_nearest_prototype(analysis, ctx):
    derived = _derive(analysis, ctx)
    s = derived["display_labels"]["style"]
    assert (s["primary"], s["primary_zh"]) == ("natural", "自然型")
    assert s["between"] is False


def test_style_label_between_near_midpoint(analysis, ctx):
    analysis["style_dimensions"]["visual_weight"]["value"] = 3.0
    analysis["style_dimensions"]["angular_rounded"]["value"] = -0.45  # between classic and natural
    derived = _derive(analysis, ctx)
    s = derived["display_labels"]["style"]
    assert {s["primary"], s["secondary"]} == {"classic", "natural"} and s["between"] is True


def test_color_confidence_capped_under_low_lighting(analysis, ctx):
    iq = copy.deepcopy(ctx["input_quality"])
    iq["lighting_consistency"] = "low"
    analysis["color_profile"]["temperature_confidence"] = 0.6
    derived = _derive(analysis, ctx, input_quality=iq)
    assert any(f["code"] == "C6" for f in derived["consistency_flags"])


def test_measured_long_face_contradicting_round_is_flagged(analysis, ctx):
    anchors = copy.deepcopy(ctx["anchors"])
    anchors["face_length_width_ratio"] = 1.6
    analysis["face_structure"]["shape_candidates"] = [
        {"label": "round", "probability": 0.6}, {"label": "oval", "probability": 0.4}]
    derived = _derive(analysis, ctx, anchors=anchors)
    assert any(f["code"] == "C1" for f in derived["consistency_flags"])
    assert derived["display_labels"]["face_shape"]["probability"] < 0.6


# --- v0.2: C11, C12, seasonal gating, catalog fit -----------------------------------------------

def test_c11_heuristic_disagrees_with_model(analysis, ctx):
    d = _derive(analysis, ctx)
    assert any(f["code"] == "C11" for f in d["consistency_flags"])        # fixture: CV says oval, model rectangle/oblong
    a2 = copy.deepcopy(ctx["anchors"])
    a2["face_shape_heuristic"]["top"] = "oblong"
    d2 = _derive(analysis, ctx, anchors=a2)
    assert not any(f["code"] == "C11" for f in d2["consistency_flags"])


def _color_derive(analysis, ctx, temp="neutral_warm", temp_conf=0.6, chroma_conf=0.6, warmth_b=19.5, reliability="medium"):
    an = copy.deepcopy(analysis)
    an["color_profile"].update(temperature=temp, temperature_confidence=temp_conf, chroma_confidence=chroma_conf)
    cm = copy.deepcopy(ctx["color_measurements"])
    cm.update(warmth_b=warmth_b, reliability=reliability)
    return derive(an, ctx["anchors"], ctx["input_quality"], ctx["user_context"], load_rules(), cm)


def test_c12_contradiction_caps_temperature_and_chroma(analysis, ctx):
    d = _color_derive(analysis, ctx, temp="cool", warmth_b=24.0)
    flags = [f for f in d["consistency_flags"] if f["code"] == "C12"]
    assert flags and flags[0]["severity"] == "warn"
    c = d["display_labels"]["color"]
    assert c["temperature_confidence"] == 0.4 and c["chroma_confidence"] == 0.4
    assert d["display_labels"]["seasonal_leaning"] is None


def test_c12_low_reliability_also_caps(analysis, ctx):
    d = _color_derive(analysis, ctx, reliability="low")
    assert any(f["code"] == "C12" for f in d["consistency_flags"])


def test_c12_neutral_measurement_never_contradicts(analysis, ctx):
    d = _color_derive(analysis, ctx, temp="cool", warmth_b=14.0)
    assert not any(f["code"] == "C12" for f in d["consistency_flags"])


def test_seasonal_leaning_shown_only_when_gates_pass(analysis, ctx):
    shown = _color_derive(analysis, ctx, temp_conf=0.6, chroma_conf=0.6)["display_labels"]["seasonal_leaning"]
    assert shown["primary"] == "autumn" and shown["text_zh"] == "色彩方向参考：偏向 秋季型（与冬季型接近）"
    assert "你是" not in shown["text_zh"]
    assert _color_derive(analysis, ctx, temp_conf=0.45)["display_labels"]["seasonal_leaning"] is None  # below min conf
    assert _color_derive(analysis, ctx, chroma_conf=0.4)["display_labels"]["seasonal_leaning"] is None


def test_no_color_measurements_means_no_c12(analysis, ctx):
    d = derive(analysis, ctx["anchors"], ctx["input_quality"], ctx["user_context"], load_rules(), None)
    assert not any(f["code"] == "C12" for f in d["consistency_flags"])


def test_hair_references_follow_hair_direction(analysis, ctx):
    d = _derive(analysis, ctx)
    refs = d["hair_references"]
    # Caesar cut: scissor sides, short fringe, low top — the only style close enough to the recommendation.
    # French crop (low fade) is filtered out: a reference may not contradict "sides scissor-cut, not faded".
    assert [r["catalog_id"] for r in refs] == ["caesar_cut"]
    assert all(r["fits_face_shape"] for r in refs) and refs[0]["params_mm"]["top"] == 32
    # Long target hair → long catalog style, short crops drop out.
    an = copy.deepcopy(analysis)
    an["hair_direction"].update(length="long", fringe="none", top_volume="moderate", side_volume="full")
    refs = derive(an, ctx["anchors"], ctx["input_quality"], ctx["user_context"], load_rules())["hair_references"]
    assert refs and refs[0]["catalog_id"] == "long_soft_layers"


def test_hair_references_respect_presentation(analysis, ctx):
    an = copy.deepcopy(analysis)
    an["hair_direction"].update(top_volume="moderate")
    ids = lambda pres: [r["catalog_id"] for r in derive(an, ctx["anchors"], ctx["input_quality"],
                         dict(ctx["user_context"], presentation=pres), load_rules())["hair_references"]]
    assert "textured_pixie" not in ids("masculine")


def test_hair_references_respect_texture(analysis, ctx):
    an = copy.deepcopy(analysis)
    an["current_styling"]["hair"]["texture"] = "straight"
    an["hair_direction"].update(length="medium", top_volume="high", side_volume="tight", fringe="none")
    refs = derive(an, ctx["anchors"], ctx["input_quality"], ctx["user_context"], load_rules())["hair_references"]
    assert "rounded_afro_taper" not in [r["catalog_id"] for r in refs]   # coily-only style never offered for straight hair


def test_evidence_check_covers_direction_blocks(analysis, ctx):
    an = copy.deepcopy(analysis)
    an["hair_direction"]["evidence"] = ["o99"]
    d = derive(an, ctx["anchors"], ctx["input_quality"], ctx["user_context"], load_rules())
    c4 = [f for f in d["consistency_flags"] if f["code"] == "C4"]
    assert c4 and "hair_direction" in c4[0]["affected"]
