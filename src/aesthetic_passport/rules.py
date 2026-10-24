"""Rules layer: deterministic post-processing of the model's analysis.

Design principle: `analysis` is what the model said and is never mutated. Everything here writes to
`derived`, so any user-facing number can be traced to either a measurement, a model judgment, or a
named rule in config/rules.yaml.

Consistency check codes
    C1  measured long face, model says round/square
    C2  measured short/wide face, model says oblong/rectangle
    C3  measured wide jaw, model says heart/diamond
    C4  evidence cites a non-existent observation id (recs with dangling evidence are excluded)
    C5  rules overrode the model's constraint_check (e.g. dye mentioned when accepts_dye=false)
    C6  color confidence capped (phone-photo white balance is unreliable)
    C7  visual_edit_spec region does not match the recommendation category (spec ignored)
    C8  duplicate recommendation removed
    C9  face-shape probabilities do not sum to ~1 (normalized for display)
    C10 input quality gate did not pass
    C11 CV face-shape heuristic's top label is not among the model's top-2 candidates
    C12 model temperature contradicts measured skin warmth, or color measurement reliability is low
        (temperature and chroma confidence capped)
"""
from __future__ import annotations

import math
from collections.abc import Iterable
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from .feedback import FeedbackWeights, change_note, weights_from_events
from .insights import measurement_insights
from .styling import glasses_size, hair_option_checks, outfit_checks, plan, style_profile

ROOT = Path(__file__).resolve().parents[2]
RULES_PATH = ROOT / "config" / "rules.yaml"
CATALOG_PATH = ROOT / "config" / "hairstyles.json"
TEMP_DIRECTION = {"cool": -1, "neutral_cool": -1, "neutral": 0, "neutral_warm": 1, "warm": 1}
CATALOG_LENGTHS = ("shaved", "very_short", "short", "medium", "long")

CATEGORY_TO_EDIT_REGION = {
    "hairstyle": {"hair"},
    "brows": {"brows"},
    "glasses": {"glasses"},
    "facial_hair": {"facial_hair"},
    "clothing": {"clothing_top"},
    "color_palette": {"clothing_top"},
    "accessories": set(),
    "makeup": set(),
    "photo_presentation": set(),
}
NEGATION_PREFIXES = ("不", "无", "免", "别", "勿", "避", "no ", "not ", "without ")


@lru_cache(maxsize=4)
def load_rules(path: str | None = None) -> dict[str, Any]:
    return yaml.safe_load(Path(path or RULES_PATH).read_text(encoding="utf-8"))


@lru_cache(maxsize=2)
def load_catalog(path: str | None = None) -> list[dict[str, Any]]:
    import json

    return json.loads(Path(path or CATALOG_PATH).read_text(encoding="utf-8"))["styles"]


def _flag(code: str, severity: str, message: str, affected: list[str] | None = None) -> dict[str, Any]:
    return {"code": code, "severity": severity, "message": message, "affected": affected or []}


# ---------------------------------------------------------------------------
# Evidence integrity
# ---------------------------------------------------------------------------
def _evidence_holders(analysis: dict[str, Any]):
    """Yield (label, evidence_list) for every place that cites observations."""
    yield "profile_summary", analysis["profile_summary"]["evidence"]
    yield "face_structure", analysis["face_structure"]["evidence"]
    yield "hair_direction", analysis["hair_direction"]["evidence"]
    if analysis["glasses_direction"]:
        yield "glasses_direction", analysis["glasses_direction"]["evidence"]
    yield "photo_direction", analysis["photo_direction"]["evidence"]
    for f in analysis["feature_characteristics"]:
        yield f"feature:{f['feature']}", f["evidence"]
    yield "color_profile", analysis["color_profile"]["evidence"]
    for name, dim in analysis["style_dimensions"].items():
        yield f"dim:{name}", dim["evidence"]
    for i, w in enumerate(analysis["works"]):
        yield f"works[{i}]", w["evidence"]
    for i, d in enumerate(analysis["doesnt_work"]):
        yield f"doesnt_work[{i}]", d["evidence"]


