"""Facial feature atlas catalog (Issue #32, D39): config/face_atlas.yaml stays consistent with the measurement registry,
the rules layer and the analysis schema, and its copy stays inside the scope guard (invariant 5)."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest
import yaml

from aesthetic_passport.face_metrics.points import all_point_names
from aesthetic_passport.face_metrics.profile import SIDE_POINTS

ROOT = Path(__file__).resolve().parents[1]
ATLAS = yaml.safe_load((ROOT / "config" / "face_atlas.yaml").read_text(encoding="utf-8"))
REGISTRY = yaml.safe_load((ROOT / "config" / "face_metrics.yaml").read_text(encoding="utf-8"))
RULES = yaml.safe_load((ROOT / "config" / "rules.yaml").read_text(encoding="utf-8"))
ANALYSIS = json.loads((ROOT / "schema" / "analysis.schema.json").read_text(encoding="utf-8"))

METRICS = {m["id"]: m for m in REGISTRY["metrics"]}
REGIONS = ATLAS["regions"]
BANDS = RULES["measurement_bands"]
INSIGHTS = RULES["measurement_insights"]["metrics"]
STATUSES = {"measured", "observed", "deferred", "unsupported"}


def _strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for v in node.values():
            yield from _strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from _strings(v)


def _band_label(mid: str, band: str) -> str | None:
    """The rules layer's label for this band of this metric, or None when that band is never produced."""
    if mid in INSIGHTS:
        spec = INSIGHTS[mid]
        if band == "typical":
            return (spec.get("typical") or {}).get("label_zh") or BANDS["typical_zh"]
        return (spec.get(band) or {}).get("label_zh")
    if mid in BANDS:
        lo_label, hi_label = BANDS[mid][3], BANDS[mid][4]
        return {"low": lo_label or None, "high": hi_label or None, "typical": BANDS["typical_zh"]}[band]
    return None


def test_twelve_regions_with_unique_keys():
    keys = [r["key"] for r in REGIONS]
    assert len(keys) == 12
    assert len(set(keys)) == 12
    for r in REGIONS:
        assert r["name_zh"] and r["about_zh"] and r["view"] in ("front", "side")
        assert r["concepts"], f"{r['key']} maps no benchmark concept"


def test_every_registry_metric_belongs_to_exactly_one_region():
    owner: dict[str, str] = {}
    for r in REGIONS:
        for mid in r["metrics"]:
            assert mid in METRICS, f"{r['key']}: unknown metric {mid}"
            assert mid not in owner, f"{mid} is in both {owner[mid]} and {r['key']}"
            owner[mid] = r["key"]
    assert set(owner) == set(METRICS), f"unassigned: {sorted(set(METRICS) - set(owner))}"


def test_references_resolve():
    analysis_regions = set(ANALYSIS["$defs"]["region"]["enum"])
    features = set(ANALYSIS["properties"]["feature_characteristics"]["items"]["properties"]["feature"]["enum"])
    keys = {r["key"] for r in REGIONS}
    catalog = set(REGISTRY["catalog_status"]) | set(METRICS)
    front_points = all_point_names()
    for r in REGIONS:
        own = set(r["metrics"]) | set(r["related"])
        assert set(r["related"]) <= set(METRICS)
        assert set(r["focus"]) <= own, f"{r['key']}: focus outside the region"
        assert set(r["observation_regions"]) <= analysis_regions
        assert set(r["signature_regions"]) <= analysis_regions
        assert set(r["features"]) <= features
        allowed = set(SIDE_POINTS) if r["view"] == "side" else front_points
        assert set(r["crop"]["points"]) <= allowed, f"{r['key']}: unknown crop point"
        assert r["crop"].get("extend") in (None, "top", "bottom")
        for c in r["concepts"]:
            assert c["status"] in STATUSES, c
            if c["status"] == "measured":
                assert c.get("metrics") and set(c["metrics"]) <= set(METRICS), c
            if c.get("catalog"):
                assert c["catalog"] in catalog, c
            if c["status"] in ("deferred", "unsupported"):
                assert c.get("note_zh"), f"{r['key']}/{c['zh']}: say why"
    for rel in ATLAS["relations"]:
        assert rel["metric"] in METRICS
        assert len(rel["regions"]) == 2 and set(rel["regions"]) <= keys
        assert _band_label(rel["metric"], "typical"), f"{rel['metric']} has no rules-layer assessment"


