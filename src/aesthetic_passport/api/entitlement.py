"""Entitlements (D27): free vs the one-time full passport. Decided on the server; the free view is *trimmed* here,
so paid content never reaches a free client (the UI does not "lock" by hiding)."""
from __future__ import annotations

import copy
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[3]
PRICING_PATH = ROOT / "config" / "pricing.yaml"


@lru_cache(maxsize=1)
def pricing() -> dict[str, Any]:
    return yaml.safe_load(PRICING_PATH.read_text(encoding="utf-8"))


def free_view(passport: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """(trimmed copy, locked paths). The stored passport is never modified."""
    fv = pricing()["free_view"]
    p = copy.deepcopy(passport)
    an, d = p["analysis"], p["derived"]
    locked: list[str] = []
    keep = set(fv["hair_tiers"])
    dropped = [o["tier"] for o in an["hair_options"] if o["tier"] not in keep]
    an["hair_options"] = [o for o in an["hair_options"] if o["tier"] in keep]
    locked += [f"hair_options.{t}" for t in dropped]
    od = an["outfit_direction"]
    if len(od["formulas"]) > fv["outfit_formulas"]:
        od["formulas"] = od["formulas"][: fv["outfit_formulas"]]
        locked.append("outfit.formulas")
    if od["occasions"]:
        od["occasions"] = []
        locked.append("outfit.occasions")
    if len(od["items"]) > fv["outfit_items"]:
        od["items"] = od["items"][: fv["outfit_items"]]
        locked.append("outfit.items")
        ids = {i["garment_id"] for i in od["items"]}
        d["outfit_checks"]["items"] = [i for i in d["outfit_checks"]["items"] if i["garment_id"] in ids]
    lips = an["color_profile"]["lip_families"]
    if len(lips) > fv["lip_families"]:
        an["color_profile"]["lip_families"] = lips[: fv["lip_families"]]
        locked.append("makeup.lip_families")
    if d["glasses_size"] is not None:
        d["glasses_size"] = None
        locked.append("glasses_size")
    mp = p.get("measurement_profile")
    if mp:
        # V3B (D35): locked metrics stay listed (name, group, whether it was measured) so the depth is visible, but
        # their value, per-side components, confidence, overlay and assessment never leave the server.
        tiers = set(fv["measurement_tiers"])
        locked_ids = set()
        for m in mp["metrics"]:
            if m["tier"] in tiers:
                continue
            locked_ids.add(m["id"])
            m.update(value=None, components=None, confidence=None, locked=True, notes=[],
                     overlay={"segments": [], "angles": [], "points": [], "outline": False, "silhouette": False})
        if locked_ids:
            locked.append("measurement_profile.full")
            mi = d.get("measurement_insights")
            if mi:
                mi["items"] = [i for i in mi["items"] if i["metric_id"] not in locked_ids]
                if "assessments" in mi:
                    mi["assessments"] = [a for a in mi["assessments"] if a["metric_id"] not in locked_ids]
                for pl in mi["pillars"]:
                    pl["notable"] = [x for x in pl["notable"] if x not in locked_ids]
    if any(d["plan"].values()):
        d["plan"] = {"today": [], "next_haircut": [], "invest": []}
        locked.append("plan")
    return p, locked


def entitlement(job: dict[str, Any], free_previews_used: int) -> dict[str, Any]:
    pr = pricing()
    paid = bool(job.get("paid"))
    return {"paid": paid, "unlock_scope": "full" if paid else "free", "share_token": job.get("share_token"),
            "free_previews_left": max(0, pr["free_previews"] - free_previews_used),
            "price_cny": pr["full_passport_price"], "locked": []}
