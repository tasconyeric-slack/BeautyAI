"""Guard the searchable garment ontology consumed by V2 outfit recommendations."""

import re
from collections import Counter
from pathlib import Path
from string import Formatter

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "config" / "garments.yaml"
STYLES = {"sweet", "boyish", "modern", "elegant", "classic", "natural", "romantic", "dramatic"}
CATEGORIES = {"top", "bottom", "outer", "dress", "shoes", "bag", "accessory"}
FRAMES = {"straight", "wave", "natural"}
PRESENTATIONS = {"feminine", "masculine", "neutral"}
COLOR_SLOTS = {"near_face", "base", "accent"}
OCCASIONS = {"commute", "date", "formal", "casual"}
FIELDS = {
    "id", "category", "name_zh", "silhouette", "fabric", "neckline", "styles", "frames",
    "presentations", "color_slot", "occasions", "search_tpl",
}


def test_catalog_exists():
    assert CATALOG.is_file(), "V2 needs a committed config/garments.yaml catalog"


@pytest.fixture(scope="module")
def garments():
    catalog = yaml.safe_load(CATALOG.read_text(encoding="utf-8"))
    assert isinstance(catalog, dict) and set(catalog) == {"garments"}
    assert isinstance(catalog["garments"], list)
    return catalog["garments"]


def test_catalog_has_at_least_150_distinct_searchable_items(garments):
    assert len(garments) >= 150
    ids = [item["id"] for item in garments]
    names = [item["name_zh"] for item in garments]
    assert len(set(ids)) == len(ids), "garment IDs must stay unique for outfit_direction references"
    assert len(set(names)) == len(names), "do not pad the catalog with renamed copies of one item"


def test_records_have_the_required_fields_and_chinese_search_details(garments):
    for item in garments:
        assert isinstance(item, dict) and set(item) == FIELDS, item
        assert re.fullmatch(r"[a-z][a-z0-9]*(?:_[a-z0-9]+)*", item["id"]), item
        for field in ("name_zh", "silhouette", "fabric"):
            value = item[field]
            assert isinstance(value, str) and value == value.strip() and value, (item["id"], field)
            assert re.search(r"[\u4e00-\u9fff]", value), (item["id"], field)
        assert item["neckline"] is None or (
            isinstance(item["neckline"], str) and item["neckline"].strip() == item["neckline"]
            and re.search(r"[\u4e00-\u9fff]", item["neckline"])
        ), item["id"]


def test_record_enums_are_valid_nonempty_and_unambiguous(garments):
    for item in garments:
        assert item["category"] in CATEGORIES, item["id"]
        assert item["color_slot"] in COLOR_SLOTS, item["id"]
        for field, allowed in (
            ("styles", STYLES), ("frames", FRAMES), ("presentations", PRESENTATIONS), ("occasions", OCCASIONS),
        ):
            values = item[field]
            assert isinstance(values, list) and values, (item["id"], field)
            assert len(values) == len(set(values)), (item["id"], field)
            assert set(values) <= allowed, (item["id"], field)


@pytest.mark.parametrize("presentation,minimum", [("feminine", 15), ("masculine", 8), ("neutral", 8)])
def test_each_style_has_enough_items_for_each_presentation(garments, presentation, minimum):
    counts = Counter(
        style for item in garments if presentation in item["presentations"] for style in item["styles"]
    )
    assert all(counts[style] >= minimum for style in STYLES), dict(counts)


def test_catalog_covers_outfit_categories_materials_and_contexts(garments):
    assert {item["category"] for item in garments} == CATEGORIES
    assert {item["color_slot"] for item in garments} == COLOR_SLOTS
    assert {frame for item in garments for frame in item["frames"]} == FRAMES
    assert {occasion for item in garments for occasion in item["occasions"]} == OCCASIONS
    # The catalog should support materially different outfits, not color variants of one fabric.
    assert len({item["fabric"] for item in garments}) >= 15
    for item in garments:
        if item["category"] in {"bottom", "shoes", "bag", "accessory"}:
            assert item["neckline"] is None, item["id"]
        else:
            assert item["neckline"] is not None, item["id"]


@pytest.mark.parametrize("color", ["雾蓝色", "柠檬黄", "丁香紫", "海盐蓝（浅色）"])
def test_search_templates_expand_with_arbitrary_color_names(garments, color):
    for item in garments:
        template = item["search_tpl"]
        assert isinstance(template, str) and template.strip() == template, item["id"]
        fields = set()
        for _, field, format_spec, conversion in Formatter().parse(template):
            if field is not None:
                assert not format_spec and conversion is None, item["id"]
                fields.add(field)
        assert {"color", "fabric", "name"} <= fields <= {"color", "fabric", "name", "silhouette"}, item["id"]
        search = template.format(color=color, fabric=item["fabric"], name=item["name_zh"], silhouette=item["silhouette"])
        assert color in search and item["name_zh"] in search and item["fabric"] in search, item["id"]
        assert "{" not in search and "}" not in search and "None" not in search, item["id"]


def test_catalog_copy_is_brand_free_and_avoids_prohibited_terms(garments):
    safety = yaml.safe_load((ROOT / "config" / "rules.yaml").read_text(encoding="utf-8"))["safety_terms"]
    prohibited = {term.casefold() for terms in safety.values() for term in terms}
    prohibited.update({"完美", "标准脸", "遮肉", "显瘦", "变美", "逆袭"})
    # Common marketplace brand terms are a regression guard; catalog copy is also manually reviewed.
    brands = {"优衣库", "无印良品", "香奈儿", "迪奥", "阿迪达斯", "耐克", "古驰", "普拉达", "zara", "uniqlo"}
    for item in garments:
        copy = " ".join(item[field] or "" for field in ("name_zh", "silhouette", "fabric", "neckline", "search_tpl"))
        copy = copy.casefold()
        assert not {term for term in prohibited | brands if term in copy}, item["id"]


def test_generated_web_garment_catalog_is_in_sync():
    """web/lib/generated/garments.json (outfit boards) is exported from config/garments.yaml by `make types`."""
    import importlib.util
    import json

    spec = importlib.util.spec_from_file_location("export_web_config", ROOT / "scripts" / "export_web_config.py")
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    generated = json.loads((ROOT / "web" / "lib" / "generated" / "garments.json").read_text(encoding="utf-8"))
    assert generated == mod.garment_catalog(), "run `make types`"
