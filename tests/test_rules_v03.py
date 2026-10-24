"""Rules v0.3 (T03): style profile, feedback rerank, hair option checks, glasses size, plan, outfit checks."""
import copy
import json
import time
from pathlib import Path

import pytest

from aesthetic_passport import styling
from aesthetic_passport.assemble import complete_user_context
from aesthetic_passport.rules import derive, load_rules

EX = Path(__file__).resolve().parents[1] / "examples"


@pytest.fixture
def analysis():
    return json.loads((EX / "sample_analysis.json").read_text(encoding="utf-8"))


@pytest.fixture
def ctx():
    c = json.loads((EX / "sample_context.json").read_text(encoding="utf-8"))
    c["user_context"] = complete_user_context(c["user_context"])
    return c


def _d(analysis, ctx, events=(), uc=None, **kw):
    return derive(analysis, ctx["anchors"], ctx["input_quality"], uc or ctx["user_context"], load_rules(),
                  ctx["color_measurements"], events, **kw)


def ev(t, tid, r, reasons=(), ts="2026-10-22T10:00:00+00:00"):
    return {"target_type": t, "target_id": tid, "reaction": r, "reason_tags": list(reasons), "ts": ts}


def test_derive_is_deterministic(analysis, ctx):
    events = [ev("recommendation", "r3", "dislike"), ev("style", "romantic", "target")]
    a = json.dumps(_d(analysis, ctx, events), ensure_ascii=False, sort_keys=True)
    b = json.dumps(_d(analysis, ctx, events), ensure_ascii=False, sort_keys=True)
    assert a == b


def test_feedback_never_touches_analysis_or_face_only(analysis, ctx):
    before = json.dumps(analysis, sort_keys=True)
    base = _d(analysis, ctx)
    events = [ev("style", "elegant", "dislike", ["不像我"]), ev("style", "dramatic", "target"),
              ev("recommendation", "r1", "dislike", ["不像我"])]
    after = _d(analysis, ctx, events, derived_version=2)
    assert json.dumps(analysis, sort_keys=True) == before
    assert after["style_profile"]["face_only"] == base["style_profile"]["face_only"]
    assert after["style_profile"]["preference_overlay"]["target"] == "dramatic"
    assert after["derived_version"] == 2


def test_dislike_demotes_like_boosts_hide_reason_hides(analysis, ctx):
    base = [r["rec_id"] for r in _d(analysis, ctx)["ranked_recommendations"]]
    assert base[0] == "r1"
    demoted = [r["rec_id"] for r in _d(analysis, ctx, [ev("recommendation", "r1", "dislike")])["ranked_recommendations"]]
    assert demoted.index("r1") > 0
    d = _d(analysis, ctx, [ev("recommendation", "r1", "dislike", ["超出预算"])])
    assert "r1" not in [r["rec_id"] for r in d["ranked_recommendations"]]
    assert {"rec_id": "r1", "reason": "user_hidden"} in d["excluded_recommendations"]
    assert d["feedback_applied"]["note_zh"].startswith("已按你的 1 条反馈调整")
    boosted = _d(analysis, ctx, [ev("recommendation", "r4", "like")])
    assert [r["rec_id"] for r in boosted["ranked_recommendations"]].index("r4") < base.index("r4")


def test_last_event_wins(analysis, ctx):
    events = [ev("recommendation", "r1", "dislike", ts="2026-10-22T10:00:00+00:00"),
              ev("recommendation", "r1", "like", ts="2026-10-22T10:05:00+00:00")]
    d = _d(analysis, ctx, events)
    assert d["feedback_applied"]["changes"] == [{"target_type": "recommendation", "target_id": "r1", "effect": "boosted"}]


def test_body_frame_moves_overall_not_face_only(analysis, ctx):
    uc = copy.deepcopy(ctx["user_context"])
    uc["body"] = {"frame": "straight", "height_cm": 172}
    d = _d(analysis, ctx, uc=uc)
    sp = d["style_profile"]
    assert sp["face_only"] == {"x": 2.9, "y": 0.7}
    assert sp["overall"]["x"] > sp["face_only"]["x"] and sp["overall"]["y"] < sp["face_only"]["y"]


def test_style_names_unified_across_presentations(analysis, ctx):
    names = set()
    for pres in ("feminine", "masculine", "androgynous"):
        uc = dict(ctx["user_context"], presentation=pres)
        names.add(json.dumps(_d(analysis, ctx, uc=uc)["style_profile"]["names_zh"], ensure_ascii=False))
    assert len(names) == 1 and "前卫型" in names.pop()


def test_styles_yaml_missing_gives_empty_rules(analysis, ctx, monkeypatch):
    monkeypatch.setattr(styling, "load_styles", dict)
    assert _d(analysis, ctx)["style_profile"]["rules_zh"] == {}


