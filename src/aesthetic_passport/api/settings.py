"""API settings, read once from environment variables (see .env.example)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    return int(raw) if raw else default


@dataclass
class Settings:
    runs_dir: Path = ROOT / "runs"
    web_origins: list[str] = field(default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"])
    invite_codes: set[str] = field(default_factory=set)   # empty = no invite code required
    daily_passport_limit: int = 30                         # across all users, per UTC day; 0 = unlimited
    ip_passports_per_hour: int = 5
    ip_qc_per_minute: int = 30
    max_upload_mb: int = 15
    media_ttl_hours: int = 24
    preview_cap: int = 12                                  # previews per paid passport (= pricing.yaml paid_preview_cap)
    passport_ttl_days: int = 7                             # unsaved passport JSON (photos: media_ttl_hours)
    share_base_url: str = ""                               # prefix for share links (web origin); empty = relative
    invite_unlock_codes: set[str] = field(default_factory=set)
    run_jobs_inline: bool = False                          # tests: run background work synchronously
    preview_debug: bool = False                            # write mask overlays to runs/<id>/debug (purged with media)

    @property
    def db_path(self) -> Path:
        return self.runs_dir / "app.db"

    @classmethod
    def from_env(cls) -> Settings:
        try:
            from dotenv import load_dotenv

            load_dotenv()
        except ImportError:
            pass
        s = cls()
        if os.environ.get("RUNS_DIR"):
            s.runs_dir = Path(os.environ["RUNS_DIR"])
        if os.environ.get("WEB_ORIGINS"):
            s.web_origins = [o.strip() for o in os.environ["WEB_ORIGINS"].split(",") if o.strip()]
        s.invite_codes = {c.strip() for c in os.environ.get("INVITE_CODES", "").split(",") if c.strip()}
        s.daily_passport_limit = _int("DAILY_PASSPORT_LIMIT", s.daily_passport_limit)
        s.ip_passports_per_hour = _int("IP_PASSPORTS_PER_HOUR", s.ip_passports_per_hour)
        s.ip_qc_per_minute = _int("IP_QC_PER_MINUTE", s.ip_qc_per_minute)
        s.max_upload_mb = _int("MAX_UPLOAD_MB", s.max_upload_mb)
        s.media_ttl_hours = _int("MEDIA_TTL_HOURS", s.media_ttl_hours)
        s.preview_cap = _int("PREVIEW_CAP", s.preview_cap)
        s.preview_debug = os.environ.get("PREVIEW_DEBUG", "").strip() in ("1", "true", "yes")
        s.passport_ttl_days = _int("PASSPORT_TTL_DAYS", s.passport_ttl_days)
        s.share_base_url = os.environ.get("SHARE_BASE_URL", "").strip()
        s.invite_unlock_codes = {c.strip() for c in os.environ.get("INVITE_UNLOCK_CODES", "").split(",") if c.strip()}
        return s
