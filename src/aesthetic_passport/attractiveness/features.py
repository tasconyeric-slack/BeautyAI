"""Frozen training feature order; consume measurements, never detect a second face."""
from __future__ import annotations

from typing import Any

FEATURES = ("symmetry.mean_residual", "symmetry.eyes", "symmetry.brows", "symmetry.nose", "symmetry.mouth",
            "symmetry.jaw", "thirds.upper", "thirds.middle", "thirds.lower", "fifths.1", "fifths.2",
            "fifths.3", "fifths.4", "fifths.5", "golden_ratio.ratio", "pose.yaw", "pose.pitch")


def from_geometry(score: dict[str, Any], yaw: float | None, pitch: float | None) -> list[float]:
    components = {c["key"]: c["measured"] for c in score["components"]}
    sym, thirds, fifths, ratio = (components[k] for k in ("symmetry", "thirds", "fifths", "golden_ratio"))
    if any(c is None for c in (sym, thirds, fifths, ratio)):
        raise ValueError("incomplete_geometry")
    if len(thirds["shares"]) != 3 or len(fifths["segments_eye_widths"]) != 5:
        raise ValueError("incompatible_feature_shape")
    return [float(v) for v in [sym["mean_residual"],
            *(sym["features"][key] for key in ("eyes", "brows", "nose", "mouth", "jaw")),
            *thirds["shares"], *fifths["segments_eye_widths"], ratio["ratio"], yaw or 0.0, pitch or 0.0]]