def check_evidence(analysis: dict[str, Any]) -> tuple[list[dict], set[str]]:
    obs_ids = {o["id"] for o in analysis["observations"]}
    flags: list[dict] = []
    dangling_recs: set[str] = set()

    bad_sections = [label for label, ev in _evidence_holders(analysis) if set(ev) - obs_ids]
    if bad_sections:
        flags.append(_flag("C4", "warn", "部分分析引用了不存在的观察编号", bad_sections))

    for rec in analysis["recommendations"]:
        if set(rec["evidence"]) - obs_ids:
            dangling_recs.add(rec["id"])
    if dangling_recs:
        flags.append(_flag("C4", "high", "建议引用了不存在的观察编号，已剔除", sorted(dangling_recs)))
    return flags, dangling_recs


# ---------------------------------------------------------------------------
# Constraint guards (never trust the model alone on hard constraints)
# ---------------------------------------------------------------------------
def _mentions(text: str, keywords: list[str]) -> bool:
    low = text.lower()
    for kw in keywords:
        k = kw.lower()
        start = 0
        while (idx := low.find(k, start)) != -1:
            window = low[max(0, idx - 9): idx]
            if not any(window.endswith(neg) or neg in window[-3:] for neg in NEGATION_PREFIXES):
                return True
            start = idx + len(k)
    return False


def _rec_text(rec: dict[str, Any]) -> str:
    parts = [rec["action"], rec["why"], " ".join(rec["how_to"])]
    spec = rec.get("visual_edit_spec")
    if spec:
        parts.append(spec["target_description"])
    return " ".join(parts)


def effective_constraint_status(
    analysis: dict[str, Any], user_context: dict[str, Any], cfg: dict[str, Any]
) -> tuple[dict[str, str], list[dict]]:
    c = user_context["constraints"]
    guards = cfg["ranking"]["constraint_guards"]
    active = []
    if not c["accepts_dye"]:
        active.append(("accepts_dye_false", guards["accepts_dye_false"]))
    if not c["accepts_perm"]:
        active.append(("accepts_perm_false", guards["accepts_perm_false"]))
    if not c["accepts_glasses_change"]:
        active.append(("accepts_glasses_change_false", guards["accepts_glasses_change_false"]))

    status: dict[str, str] = {}
    overridden: list[str] = []
    for rec in analysis["recommendations"]:
        s = rec["constraint_check"]["status"]
        for _name, g in active:
            if rec["category"] not in g["categories"]:
                continue
            hit = (not g["keywords"]) or _mentions(_rec_text(rec), g["keywords"])
            if hit and s != "violates":
                s = "violates"
                overridden.append(rec["id"])
        status[rec["id"]] = s

    flags = []
    if overridden:
        flags.append(_flag("C5", "warn", "规则层检测到建议与用户约束冲突，已改判为违反约束", overridden))
    return status, flags


# ---------------------------------------------------------------------------
# Face shape / anchor consistency
# ---------------------------------------------------------------------------
def face_shape_checks(analysis: dict[str, Any], anchors: dict[str, Any] | None, cfg: dict[str, Any]) -> list[dict]:
    flags: list[dict] = []
    cands = analysis["face_structure"]["shape_candidates"]
    total = sum(c["probability"] for c in cands)
    if abs(total - 1.0) > 0.15:
        flags.append(_flag("C9", "info", f"脸型概率之和为 {total:.2f}，展示时已归一化", ["face_structure"]))
    if not anchors:
        return flags

    cc = cfg["consistency"]
    top = max(cands, key=lambda c: c["probability"])
    ratio = anchors["face_length_width_ratio"]
    jaw = anchors["width_profile"]["jaw"]

    if ratio >= cc["c1_long_face_ratio"] and top["label"] in cc["c1_conflicting_shapes"] and top["probability"] >= cc["c1_prob_threshold"]:
        flags.append(_flag("C1", "warn", f"测量长宽比 {ratio:.2f} 偏长，与模型判断的 {top['label']} 不一致", ["face_structure"]))
    if ratio <= cc["c2_short_face_ratio"] and top["label"] in cc["c2_conflicting_shapes"]:
        flags.append(_flag("C2", "warn", f"测量长宽比 {ratio:.2f} 偏短，与模型判断的 {top['label']} 不一致", ["face_structure"]))
    if jaw >= cc["c3_wide_jaw"] and top["label"] in cc["c3_conflicting_shapes"]:
        flags.append(_flag("C3", "warn", f"测量下颌宽度 {jaw:.2f}（相对颧骨）偏宽，与 {top['label']} 不一致", ["face_structure"]))
    heur = anchors.get("face_shape_heuristic")
    if heur:
        top2 = {c["label"] for c in sorted(cands, key=lambda c: -c["probability"])[:2]}
        if heur["top"] not in top2:
            names = cfg["face_shape_names_zh"]
            flags.append(_flag("C11", "warn", f"测量启发式偏向{names[heur['top']]}，不在模型的前两个脸型判断中",
                               ["face_structure", "anchors"]))
    return flags


