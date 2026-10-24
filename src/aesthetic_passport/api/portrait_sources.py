"""Optional everyday-eyewear reference: styling only, outside the analysis/photo schema.

Only QC-usable images are kept, under the existing media directory/TTL/delete path.
No reference pixels or geometry enter the model's analysis or the report's measurements.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from ..imaging import open_rgb
from . import qc_service
from .retention import media_expired
from .store import Store

STUDIO_ROLES = ("front", "noglasses", "glasses")


def keep_glasses_reference(uploads: Path, media: Path, store: Store, pid: str) -> None:
    source = uploads / "glasses.jpg"
    if not source.is_file():
        return
    try:
        verdict = qc_service.check_one(open_rgb(source), "glasses")
        if verdict["status"] == "reject":
            return
    except Exception:  # noqa: BLE001 — optional reference never blocks a valid primary portrait
        return
    job = store.get(pid)
    if not job or job["status"] == "deleted" or media_expired(job):
        return
    media.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), media / "glasses.jpg")
