"""K3 catalog contract, content coverage, and the original MIT catalog snapshot."""

import hashlib
import json
import re
from pathlib import Path

import pytest

from aesthetic_passport.rules import load_catalog

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / "config/hairstyles.json").read_text(encoding="utf-8"))
STYLES = CATALOG["styles"]
ORIGINAL_IDS = (
    "classic_buzz", "tapered_crew", "textured_crop", "classic_side_part", "soft_quiff",
    "low_pompadour", "french_crop", "curtain_fringe", "caesar_cut", "slick_back_taper",
    "rounded_afro_taper", "short_curl_taper", "long_soft_layers", "textured_pixie",
    "disconnected_undercut",
)
ORIGINAL_FIELDS = {
    "id", "name", "name_zh", "face_shapes", "length", "fade", "textures", "maintenance",
    "params_mm", "fringe", "top_volume",
}
PRESENTATIONS = {"feminine", "masculine", "androgynous"}
TEXTURES = {"straight", "wavy", "curly", "coily"}
DENSITIES = {"low", "medium", "high"}
LENGTHS = {"shaved", "very_short", "short", "medium", "long"}
FEMININE_LENGTHS = {"chin", "collarbone", "shoulder", "chest"}
FRINGES = {"none", "air", "curtain", "blunt", "side"}
CURLS = {"straight", "c_curl", "french_wave", "wool"}
TIERS = {"safe", "bold", "easy"}
FORBIDDEN_COPY = re.compile("颜值|打分|标准脸|完美|缺陷|显胖|显瘦|整容|医美|治疗|民族|人种")


def test_catalog_size_and_feminine_priority():
    assert len(STYLES) >= 60
    assert sum("feminine" in style["presentation"] for style in STYLES) >= 35
    assert len({style["id"] for style in STYLES}) == len(STYLES)
    assert load_catalog() == STYLES


def test_original_catalog_fields_and_mit_attribution_are_unchanged():
    # Snapshot of all 15 actual baseline entries at e86c1b4, before K3 additions.
    # Project each entry onto its original keys so additive enrichment remains allowed.
    assert tuple(style["id"] for style in STYLES[:len(ORIGINAL_IDS)]) == ORIGINAL_IDS
    originals = []
    for style in STYLES[:len(ORIGINAL_IDS)]:
        fields = ORIGINAL_FIELDS | ({"presentations"} if style["id"] == "textured_pixie" else set())
        originals.append({key: style[key] for key in fields})
    canonical = json.dumps(originals, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    assert hashlib.sha256(canonical.encode()).hexdigest() == (
        "159d94024dc5a21ae5300710d892d5885a2c74048f9c2a7f7b445adf86283392"
    )
    assert hashlib.sha256(CATALOG["_source"].encode()).hexdigest() == (
        "aee42ce076e2ad5d9ec677d2b5939c2ba00cf6f0d8f85662387a2645614b6ca8"
    )
    assert (ROOT / "config/hairstyles.LICENSE").is_file()


@pytest.mark.parametrize("style", STYLES, ids=lambda style: style["id"])
def test_style_fields_and_enums(style):
    assert re.fullmatch(r"[a-z][a-z0-9_]*", style["id"])
    assert style["name"].strip() and re.search(r"[\u4e00-\u9fff]", style["name_zh"])
    assert style["length"] in LENGTHS
    assert style["fade"] in {"none", "low", "mid", "high", "taper"}
    assert style["top_volume"] in {"low", "moderate", "high"}
    assert style["maintenance"] in {"low", "medium", "high"}
    assert type(style["fringe"]) is bool
    assert style["face_shapes"] and set(style["face_shapes"]) <= {
        "oval", "round", "square", "oblong", "heart", "diamond",
    }
    assert style["textures"] and set(style["textures"]) <= TEXTURES | {"all"}
    assert set(style["params_mm"]) == {"top", "side", "back"}
    assert all(type(value) is int and 0 <= value <= 1000 for value in style["params_mm"].values())
    for field, choices in (
        ("presentation", PRESENTATIONS), ("texture_fit", TEXTURES),
        ("density_fit", DENSITIES), ("tier_bias", TIERS),
    ):
        values = style[field]
        assert isinstance(values, list) and values
        assert len(values) == len(set(values)) and set(values) <= choices
    if "presentations" in style:
        assert style["presentations"] == style["presentation"]
    if style["id"] not in ORIGINAL_IDS:
        # V1 rules still read this plural key for presentation filtering.
        assert style["presentations"] == style["presentation"]
    expected_textures = TEXTURES if "all" in style["textures"] else set(style["textures"])
    assert set(style["texture_fit"]) == expected_textures
    assert style["length_band"] in FEMININE_LENGTHS | LENGTHS
    if "feminine" in style["presentation"] and style["id"] != "textured_pixie":
        assert style["length_band"] in FEMININE_LENGTHS
    # The preserved pixie remains short; do not mislabel it as chin-length.
    if style["id"] == "textured_pixie":
        assert style["length_band"] == "short"
    assert style["fringe_type"] in FRINGES
    assert style["fringe"] == (style["fringe_type"] != "none")
    assert style["curl"] in CURLS
    assert type(style["maintenance_min_per_day"]) is int and 0 <= style["maintenance_min_per_day"] <= 30
    assert type(style["trim_weeks"]) is int and 2 <= style["trim_weeks"] <= 24
    price = style["price_band_cny"]
    assert isinstance(price, list) and len(price) == 2
    assert all(type(value) is int for value in price) and 0 < price[0] <= price[1] <= 3000
    assert type(style["needs_perm"]) is bool and type(style["needs_dye"]) is bool
    if "easy" in style["tier_bias"]:
        assert style["maintenance_min_per_day"] <= 3
    if style["curl"] != "straight" and not style["needs_perm"]:
        assert "straight" not in style["texture_fit"] or style["maintenance_min_per_day"] >= 5


@pytest.mark.parametrize("style", STYLES, ids=lambda style: style["id"])
def test_chinese_aliases_and_three_useful_salon_sentences(style):
    aliases = style["aliases_zh"]
    assert isinstance(aliases, list) and aliases and len(set(aliases)) == len(aliases)
    assert all(isinstance(alias, str) and re.search(r"[\u4e00-\u9fff]", alias) for alias in aliases)
    script = style["barber_script_zh"]
    assert isinstance(script, list) and len(script) == 3 and len(set(script)) == 3
    assert all(isinstance(line, str) and 10 <= len(line) <= 100 and line.endswith("。") for line in script)
    assert not FORBIDDEN_COPY.search(" ".join([style["name_zh"], *aliases, *script]))


def test_feminine_options_cover_lengths_fringes_curls_and_low_upkeep():
    feminine = [style for style in STYLES if "feminine" in style["presentation"]]
    for length in FEMININE_LENGTHS:
        options = [style for style in feminine if style["length_band"] == length]
        assert {style["fringe_type"] for style in options} == FRINGES
        assert {style["curl"] for style in options} == CURLS
        assert set().union(*(set(style["texture_fit"]) for style in options)) == TEXTURES
        assert set().union(*(set(style["density_fit"]) for style in options)) == DENSITIES
        assert any("easy" in style["tier_bias"] for style in options)
    assert set().union(*(set(style["tier_bias"]) for style in feminine)) == TIERS
    assert any(style["needs_perm"] for style in feminine)
    assert any(not style["needs_perm"] and not style["needs_dye"] for style in feminine)
    assert len({tuple(style["barber_script_zh"]) for style in STYLES}) == len(STYLES)