def face_shape_label(analysis: dict[str, Any], flags: list[dict], cfg: dict[str, Any]) -> dict[str, Any]:
    cands = sorted(analysis["face_structure"]["shape_candidates"], key=lambda c: -c["probability"])
    total = sum(c["probability"] for c in cands) or 1.0
    top = cands[0]
    p = top["probability"] / total
    if any(f["code"] in {"C1", "C2", "C3"} for f in flags):
        p *= 0.8
    ambiguous = None
    if len(cands) > 1 and (top["probability"] - cands[1]["probability"]) / total < cfg["face_shape_ambiguity_margin"]:
        ambiguous = cands[1]["label"]
    return {
        "label": top["label"],
        "label_zh": cfg["face_shape_names_zh"][top["label"]],
        "probability": round(p, 3),
        "ambiguous_with": ambiguous,
    }


# ---------------------------------------------------------------------------
# Style display label: nearest prototype in (visual_weight, angular_rounded)
# ---------------------------------------------------------------------------
def style_label(analysis: dict[str, Any], presentation: str, cfg: dict[str, Any]) -> dict[str, Any]:
    """Face-only display label. One vocabulary for every presentation (D25); `presentation` kept for callers."""
    sc = cfg["style_labels"]
    dims = analysis["style_dimensions"]
    w = dims["visual_weight"]["value"]
    c = dims["angular_rounded"]["value"]
    dists = sorted(
        (math.dist((w, c), (p["visual_weight"], p["angular_rounded"])), key)
        for key, p in sc["prototypes"].items()
    )
    (d1, k1), (d2, k2) = dists[0], dists[1]
    names = sc["names_zh"]
    return {
        "system": sc["system"],
        "primary": k1,
        "primary_zh": names[k1],
        "secondary": k2,
        "secondary_zh": names[k2],
        "between": (d2 - d1) < sc["between_margin"],
        "confidence": round(min(dims["visual_weight"]["confidence"], dims["angular_rounded"]["confidence"]), 3),
        "coordinates": {"visual_weight": w, "angular_rounded": c},
    }


# ---------------------------------------------------------------------------
# Color
# ---------------------------------------------------------------------------
def color_label(
    analysis: dict[str, Any],
    input_quality: dict[str, Any],
    cfg: dict[str, Any],
    color_measurements: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, Any] | None, list[dict]]:
    """Return (display_labels.color, display_labels.seasonal_leaning, flags)."""
    cp = analysis["color_profile"]
    cc = cfg["consistency"]
    names = cfg["color_names_zh"]
    flags = []

    cap = cc["color_conf_cap_low_lighting"] if input_quality["lighting_consistency"] == "low" else cc["color_conf_cap_default"]
    temp_conf = min(cp["temperature_confidence"], cap)
    chroma_conf = cp["chroma_confidence"]
    if cp["temperature_confidence"] > cap:
        flags.append(_flag("C6", "info", f"冷暖判断置信度由 {cp['temperature_confidence']:.2f} 下调至 {cap:.2f}", ["color_profile"]))

    # C12: measured skin warmth (CV) vs the model's temperature call.
    c12_reason = None
    if color_measurements:
        b = color_measurements["warmth_b"]
        measured = 1 if b >= cc["c12_warm_b_min"] else -1 if b <= cc["c12_cool_b_max"] else 0
        model_dir = TEMP_DIRECTION[cp["temperature"]]
        if measured and model_dir and measured != model_dir:
            c12_reason = f"测量肤色 b*={b:.1f} 偏{'暖' if measured > 0 else '冷'}，与模型的「{names['temperature'][cp['temperature']]}」相反"
        elif color_measurements["reliability"] == "low":
            c12_reason = "颜色取样可靠性低（光线不一致或高光过多）"
    if c12_reason:
        low_cap = cc["color_conf_cap_low_lighting"]
        temp_conf, chroma_conf = min(temp_conf, low_cap), min(chroma_conf, low_cap)
        flags.append(_flag("C12", "warn", f"{c12_reason}，冷暖与饱和度置信度下调至 {low_cap:.2f}", ["color_profile"]))

    conf = (temp_conf + cp["depth_confidence"] + cp["contrast_confidence"] + chroma_conf) / 4
    summary = f"{names['temperature'][cp['temperature']]} · {names['depth'][cp['depth']]} · {names['contrast'][cp['contrast']]}"
    if temp_conf < 0.5:
        summary += "（冷暖仅供参考）"

    seasonal = None
    sl = cp["seasonal_leaning"]
    if not c12_reason and temp_conf >= cc["seasonal_min_conf"] and chroma_conf >= cc["seasonal_min_conf"]:
        season = names["season"]
        secondary = sl["secondary"]
        text = f"色彩方向参考：偏向 {season[sl['primary']]}"
        if secondary:
            text += f"（与{season[secondary]}接近）"
        seasonal = {"primary": sl["primary"], "primary_zh": season[sl["primary"]], "secondary": secondary,
                    "secondary_zh": season[secondary] if secondary else None, "text_zh": text}
    label = {"summary_zh": summary, "confidence": round(conf, 3),
             "temperature_confidence": round(temp_conf, 3), "chroma_confidence": round(chroma_conf, 3)}
    return label, seasonal, flags