def test_side_region_only_uses_side_metrics_and_front_regions_draw_front_metrics():
    for r in REGIONS:
        for mid in r["focus"]:
            view = METRICS[mid]["view"]
            assert (view == "side") == (r["view"] == "side"), f"{r['key']}: {mid} is drawn on another photo"


def test_cues_target_bands_the_rules_layer_actually_produces():
    areas = RULES["measurement_insights"]["areas"]
    for r in REGIONS:
        own = set(r["metrics"]) | set(r["related"])
        seen = set()
        for c in r["cues"]:
            assert c["metric"] in own, f"{r['key']}: cue on a metric outside the region"
            assert c["band"] in ("low", "typical", "high")
            assert c["area"] in areas
            assert (c["metric"], c["band"]) not in seen
            seen.add((c["metric"], c["band"]))
            label = _band_label(c["metric"], c["band"])
            assert label, f"{c['metric']}/{c['band']} is never produced by the rules layer"
            assert c["text_zh"].strip()


def test_facial_categories_are_analysis_categories():
    cats = set(ANALYSIS["$defs"]["observation"]["properties"]["category"]["enum"])
    assert set(ATLAS["facial_observation_categories"]) <= cats
    assert not {"clothing", "photo", "glasses"} & set(ATLAS["facial_observation_categories"])


def test_copy_stays_inside_the_scope_guard():
    terms = [t for group in RULES["safety_terms"].values() for t in group]
    terms += ["完美", "标准脸", "理想", "缺陷", "男性化", "女性化"]
    for s in _strings({k: v for k, v in ATLAS.items() if k != "benchmark"}):
        for t in terms:
            assert t.lower() not in s.lower(), f"forbidden term {t!r} in {s!r}"


def test_generated_web_copy_is_in_sync():
    spec = importlib.util.spec_from_file_location("export_web_config", ROOT / "scripts" / "export_web_config.py")
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    generated = json.loads((ROOT / "web" / "lib" / "generated" / "face-atlas.json").read_text(encoding="utf-8"))
    assert generated == mod.face_atlas(RULES), "run `make types`"


@pytest.mark.parametrize("fixture", ["sample_passport.json", "sample_male_passport.json"])
def test_every_adequately_observed_region_has_a_trait_and_an_implication(fixture):
    """Acceptance: each region the sample photos show gets at least one trait and one styling implication from data
    already in the passport (rules advice, the model's recommendations / signature, or a band-keyed cue)."""
    p = json.loads((ROOT / "examples" / fixture).read_text(encoding="utf-8"))
    metrics = {m["id"]: m for m in p["measurement_profile"]["metrics"]}
    mi = p["derived"]["measurement_insights"]
    assessed = {a["metric_id"]: a for a in mi["assessments"]}
    insight_ids = {i["metric_id"] for i in mi["items"] if i["advice"]}
    obs = p["analysis"]["observations"]
    recs = p["analysis"]["recommendations"]
    sigs = p["analysis"]["feature_signature"]
    for r in REGIONS:
        own = set(r["metrics"]) | set(r["related"])
        measured = [m for m in own if metrics.get(m, {}).get("availability") == "measured"]
        observed = [o for o in obs if o["region"] in r["observation_regions"]]
        facial = [o for o in observed if o["category"] in ATLAS["facial_observation_categories"]]
        if not measured and not facial:
            continue  # not observable in these photos: the atlas says so instead of inventing
        obs_ids = {o["id"] for o in observed}
        has_implication = (
            bool(own & insight_ids)
            or any(set(x["evidence"]) & obs_ids for x in recs)
            or any(s["region"] in r["signature_regions"] or set(s["observation_ids"]) & obs_ids for s in sigs)
            or any(c["metric"] in assessed and assessed[c["metric"]]["band"] == c["band"]
                   and metrics[c["metric"]].get("confidence") != "low" for c in r["cues"])
        )
        assert has_implication, f"{fixture}: region {r['key']} has evidence but no styling implication"
