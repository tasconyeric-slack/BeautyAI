"""User feedback → rules-layer weights (D26).

Preference events are user data: they never touch `analysis` and never trigger a model call. `derive()` folds them
into ranking weights, the style preference overlay and the one-line change note shown after a rerank.

Event shape (stored in the `preference_events` table, see api/store.py):
    {"target_type": "recommendation" | "hair_option" | "garment" | "style" | "color" | "profile",
     "target_id": "r3" | "safe" | "top_satin_blouse" | "elegant" | ...,
     "reaction": "like" | "neutral" | "dislike" | "target" | "resemble_yes" | "resemble_no",
     "reason_tags": [...], "ts": "..."}
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

TARGET_TYPES = ("recommendation", "hair_option", "garment", "style", "color", "profile")
REACTIONS = ("like", "neutral", "dislike", "target", "resemble_yes", "resemble_no")


def latest_events(events: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Last event wins per (target_type, target_id); `target` events are kept per type (only the latest counts)."""
    latest: dict[tuple[str, str], dict[str, Any]] = {}
    for e in sorted(events, key=lambda e: e.get("ts") or ""):
        key = (e["target_type"], "__target__" if e["reaction"] == "target" else e["target_id"])
        latest[key] = e
    return list(latest.values())


@dataclass
class FeedbackWeights:
    rec_factor: dict[str, float] = field(default_factory=dict)
    rec_hidden: set[str] = field(default_factory=set)
    hair_offset: dict[str, float] = field(default_factory=dict)
    garment_offset: dict[str, float] = field(default_factory=dict)
    style_liked: list[str] = field(default_factory=list)
    style_disliked: list[str] = field(default_factory=list)
    style_target: str | None = None
    resemble: dict[str, str] = field(default_factory=dict)
    changes: list[dict[str, str]] = field(default_factory=list)
    event_count: int = 0


def weights_from_events(events: Iterable[dict[str, Any]], cfg: dict[str, Any]) -> FeedbackWeights:
    fc = cfg["feedback"]
    w = FeedbackWeights()
    evs = latest_events(events)
    w.event_count = len(evs)
    for e in evs:
        t, tid, r = e["target_type"], e["target_id"], e["reaction"]
        reasons = set(e.get("reason_tags") or [])
        if t == "recommendation":
            if r == "dislike" and reasons & set(fc["hide_reasons"]):
                w.rec_hidden.add(tid)
                w.changes.append({"target_type": t, "target_id": tid, "effect": "hidden"})
            elif r in ("like", "dislike"):
                w.rec_factor[tid] = fc[f"{r}_factor"]
                w.changes.append({"target_type": t, "target_id": tid, "effect": "boosted" if r == "like" else "demoted"})
        elif t == "hair_option" and r in ("like", "dislike"):
            w.hair_offset[tid] = fc["hair_like_bonus"] if r == "like" else fc["hair_dislike_penalty"]
            w.changes.append({"target_type": t, "target_id": tid, "effect": "boosted" if r == "like" else "demoted"})
        elif t == "garment" and r in ("like", "dislike"):
            w.garment_offset[tid] = fc["garment_like_bonus"] if r == "like" else -fc["garment_dislike_penalty"]
            w.changes.append({"target_type": t, "target_id": tid, "effect": "boosted" if r == "like" else "demoted"})
        elif t == "style":
            if r == "target":
                w.style_target = tid
                w.changes.append({"target_type": t, "target_id": tid, "effect": "target_set"})
            elif r == "like":
                w.style_liked.append(tid)
                w.changes.append({"target_type": t, "target_id": tid, "effect": "boosted"})
            elif r == "dislike":
                w.style_disliked.append(tid)
                w.changes.append({"target_type": t, "target_id": tid, "effect": "demoted"})
        elif t == "profile" and r in ("resemble_yes", "resemble_no"):
            w.resemble[tid] = r
    w.style_liked.sort()
    w.style_disliked.sort()
    return w


def change_note(w: FeedbackWeights, context_changed: bool, names: dict[str, str]) -> str | None:
    """One line for the UI after a rerank, e.g. 已按你的 3 条反馈调整：提升 1 项、降低 1 项、隐藏 1 项."""
    counts = {"boosted": 0, "demoted": 0, "hidden": 0}
    target = None
    for c in w.changes:
        if c["effect"] in counts:
            counts[c["effect"]] += 1
        elif c["effect"] == "target_set":
            target = names.get(c["target_id"], c["target_id"])
    parts = [f"{label} {counts[k]} 项" for k, label in (("boosted", "提升"), ("demoted", "降低"), ("hidden", "隐藏"))
             if counts[k]]
    if target:
        parts.append(f"穿搭与发型向{target}靠拢")
    if context_changed:
        parts.append("已按新的条件重新排序")
    if not parts:
        return None
    lead = f"已按你的 {w.event_count} 条反馈调整：" if w.event_count else "已更新："
    return lead + "、".join(parts)
