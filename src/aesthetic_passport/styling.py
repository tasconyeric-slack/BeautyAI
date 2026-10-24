"""Rules layer v0.3 — the styling blocks of `derived` (pure functions, no model calls).

    style_profile       eight-style plane: face_only / overall position, preference overlay, rules (D25)
    hair_option_checks  constraint filter, difference check, catalog matches, feedback-adjusted rank
    glasses_size        frame size in mm from the iris scale, else relative advice
    plan                today / next_haircut / invest columns from the ranked recommendations
    outfit_checks       near-face caution colors, style consistency, search phrases (config/garments.yaml)

Optional catalogs (config/styles.yaml, config/garments.yaml) are developed in parallel: when a file is missing the
dependent part degrades (empty rules, outfit checks `skipped`) instead of failing.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from .feedback import FeedbackWeights

ROOT = Path(__file__).resolve().parents[2]
STYLES_PATH = ROOT / "config" / "styles.yaml"
GARMENTS_PATH = ROOT / "config" / "garments.yaml"
CATALOG_PATH = ROOT / "config" / "hairstyles.json"
PRESENTATION_KEY = {"feminine": "feminine", "masculine": "masculine", "androgynous": "neutral"}


@lru_cache(maxsize=2)
def load_styles(path: str | None = None) -> dict[str, Any]:
    p = Path(path) if path else STYLES_PATH
    return (yaml.safe_load(p.read_text(encoding="utf-8")) or {}).get("styles", {}) if p.exists() else {}


@lru_cache(maxsize=2)
def load_garments(path: str | None = None) -> dict[str, dict[str, Any]] | None:
    p = Path(path) if path else GARMENTS_PATH
    if not p.exists():
        return None
    return {g["id"]: g for g in (yaml.safe_load(p.read_text(encoding="utf-8")) or {}).get("garments", [])}


@lru_cache(maxsize=2)
def load_hair_catalog(path: str | None = None) -> list[dict[str, Any]]:
    p = Path(path) if path else CATALOG_PATH
    return json.loads(p.read_text(encoding="utf-8"))["styles"]


def _clamp(v: float, lo_hi: list[float]) -> float:
    return round(max(lo_hi[0], min(lo_hi[1], v)), 3)


# ---------------------------------------------------------------------------
# Style profile
# ---------------------------------------------------------------------------
def nearest_styles(x: float, y: float, prototypes: dict[str, dict[str, float]]) -> list[tuple[float, str]]:
    return sorted((math.dist((x, y), (p["visual_weight"], p["angular_rounded"])), k) for k, p in prototypes.items())


def style_profile(analysis: dict[str, Any], user_context: dict[str, Any], cfg: dict[str, Any],
                  fw: FeedbackWeights) -> dict[str, Any]:
    sc, sp = cfg["style_labels"], cfg["style_profile"]
    dims = analysis["style_dimensions"]
    fx, fy = dims["visual_weight"]["value"], dims["angular_rounded"]["value"]
    ox, oy = fx, fy
    body = user_context.get("body") or {}
    if body.get("frame") in sp["frame_shift"]:
        dx, dy = sp["frame_shift"][body["frame"]]
        ox, oy = ox + dx, oy + dy
    h = body.get("height_cm")
    if h:
        hs = sp["height_shift"]
        ox += hs["tall_dx"] if h >= hs["tall_cm"] else hs["petite_dx"] if h <= hs["petite_cm"] else 0
    ox, oy = _clamp(ox, sp["plane_x"]), _clamp(oy, sp["plane_y"])
    conf = min(dims["visual_weight"]["confidence"], dims["angular_rounded"]["confidence"])
    (d1, k1), (d2, k2) = nearest_styles(ox, oy, sc["prototypes"])[:2]
    prefs = user_context.get("style_preferences") or {"liked": [], "disliked": []}
    liked = sorted(set(prefs["liked"]) | set(fw.style_liked))
    disliked = sorted((set(prefs["disliked"]) | set(fw.style_disliked)) - set(fw.style_liked))
    target = fw.style_target or user_context.get("target_style")
    styles = load_styles()
    rules = styles.get(k1, {}).get("rules_zh", {})
    names = sc["names_zh"]
    return {
        "face_only": {"x": round(fx, 3), "y": round(fy, 3)},
        "overall": {"x": ox, "y": oy},
        "radius": round(sp["radius_base"] + sp["radius_per_missing_conf"] * (1 - conf), 3),
        "primary": k1, "secondary": k2,
        "between": (d2 - d1) < sc["between_margin"],
        "preference_overlay": {"liked": liked, "disliked": disliked, "target": target},
        "rules_zh": {k: str(v) for k, v in rules.items()},
        "prototypes": [{"key": k, "name_zh": names[k], "x": p["visual_weight"], "y": p["angular_rounded"]}
                       for k, p in sc["prototypes"].items()],
        "names_zh": dict(names),
        "guide": style_guide(styles, k1, target, user_context["presentation"]),
    }


def style_guide(styles: dict[str, Any], primary: str, target: str | None, presentation: str) -> dict[str, Any]:
    """config/styles.yaml text for the inferred style (examples for the user's presentation) and the move toward the
    target style. Empty fields when the catalog is missing."""
    st = styles.get(primary, {})
    pres = st.get("by_presentation", {}).get(PRESENTATION_KEY.get(presentation, "neutral"), {})
    transition = None
    if target and target != primary:
        tr = st.get("transitions_to", {}).get(target)
        if tr is None:  # not a neighbour: describe the target style itself
            tgt = styles.get(target, {})
            tr = {"keep_zh": [], "add_zh": list(tgt.get("keywords_zh", []))[:3]}
        transition = {"to": target, "keep_zh": [str(x) for x in tr.get("keep_zh", [])],
                      "add_zh": [str(x) for x in tr.get("add_zh", [])]}
    return {"summary_zh": str(st.get("summary_zh", "")), "keywords_zh": [str(x) for x in st.get("keywords_zh", [])],
            "examples_zh": [str(x) for x in pres.get("examples_zh", [])],
            "avoid_zh": [str(x) for x in pres.get("avoid_zh", [])], "transition": transition}


# ---------------------------------------------------------------------------
# Hair options
# ---------------------------------------------------------------------------
REQUIRES_ZH = {"perm": "需要烫发", "dye": "需要染发", "grow_out": "需要留长", "straighten": "需要拉直"}


def _catalog_matches(option: dict[str, Any], presentation: str, n: int) -> list[str]:
    p = option["params"]
    pres = PRESENTATION_KEY.get(presentation, "neutral")
    scored = []
    for st in load_hair_catalog():
        if "presentation" in st and pres not in st["presentation"]:
            continue
        score = 0
        if st.get("length_band") == p["length"]:
            score += 3
        if st.get("fringe_type") == p["fringe"]:
            score += 2
        if st.get("curl") == p["curl"]:
            score += 2
        if score >= 4:
            scored.append((-score, st["id"]))
    return [i for _s, i in sorted(scored)[:n]]


def hair_option_checks(analysis: dict[str, Any], user_context: dict[str, Any], cfg: dict[str, Any],
                       fw: FeedbackWeights) -> list[dict[str, Any]]:
    hc = cfg["hair_options"]
    c = user_context["constraints"]
    hair = user_context.get("hair") or {}
    opts = {o["tier"]: o for o in analysis["hair_options"]}
    out = []
    for i, tier in enumerate(hc["tier_order"]):
        o = opts.get(tier)
        if o is None:
            continue
        issues, status = [], "ok"
        blocked = {"perm": not c["accepts_perm"], "dye": not c["accepts_dye"],
                   "grow_out": hair.get("grow_out_ok") is False, "straighten": not c["accepts_perm"]}
        for req in o["requires"]:
            if blocked.get(req):
                issues.append(f"{REQUIRES_ZH[req]}，与你的条件不符")
                status = "excluded"
        if o["maintenance"]["daily_minutes"] > c["daily_minutes"] and status != "excluded":
            issues.append(f"每天打理约 {o['maintenance']['daily_minutes']} 分钟，超出你的 {c['daily_minutes']} 分钟")
            status = "warn"
        for other in analysis["hair_options"]:
            if other["tier"] == tier:
                continue
            diff = sum(o["params"][k] != other["params"][k] for k in ("length", "fringe", "curl"))
            if diff < hc["min_param_differences"]:
                issues.append(f"与{other['name_zh']}的长度、刘海、卷度差别不大")
                status = "warn" if status == "ok" else status
        rank = i + fw.hair_offset.get(tier, 0) + (100 if status == "excluded" else 0)
        out.append({"tier": tier, "status": status, "issues": issues,
                    "catalog_ids": _catalog_matches(o, user_context["presentation"], hc["catalog_matches"]),
                    "_rank": rank})
    out.sort(key=lambda d: d["_rank"])
    for n, d in enumerate(out, 1):
        d.pop("_rank")
        d["rank"] = n
    return out


# ---------------------------------------------------------------------------
# Glasses size
# ---------------------------------------------------------------------------
def glasses_size(analysis: dict[str, Any], anchors: dict[str, Any] | None, cfg: dict[str, Any]) -> dict[str, Any] | None:
    if analysis.get("glasses_direction") is None:
        return None
    g = cfg["glasses"]
    iris = (anchors or {}).get("iris_px")
    cheek = (anchors or {}).get("cheekbone_px")
    inter = (anchors or {}).get("intercanthal_px")
    if not anchors or anchors.get("reliability") == "low" or not iris or not cheek or iris < g["min_iris_px"]:
        return {"method": "relative", "total_width_mm": None, "lens_width_mm": None, "bridge_mm": None,
                "note_zh": "选镜框总宽与颧骨同宽的款式：戴上后镜框外缘与颧骨外缘对齐"}
    mm = g["iris_mm"] / iris
    cw = cheek * mm
    lo, hi = (round(cw * f) for f in g["total_width_factor"])
    bridge_c = (inter * mm * g["bridge_from_intercanthal"]) if inter else 18
    b = max(g["bridge_clamp"][0], min(g["bridge_clamp"][1], round(bridge_c)))
    bridge = [b - 1, b + 1]
    lens = [round((lo - bridge[1] - 2 * g["endpiece_mm"]) / 2), round((hi - bridge[0] - 2 * g["endpiece_mm"]) / 2)]
    return {"method": "iris_scale", "total_width_mm": [lo, hi], "lens_width_mm": lens, "bridge_mm": bridge,
            "note_zh": f"按虹膜直径约 {g['iris_mm']} mm 换算；镜框总宽 {lo}–{hi} mm，试戴时以与颧骨同宽为准"}


# ---------------------------------------------------------------------------
# Plan
# ---------------------------------------------------------------------------
def plan(analysis: dict[str, Any], ranked: list[dict[str, Any]], hidden: set[str], cfg: dict[str, Any]) -> dict[str, Any]:
    pc = cfg["plan"]
    recs = {r["id"]: r for r in analysis["recommendations"]}
    usable = [x["rec_id"] for x in ranked if x["rec_id"] not in hidden]
    cols: dict[str, list[dict[str, Any]]] = {"today": [], "next_haircut": [], "invest": []}
    for rid in usable:
        r = recs[rid]
        col = next((k for k in cols if r["time_to_effect"] in pc[k]), "invest")
        if r["cost_band"] == "high":
            col = "invest"
        if len(cols[col]) >= pc["max_per_column"]:
            continue
        cols[col].append({"rec_id": rid, "action": r["action"], "cost_band": r["cost_band"],
                          "time_to_effect": r["time_to_effect"], "success_check": r["success_check"],
                          "pairs_with": [p for p in r["pairs_with"] if p in usable],
                          "evidence": list(r["evidence"])})
    return cols


# ---------------------------------------------------------------------------
# Outfit checks
# ---------------------------------------------------------------------------
def _hex_close(a: str, b: str, tol: int = 24) -> bool:
    ca = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    cb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return max(abs(x - y) for x, y in zip(ca, cb, strict=True)) <= tol


def outfit_checks(analysis: dict[str, Any], user_context: dict[str, Any], profile: dict[str, Any],
                  fw: FeedbackWeights, cfg: dict[str, Any]) -> dict[str, Any]:
    catalog = load_garments()
    frame = (user_context.get("body") or {}).get("frame")
    if catalog is None:
        return {"status": "skipped", "frame_used": frame, "items": []}
    caution = analysis["color_profile"]["caution_families"]
    caution_names = {c["name"] for c in caution}
    caution_hex = [h for c in caution for h in c["hex_examples"]]
    styles_ok = {profile["primary"], profile["secondary"], *profile["preference_overlay"]["liked"]}
    target = profile["preference_overlay"]["target"]
    if target:
        styles_ok.add(target)
    pres = PRESENTATION_KEY.get(user_context["presentation"], "neutral")
    items = []
    for it in analysis["outfit_direction"]["items"]:
        g = catalog.get(it["garment_id"])
        if g is None:
            items.append({"garment_id": it["garment_id"], "status": "unknown", "issues": ["单品库中没有这件"],
                          "score": 0.0, "search_zh": f"{it['color_name']} {it['name_zh']}"})
            continue
        issues, status, score = [], "ok", 1.0
        near = g.get("color_slot") == "near_face"
        if near and (it["color_name"] in caution_names or any(_hex_close(it["hex"], h) for h in caution_hex)):
            issues.append("慎用色不放在靠近脸部的单品上")
            status = "excluded"
        if not styles_ok & set(g.get("styles", [])):
            issues.append("单品风格与你的风格方向不一致")
            status = "warn" if status == "ok" else status
            score -= 0.3
        if pres not in g.get("presentations", [pres]):
            issues.append("与你选择的表达方向不太一致")
            status = "warn" if status == "ok" else status
            score -= 0.2
        if frame and g.get("frames") and frame not in g["frames"]:
            issues.append("与你选择的身形骨架不太匹配")
            status = "warn" if status == "ok" else status
            score -= 0.2
        if target and target in g.get("styles", []):
            score += cfg["feedback"]["style_target_bonus"]
        score += fw.garment_offset.get(it["garment_id"], 0.0)
        tpl = g.get("search_tpl", "{color} {name}")
        try:
            search = tpl.format(color=it["color_name"], fabric=g.get("fabric", ""), name=g.get("name_zh", it["name_zh"]),
                                silhouette=g.get("silhouette", ""))
        except (KeyError, IndexError):
            search = f"{it['color_name']} {it['name_zh']}"
        items.append({"garment_id": it["garment_id"], "status": status, "issues": issues,
                      "score": round(score, 3), "search_zh": " ".join(search.split())})
    items.sort(key=lambda d: (d["status"] == "excluded", -d["score"]))
    return {"status": "ok", "frame_used": frame, "items": items}
