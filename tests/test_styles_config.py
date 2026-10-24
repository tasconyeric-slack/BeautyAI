"""Keep the editorial style catalog safe and usable by the V2 rules layer."""

import re
from pathlib import Path

import pytest
import yaml

CONFIG = Path(__file__).resolve().parents[1] / "config"
STYLE_NAMES = {
    "sweet": "少女型",
    "boyish": "少年型",
    "modern": "前卫型",
    "elegant": "优雅型",
    "classic": "古典型",
    "natural": "自然型",
    "romantic": "浪漫型",
    "dramatic": "戏剧型",
}
PRESENTATIONS = ("feminine", "masculine", "neutral")
RULE_FIELDS = {"fabric", "silhouette", "pattern", "accessories", "neckline", "hair_hint", "makeup_hint"}
OVERRIDE_FIELDS = {"silhouette", "accessories", "hair_hint", "makeup_hint"}
# A regression guard for common brand leakage, alongside the brand-free editorial review.
BRANDS = (
    "香奈儿", "迪奥", "古驰", "普拉达", "爱马仕", "路易威登", "巴宝莉", "优衣库", "无印良品",
    "耐克", "阿迪达斯", "李宁", "安踏", "特步", "波司登", "chanel", "dior", "gucci", "prada",
    "hermes", "hermès", "louis vuitton", "burberry", "uniqlo", "muji", "nike", "adidas", "zara",
    "lululemon", "balenciaga", "celine", "fendi", "h&m",
)


@pytest.fixture(scope="module")
def catalog():
    path = CONFIG / "styles.yaml"
    assert path.is_file(), "K1 requires config/styles.yaml"
    return yaml.safe_load(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def rules():
    return yaml.safe_load((CONFIG / "rules.yaml").read_text(encoding="utf-8"))


def _assert_chinese_text(text):
    assert isinstance(text, str) and text == text.strip() and text
    assert re.search(r"[\u4e00-\u9fff]", text), text
    assert not re.search(r"TODO|TBD|待补|示例[一二三123]|……|\.\.\.", text, re.IGNORECASE), text


def _assert_text_list(values, minimum=1):
    assert isinstance(values, list) and len(values) >= minimum
    assert len(values) == len(set(values)), "Repeated guidance adds no usable choices"
    for value in values:
        _assert_chinese_text(value)


def _copy_strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for nested in value.values():
            yield from _copy_strings(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from _copy_strings(nested)


def test_styles_catalog_is_available():
    assert (CONFIG / "styles.yaml").is_file(), "K1 requires config/styles.yaml"


def test_catalog_version_and_labels_match_the_eight_prototypes(catalog, rules):
    assert set(catalog) == {"version", "styles"}
    assert type(catalog["version"]) is int and catalog["version"] == 1
    assert set(catalog["styles"]) == set(STYLE_NAMES) == set(rules["style_labels"]["prototypes"])
    assert {key: style["name_zh"] for key, style in catalog["styles"].items()} == STYLE_NAMES


@pytest.mark.parametrize("style_key", STYLE_NAMES)
def test_style_has_complete_chinese_rules(catalog, style_key):
    style = catalog["styles"][style_key]
    assert set(style) == {
        "name_zh", "summary_zh", "keywords_zh", "rules_zh", "by_presentation", "transitions_to",
    }
    _assert_chinese_text(style["summary_zh"])
    _assert_text_list(style["keywords_zh"], minimum=2)
    assert set(style["rules_zh"]) == RULE_FIELDS
    for text in style["rules_zh"].values():
        _assert_chinese_text(text)


@pytest.mark.parametrize("style_key", STYLE_NAMES)
def test_each_presentation_has_distinct_outfits_and_effective_rules(catalog, style_key):
    style = catalog["styles"][style_key]
    assert set(style["by_presentation"]) == set(PRESENTATIONS)
    examples = []
    hair_hints = []
    makeup_hints = []
    for presentation in PRESENTATIONS:
        entry = style["by_presentation"][presentation]
        assert set(entry) == {"examples_zh", "avoid_zh", "rules_zh"}
        assert len(entry["examples_zh"]) == 3
        _assert_text_list(entry["examples_zh"], minimum=3)
        _assert_text_list(entry["avoid_zh"])
        # Each example is a concrete formula with at least two named pieces.
        assert all(" + " in outfit for outfit in entry["examples_zh"])
        assert set(entry["rules_zh"]) == OVERRIDE_FIELDS
        effective_rules = style["rules_zh"] | entry["rules_zh"]
        assert set(effective_rules) == RULE_FIELDS
        for text in effective_rules.values():
            _assert_chinese_text(text)
        examples.extend(entry["examples_zh"])
        hair_hints.append(effective_rules["hair_hint"])
        makeup_hints.append(effective_rules["makeup_hint"])
    assert len(set(examples)) == 9
    assert len(set(hair_hints)) == len(set(makeup_hints)) == 3


@pytest.mark.parametrize("style_key", STYLE_NAMES)
def test_transitions_include_two_nearest_plane_neighbors(catalog, rules, style_key):
    prototypes = rules["style_labels"]["prototypes"]
    origin = prototypes[style_key]
    distances = {
        key: sum((origin[axis] - point[axis]) ** 2 for axis in ("visual_weight", "angular_rounded"))
        for key, point in prototypes.items() if key != style_key
    }
    # Include ties at the second-nearest distance; no second geometry is hard-coded here.
    cutoff = sorted(distances.values())[1]
    adjacent = {key for key, distance in distances.items() if distance <= cutoff + 1e-9}
    transitions = catalog["styles"][style_key]["transitions_to"]
    assert isinstance(transitions, dict) and len(transitions) >= 2
    assert set(transitions) <= set(distances), "Transitions must target another known style"
    assert len(set(transitions) & adjacent) >= 2
    for transition in transitions.values():
        assert set(transition) == {"keep_zh", "add_zh"}
        _assert_text_list(transition["keep_zh"])
        _assert_text_list(transition["add_zh"])
        assert set(transition["keep_zh"]).isdisjoint(transition["add_zh"])


def test_all_copy_avoids_configured_safety_terms_and_appearance_judgments(catalog, rules):
    terms = [term for group in rules["safety_terms"].values() for term in group]
    terms += ["标准脸", "完美", "显瘦", "变美", "逆袭"]
    for text in _copy_strings(catalog["styles"]):
        for term in terms:
            assert term.casefold() not in text.casefold(), f"Unsafe copy {term!r}: {text}"


def test_copy_uses_generic_items_without_brands_or_shopping_links(catalog):
    for text in _copy_strings(catalog["styles"]):
        for brand in BRANDS:
            assert brand.casefold() not in text.casefold(), f"Brand {brand!r}: {text}"
        assert not re.search(r"https?://|www\.", text, re.IGNORECASE), text