# ---------------------------------------------------------------------------
# Hairstyle catalog fit (pure rules over config/hairstyles.json)
# ---------------------------------------------------------------------------
def hair_references(
    analysis: dict[str, Any],
    anchors: dict[str, Any] | None,
    face_label: dict[str, Any],
    user_context: dict[str, Any],
    cfg: dict[str, Any],
    catalog: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    hc = cfg["hair_catalog"]
    hd = analysis["hair_direction"]
    texture = analysis["current_styling"]["hair"]["texture"]
    target_len = hc["length_map"][hd["length"]]
    alias = hc["shape_alias"]
    model_top = alias.get(face_label["label"], face_label["label"])
    cv_top = (anchors or {}).get("face_shape_heuristic", {}).get("top")
    cv_top = alias.get(cv_top, cv_top) if cv_top else None
    names = cfg["face_shape_names_zh"]
    vol_order = ("low", "moderate", "high")
    scored = []
    for st in catalog if catalog is not None else load_catalog():
        if texture != "unclear" and "all" not in st["textures"] and texture not in st["textures"]:
            continue
        if "presentations" in st and user_context["presentation"] not in st["presentations"]:
            continue
        if st["fade"] not in hc["sides_fades"][hd["side_volume"]]:
            continue  # a reference must never contradict the recommended side treatment
        score, reasons = 0.0, []
        if model_top in st["face_shapes"]:
            score += hc["face_shape_model_top"]
            reasons.append(f"常被推荐给{names[model_top]}")
        elif cv_top and cv_top in st["face_shapes"]:
            score += hc["face_shape_cv_top"]
            reasons.append(f"适合测量偏向的{names[cv_top]}")
        else:
            score += hc["face_shape_none"]
        gap = abs(CATALOG_LENGTHS.index(st["length"]) - CATALOG_LENGTHS.index(target_len))
        if gap == 0:
            score += hc["length_exact"]
            reasons.append("长度与建议一致")
        elif gap == 1:
            score += hc["length_adjacent"]
        score += hc["sides_match"]
        reasons.append("两侧处理与建议一致")
        if st["fringe"] == (hd["fringe"] != "none"):
            score += hc["fringe_match"]
            if st["fringe"]:
                reasons.append("同样带刘海")
        vgap = abs(vol_order.index(st["top_volume"]) - vol_order.index(hd["top_volume"]))
        score += hc["top_volume_exact"] if vgap == 0 else hc["top_volume_adjacent"] if vgap == 1 else 0
        if vgap == 0:
            reasons.append("顶部高度与建议一致")
        if user_context["constraints"]["daily_minutes"] <= hc["low_upkeep_minutes"] and st["maintenance"] == "low":
            score += hc["upkeep_bonus"]
            reasons.append("日常打理省时")
        scored.append((score, st, reasons))
    scored.sort(key=lambda t: -t[0])
    best = scored[0][0] if scored else 0.0
    floor = max(hc["min_score"], hc["relative_min"] * best)
    return [
        {"catalog_id": st["id"], "name": st["name"], "name_zh": st["name_zh"],
         "fits_face_shape": model_top in st["face_shapes"] or (cv_top in st["face_shapes"] if cv_top else False),
         "length": st["length"], "fade": st["fade"], "params_mm": dict(st["params_mm"]), "reasons_zh": reasons}
        for score, st, reasons in scored[: hc["max_results"]] if score >= floor
    ]


# ---------------------------------------------------------------------------
# Ranking
# ---------------------------------------------------------------------------
def _norm_action(text: str) -> str:
    return "".join(ch for ch in text if ch.isalnum()).lower()


def rank_recommendations(
    analysis: dict[str, Any],
    user_context: dict[str, Any],
    status: dict[str, str],
    dangling: set[str],
    cfg: dict[str, Any],
    fw: FeedbackWeights | None = None,
) -> tuple[list[dict], list[str], list[dict], list[dict]]:
    fw = fw or FeedbackWeights()
    rc = cfg["ranking"]
    focus_cats = {cat for f in user_context["optimize_focus"] for cat in rc["focus_to_categories"].get(f, [])}

    excluded: list[dict] = []
    flags: list[dict] = []
    seen: dict[tuple[str, str], str] = {}
    scored: list[tuple[float, dict, dict]] = []

    for rec in analysis["recommendations"]:
        rid = rec["id"]
        if rid in dangling:
            excluded.append({"rec_id": rid, "reason": "dangling_evidence"})
            continue
        if status[rid] == "violates":
            excluded.append({"rec_id": rid, "reason": "violates_constraint"})
            continue
        if rid in fw.rec_hidden:
            excluded.append({"rec_id": rid, "reason": "user_hidden"})
            continue
        key = (rec["category"], _norm_action(rec["action"]))
        if key in seen:
            excluded.append({"rec_id": rid, "reason": "duplicate"})
            flags.append(_flag("C8", "info", f"{rid} 与 {seen[key]} 重复，已剔除", [rid]))
            continue
        seen[key] = rid

        bd = {
            "impact_norm": rec["impact"] / 5,
            "confidence": rec["confidence"],
            "effort_factor": rc["effort_factor"][rec["effort"]],
            "goal_bonus": rc["goal_bonus"] if rec["category"] in focus_cats else 1.0,
            "consent_penalty": rc["consent_penalty"] if status[rid] == "requires_consent" else 1.0,
            "feedback_factor": fw.rec_factor.get(rid, 1.0),
        }
        score = math.prod(bd.values())
        scored.append((score, rec, bd))

    # Stable, explainable order: score desc, then impact desc, then original id order.
    scored.sort(key=lambda t: (-t[0], -t[1]["impact"], int(t[1]["id"][1:])))

    ranked = [
        {"rec_id": rec["id"], "rank": i + 1, "priority_score": round(score, 4),
         "score_breakdown": {k: round(v, 4) for k, v in bd.items()}}
        for i, (score, rec, bd) in enumerate(scored)
    ]

    top: list[str] = []
    per_cat: dict[str, int] = {}
    for _score, rec, _bd in scored:
        cat = rec["category"]
        if len(top) >= rc["top_n"]:
            excluded.append({"rec_id": rec["id"], "reason": "below_top_n"})
        elif per_cat.get(cat, 0) >= rc["max_per_category"]:
            excluded.append({"rec_id": rec["id"], "reason": "category_cap"})
        else:
            top.append(rec["id"])
            per_cat[cat] = per_cat.get(cat, 0) + 1
    return ranked, top, excluded, flags


def edit_spec_checks(analysis: dict[str, Any]) -> tuple[list[dict], set[str]]:
    bad = set()
    for rec in analysis["recommendations"]:
        spec = rec.get("visual_edit_spec")
        if spec and spec["region"] not in CATEGORY_TO_EDIT_REGION[rec["category"]]:
            bad.add(rec["id"])
    flags = [_flag("C7", "warn", "编辑区域与建议类别不匹配，该建议不生成效果图", sorted(bad))] if bad else []
    return flags, bad


def select_preview_rec(analysis: dict[str, Any], top5: list[str], unusable_specs: set[str]) -> str | None:
    recs = {r["id"]: r for r in analysis["recommendations"]}
    for rid in top5:
        if recs[rid].get("visual_edit_spec") and rid not in unusable_specs:
            return rid
    return None


# ---------------------------------------------------------------------------
# Overall confidence
# ---------------------------------------------------------------------------
def overall_confidence(
    analysis: dict[str, Any],
    face_label: dict[str, Any],
    color: dict[str, Any],
    top5: list[str],
    flags: list[dict],
    input_quality: dict[str, Any],
    anchors: dict[str, Any] | None,
    cfg: dict[str, Any],
) -> float:
    cc = cfg["consistency"]
    dims = analysis["style_dimensions"].values()
    recs = {r["id"]: r for r in analysis["recommendations"]}
    parts = [
        face_label["probability"],
        sum(d["confidence"] for d in dims) / len(analysis["style_dimensions"]),
        color["confidence"],
    ]
    if top5:
        parts.append(sum(recs[r]["confidence"] for r in top5) / len(top5))
    score = sum(parts) / len(parts)
    for f in flags:
        if f["severity"] == "high":
            score *= cc["overall_penalty_per_high_flag"]
        elif f["severity"] == "warn":
            score *= cc["overall_penalty_per_warn_flag"]
    if input_quality["lighting_consistency"] == "low":
        score *= cc["overall_penalty_low_lighting"]
    if anchors is None or anchors["reliability"] == "low":
        score *= cc["overall_penalty_low_anchor_reliability"]
    return round(max(0.0, min(1.0, score)), 3)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
# Exclusion reasons that remove a recommendation outright (below_top_n / category_cap ones remain valid links).
REMOVED = {"dangling_evidence", "violates_constraint", "user_hidden", "duplicate"}


def derive(
    analysis: dict[str, Any],
    anchors: dict[str, Any] | None,
    input_quality: dict[str, Any],
    user_context: dict[str, Any],
    cfg: dict[str, Any] | None = None,
    color_measurements: dict[str, Any] | None = None,
    preference_events: Iterable[dict[str, Any]] = (),
    *,
    derived_version: int = 1,
    context_changed: bool = False,
    measurement_profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compute the `derived` block. Pure and deterministic: same inputs → same output (bytes, once serialized).

    `preference_events` (D26) only re-weight derived output; `analysis` is read-only here.
    """
    cfg = cfg or load_rules()
    fw = weights_from_events(preference_events, cfg)
    flags: list[dict] = []

    if not input_quality["passed"]:
        flags.append(_flag("C10", "high", "照片质检未通过，结果可靠性受限", ["input_quality"]))

    ev_flags, dangling = check_evidence(analysis)
    status, c5 = effective_constraint_status(analysis, user_context, cfg)
    fs_flags = face_shape_checks(analysis, anchors, cfg)
    color, seasonal, c6 = color_label(analysis, input_quality, cfg, color_measurements)
    spec_flags, _unusable = edit_spec_checks(analysis)
    flags += ev_flags + c5 + fs_flags + c6 + spec_flags

    face = face_shape_label(analysis, flags, cfg)
    style = style_label(analysis, user_context["presentation"], cfg)
    ranked, top5, excluded, rank_flags = rank_recommendations(analysis, user_context, status, dangling, cfg, fw)
    flags += rank_flags
    profile = style_profile(analysis, user_context, cfg, fw)

    return {
        "display_labels": {"face_shape": face, "style": style, "color": color, "seasonal_leaning": seasonal},
        "ranked_recommendations": ranked,
        "top5": top5,
        "excluded_recommendations": excluded,
        "consistency_flags": flags,
        "overall_confidence": overall_confidence(analysis, face, color, top5, flags, input_quality, anchors, cfg),
        "hair_references": hair_references(analysis, anchors, face, user_context, cfg),
        "style_profile": profile,
        "hair_option_checks": hair_option_checks(analysis, user_context, cfg, fw),
        "glasses_size": glasses_size(analysis, anchors, cfg),
        "plan": plan(analysis, ranked, fw.rec_hidden, cfg),
        "outfit_checks": outfit_checks(analysis, user_context, profile, fw, cfg),
        "feedback_applied": {"event_count": fw.event_count, "changes": fw.changes,
                             "note_zh": change_note(fw, context_changed, cfg["style_labels"]["names_zh"])},
        "measurement_insights": measurement_insights(measurement_profile, analysis, ranked,
                                                     {e["rec_id"] for e in excluded if e["reason"] in REMOVED}, cfg),
        "derived_version": derived_version,
        "rules_version": cfg["rules_version"],
    }


def free_preview_targets(analysis: dict[str, Any], derived: dict[str, Any]) -> list[str]:
    """Hair-option tiers in preview order (feedback-adjusted, constraint-excluded ones dropped)."""
    return [c["tier"] for c in derived["hair_option_checks"] if c["status"] != "excluded"]
