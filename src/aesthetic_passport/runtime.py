"""Runtime mode. Production must never present mock outputs as genuine (PR #25 review).

    APP_ENV=production       → `auto` providers never fall back to fakes; explicit fakes and QC_MODE=stub are refused;
                               fake checkout is disabled (invite codes still work)
    ALLOW_MOCK_PROVIDERS=1   → explicit escape hatch for a public demo; the UI then shows the demo banner
"""
from __future__ import annotations

import os


def is_production() -> bool:
    return os.environ.get("APP_ENV", "development").strip().lower() in ("production", "prod")


def mocks_allowed() -> bool:
    return not is_production() or os.environ.get("ALLOW_MOCK_PROVIDERS", "").strip().lower() in ("1", "true", "yes")
