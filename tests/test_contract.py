import copy
import json
from pathlib import Path

import pytest

from aesthetic_passport import schema_io
from aesthetic_passport.schema_io import (
    check_output_contract,
    check_quick_contract,
    validate_analysis,
    validate_api_response,
    validate_quick,
)

EX = Path(__file__).resolve().parents[1] / "examples"


@pytest.fixture
def analysis():
    return json.loads((EX / "sample_analysis.json").read_text(encoding="utf-8"))


def test_sample_meets_contract(analysis):
    assert check_output_contract(analysis) == []


def test_too_few_recommendations_is_a_contract_error_but_schema_valid(analysis):
    analysis["recommendations"] = analysis["recommendations"][:5]
    assert validate_analysis(analysis) == []          # schema allows 5..10
    assert any("expected 6-8" in e for e in check_output_contract(analysis))


def test_too_many_recommendations(analysis):
    for rid in ("r8", "r9"):
        analysis["recommendations"].append(dict(analysis["recommendations"][0], id=rid, pairs_with=[]))
    assert any("got 9" in e for e in check_output_contract(analysis))


def test_fewer_than_three_categories(analysis):
    for i, rec in enumerate(analysis["recommendations"]):
        rec["category"] = "hairstyle" if i % 2 else "brows"
        rec["visual_edit_spec"] = None
    assert validate_analysis(analysis) == []
    errs = check_output_contract(analysis)
    assert len(errs) == 1 and "at least 3 distinct categories" in errs[0]


def test_duplicate_ids(analysis):
    analysis["recommendations"][1]["id"] = "r1"
    analysis["observations"][1]["id"] = "o1"
    errs = check_output_contract(analysis)
    assert any("recommendations: duplicate ids r1" in e for e in errs)
    assert any("observations: duplicate ids o1" in e for e in errs)


def test_dangling_evidence_is_not_a_contract_error(analysis):
    # handled (and flagged C4) by the rules layer; must not trigger a retry
    analysis["recommendations"][0]["evidence"] = ["o99"]
    assert check_output_contract(analysis) == []


@pytest.mark.parametrize("src,dst", [("sample_passport.json", "sample_passport.json"),
                                     ("sample_male_passport.json", "sample_passport_male.json")])
def test_web_fixture_matches_examples(src, dst):
    # `make sample` copies the fixtures into the web app; they must never drift.
    web = EX.parent / "web" / "lib" / "fixtures" / dst
    assert web.read_text(encoding="utf-8") == (EX / src).read_text(encoding="utf-8")


# --- v0.3 fields: one positive and one negative case each ------------------------------------------

def test_male_sample_meets_contract():
    male = json.loads((EX / "sample_male_analysis.json").read_text(encoding="utf-8"))
    assert validate_analysis(male) == [] and check_output_contract(male) == []


def test_observation_region_required_and_enumerated(analysis):
    a = copy.deepcopy(analysis)
    del a["observations"][0]["region"]
    assert any("region" in e for e in validate_analysis(a))
    analysis["observations"][0]["region"] = "ear"
    assert any("observations/0/region" in e for e in validate_analysis(analysis))


def test_feature_signature_exactly_three_and_cites_observations(analysis):
    a = copy.deepcopy(analysis)
    a["feature_signature"] = a["feature_signature"][:2]
    assert any("feature_signature" in e for e in validate_analysis(a))
    analysis["feature_signature"][0]["observation_ids"] = ["o77"]
    assert validate_analysis(analysis) == []
    assert any("feature_signature: cites unknown observation ids o77" in e for e in check_output_contract(analysis))


def test_hair_options_one_per_tier(analysis):
    analysis["hair_options"][1]["tier"] = "safe"
    assert validate_analysis(analysis) == []
    assert any("one each of safe, bold, easy" in e for e in check_output_contract(analysis))


def test_hair_option_spec_must_edit_hair(analysis):
    analysis["hair_options"][0]["visual_edit_spec"]["region"] = "glasses"
    assert any("hair_options[safe].visual_edit_spec.region must be hair" in e for e in check_output_contract(analysis))


def test_hair_option_three_barber_lines(analysis):
    analysis["hair_options"][0]["barber_script"] = ["只说一句话就够了"]
    assert any("barber_script" in e for e in validate_analysis(analysis))


def test_color_profile_v03_lists(analysis):
    a = copy.deepcopy(analysis)
    a["color_profile"]["lip_families"] = a["color_profile"]["lip_families"][:2]
    assert any("lip_families" in e for e in validate_analysis(a))
    analysis["color_profile"]["combos"][0]["hexes"] = ["#12345"]
    assert any("combos" in e for e in validate_analysis(analysis))


def test_makeup_direction_enum(analysis):
    analysis["makeup_direction"]["blush"]["placement"] = "everywhere"
    assert any("makeup_direction" in e for e in validate_analysis(analysis))


def test_outfit_items_must_exist_in_garment_catalog(analysis):
    assert schema_io.garment_ids() is not None   # config/garments.yaml present
    analysis["outfit_direction"]["items"][0]["garment_id"] = "top_does_not_exist"
    assert any("top_does_not_exist" in e for e in check_output_contract(analysis))


def test_outfit_catalog_missing_is_skipped(analysis, monkeypatch):
    analysis["outfit_direction"]["items"][0]["garment_id"] = "top_does_not_exist"
    monkeypatch.setattr(schema_io, "garment_ids", lambda: None)
    assert check_output_contract(analysis) == []


def test_recommendation_plan_fields(analysis):
    a = copy.deepcopy(analysis)
    a["recommendations"][0]["time_to_effect"] = "someday"
    assert any("time_to_effect" in e for e in validate_analysis(a))
    analysis["recommendations"][0]["pairs_with"] = ["r1", "r42"]
    assert any("pairs_with: unknown or self ids r1, r42" in e for e in check_output_contract(analysis))


def _quick(analysis):
    cited = {o for s in analysis["feature_signature"] for o in s["observation_ids"]}
    obs = [o for o in analysis["observations"] if o["id"] in cited][:8]
    return {"summary_zh": analysis["profile_summary"]["one_liner"], "feature_signature": analysis["feature_signature"],
            "observations": obs}


def test_quick_schema_and_contract(analysis):
    q = _quick(analysis)
    assert validate_quick(q) == [] and check_quick_contract(q) == []
    q["feature_signature"][0]["observation_ids"] = ["o13"]   # not among the included observations
    assert any("o13" in e for e in check_quick_contract(q))
    q["summary_zh"] = ""
    assert any("summary_zh" in e for e in validate_quick(q))


def test_api_response_shell(analysis):
    passport = json.loads((EX / "sample_passport.json").read_text(encoding="utf-8"))
    body = {"id": passport["passport_id"], "status": "full_ready", "stage": "done",
            "partial": {"input_quality": passport["input_quality"], "anchors": passport["anchors"],
                        "quick": _quick(analysis), "analysis": "ready", "previews": []},
            "passport": passport,
            "entitlement": {"paid": False, "unlock_scope": "free", "share_token": None, "free_previews_left": 1,
                            "price_cny": 139, "locked": []},
            "media": {"front": None, "thumb": None, "expires_at": None, "expired": True},
            "error": None, "created_at": passport["created_at"]}
    assert validate_api_response(body) == []
    body["entitlement"]["paid"] = "yes"
    assert any("entitlement/paid" in e for e in validate_api_response(body))
