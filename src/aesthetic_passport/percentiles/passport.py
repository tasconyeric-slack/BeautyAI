"""The passport's `reference_percentiles` block (schema 0.7, Issue #41): #31's score + the front landmarks → the
reference-cohort rank and the ratio rails. Rules layer: deterministic, reads the scoring layer, never writes to it."""
from __future__ import annotations

from typing import Any

from .ratios import ratio_rails
from .reference import load_config, load_reference
from .score import score_percentile


def reference_percentiles(aesthetic_score: dict[str, Any] | None, landmarks: Any = None, *, yaw: float | None = None,
                          pitch: float | None = None, data: dict[str, Any] | None = None,
                          cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    """`aesthetic_score`: the passport's scoring-layer object (or None). `landmarks`: the front photo's landmarks the
    score was computed on (None → every rail reports no_face)."""
    from ..scoring import score_summary

    data = data or load_reference()
    cfg = cfg or load_config()
    s = score_summary(aesthetic_score)
    rank = score_percentile(s["overall_score"], s["scoring_version"],
                            complete=s["status"] in cfg["rankable_score_status"], data=data, cfg=cfg)
    if rank["status"] == "unavailable":
        rank["reason_zh"] = cfg["copy_zh"]["unavailable"].get(rank["reason"], cfg["copy_zh"]["unavailable"]["no_score"])
    copy = cfg["copy_zh"]
    return {
        "engine_version": cfg["version"],
        "reference_distribution_version": data["version"],
        "rank": rank,
        "ratios": ratio_rails(landmarks, yaw=yaw, pitch=pitch, data=data, cfg=cfg),
        "copy_zh": {"rank_title": copy["rank_title"], "ratios_title": copy["ratios_title"],
                    "ratios_unverified_note": copy["ratios_unverified_note"]},
        "provenance": {"layer": "rules", "inputs": ["aesthetic_score", "front_photo_landmarks"],
                       "data": "config/reference_distributions.json", "settings": "config/percentiles.yaml",
                       "reference_doc": "docs/scoring/REFERENCE_DISTRIBUTIONS.md"},
    }