def test_hair_checks_constraints_and_feedback(analysis, ctx):
    checks = {c["tier"]: c for c in _d(analysis, ctx)["hair_option_checks"]}
    assert all(c["status"] == "ok" for c in checks.values())
    assert checks["safe"]["catalog_ids"]
    uc = copy.deepcopy(ctx["user_context"])
    uc["constraints"]["accepts_perm"] = False          # the bold direction needs a perm
    c2 = _d(analysis, ctx, uc=uc)["hair_option_checks"]
    assert c2[-1]["tier"] == "bold" and c2[-1]["status"] == "excluded" and "烫发" in c2[-1]["issues"][0]
    uc["constraints"]["accepts_perm"] = True
    uc["constraints"]["daily_minutes"] = 5
    warn = {c["tier"]: c for c in _d(analysis, ctx, uc=uc)["hair_option_checks"]}
    assert warn["safe"]["status"] == "warn" and warn["easy"]["status"] == "ok"
    liked = _d(analysis, ctx, [ev("hair_option", "easy", "like"), ev("hair_option", "safe", "dislike")])
    assert liked["hair_option_checks"][0]["tier"] == "easy"


def test_hair_difference_check(analysis, ctx):
    an = copy.deepcopy(analysis)
    an["hair_options"][2]["params"].update(length="collarbone", fringe="air", curl="c_curl")  # easy == safe
    checks = {c["tier"]: c for c in _d(an, ctx)["hair_option_checks"]}
    assert checks["easy"]["status"] == "warn" and any("差别不大" in i for i in checks["easy"]["issues"])


def test_glasses_size_from_iris_scale(analysis, ctx):
    g = _d(analysis, ctx)["glasses_size"]
    # 252 px cheekbones × 11.7 / 22 px iris = 134 mm → 130–138 mm
    assert g["method"] == "iris_scale" and g["total_width_mm"] == [130, 138]
    assert g["bridge_mm"] == [19, 21] and g["lens_width_mm"][0] < g["lens_width_mm"][1]
    anchors = dict(ctx["anchors"], iris_px=None)
    g2 = derive(analysis, anchors, ctx["input_quality"], ctx["user_context"], load_rules())["glasses_size"]
    assert g2["method"] == "relative" and g2["total_width_mm"] is None and "颧骨同宽" in g2["note_zh"]


def test_plan_columns_trace_back(analysis, ctx):
    d = _d(analysis, ctx)
    recs = {r["id"]: r for r in analysis["recommendations"]}
    items = [i for col in d["plan"].values() for i in col]
    assert items and all(i["evidence"] == recs[i["rec_id"]]["evidence"] for i in items)
    assert {i["rec_id"] for i in d["plan"]["next_haircut"]} == {"r1"}
    assert all(p in recs for i in items for p in i["pairs_with"])


def test_outfit_checks_caution_color_near_face(analysis, ctx):
    an = copy.deepcopy(analysis)
    an["outfit_direction"]["items"][0].update(color_name="芥末黄", hex="#C9A227")   # caution color on a blouse
    items = {i["garment_id"]: i for i in _d(an, ctx)["outfit_checks"]["items"]}
    assert items["tie_neck_silk_blouse"]["status"] == "excluded"
    assert items["boat_neck_fine_knit"]["search_zh"].startswith("灰粉")


def test_outfit_checks_skip_without_catalog(analysis, ctx, monkeypatch):
    monkeypatch.setattr(styling, "load_garments", lambda: None)
    assert _d(analysis, ctx)["outfit_checks"] == {"status": "skipped", "frame_used": None, "items": []}


def test_rerank_p95_under_500ms(analysis, ctx):
    events = [ev("recommendation", f"r{i}", "dislike") for i in range(1, 4)] + [ev("style", "classic", "target")]
    times = []
    for _ in range(100):
        t0 = time.perf_counter()
        _d(analysis, ctx, events)
        times.append(time.perf_counter() - t0)
    assert sorted(times)[94] < 0.5


def test_style_guide_examples_and_transition(analysis, ctx):
    g = _d(analysis, ctx)["style_profile"]["guide"]
    assert g["summary_zh"] and len(g["examples_zh"]) == 3 and g["transition"] is None
    g2 = _d(analysis, ctx, [ev("style", "classic", "target")])["style_profile"]["guide"]
    assert g2["transition"]["to"] == "classic" and g2["transition"]["keep_zh"] and g2["transition"]["add_zh"]
    male = dict(ctx["user_context"], presentation="masculine")
    assert _d(analysis, ctx, uc=male)["style_profile"]["guide"]["examples_zh"] != g["examples_zh"]
