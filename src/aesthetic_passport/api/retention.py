"""Retention (invariant 7; V2 adds the unsaved-passport TTL).

- Uploads other than the front photo are deleted when the analysis job ends (jobs.py).
- The front photo, its thumbnail, previews and geometry.json live `media_ttl_hours` (24 h); then the whole
  runs/<id>/media directory is deleted. Runs on API startup and hourly.
- Passports that were never saved (no payment / account) lose their JSON after `passport_ttl_days` (7 days).
- DELETE /api/passport/{id} removes everything at once (erase_passport).
"""
from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from .store import Store, now


def media_expired(job: dict[str, Any]) -> bool:
    """Strict TTL on every read: expired once media_expires_at has passed, even before the hourly purge runs."""
    if job.get("media_deleted"):
        return True
    exp = job.get("media_expires_at")
    try:
        return bool(exp) and now() >= datetime.fromisoformat(exp)
    except ValueError:
        return True


def media_dir(runs_dir: Path, pid: str) -> Path:
    return runs_dir / pid / "media"


def _rm_media(runs_dir: Path, pid: str) -> None:
    for sub in ("media", "uploads", "debug"):
        shutil.rmtree(runs_dir / pid / sub, ignore_errors=True)


def purge_expired_media(store: Store, runs_dir: Path) -> list[str]:
    purged = []
    for pid in store.expired_media(now()):
        _rm_media(runs_dir, pid)
        store.mark_media_deleted(pid)
        purged.append(pid)
    return purged


def purge_expired_passports(store: Store, runs_dir: Path) -> list[str]:
    purged = []
    for pid in store.expired_json(now()):
        erase_passport(store, runs_dir, pid)
        purged.append(pid)
    return purged


def erase_passport(store: Store, runs_dir: Path, pid: str) -> str:
    """Delete photos, previews, geometry, logs and the JSON. Returns the deletion time (ISO)."""
    shutil.rmtree(runs_dir / pid, ignore_errors=True)
    return store.delete(pid)
