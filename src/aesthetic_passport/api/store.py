"""SQLite job store (runs/app.db).

Tables
    passports          one row per passport: job status, partial snapshots (anchors / quick), the passport JSON
                       (no images), entitlement bookkeeping (paid, share_token) and retention timestamps
    preview_jobs       one row per (passport, kind, target) AI preview
    preference_events  user feedback (D26) — only ever feeds the rules layer
    events             minimal funnel events: name, hashed passport id, topic, ref, time (no photo-derived data)
    payments           single-purchase records (D27), idempotent per provider order id
    invite_codes       hashed single-use premium unlock codes, atomically redeemed

Client IPs are stored as salted hashes for rate limiting and are never logged.
"""
from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS passports (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,            -- queued | running | done | failed | deleted
    stage TEXT,
    error_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    media_expires_at TEXT,
    media_deleted INTEGER NOT NULL DEFAULT 0,
    ip_hash TEXT,
    passport_json TEXT
);
CREATE TABLE IF NOT EXISTS preview_jobs (
    passport_id TEXT NOT NULL,
    kind TEXT NOT NULL,              -- hair | glasses | neckline
    target_id TEXT NOT NULL,         -- safe | bold | easy | rN
    status TEXT NOT NULL,            -- pending | succeeded | failed | skipped | fallback
    paid INTEGER NOT NULL DEFAULT 0, -- counted against the paid quota (else the free one)
    image_model TEXT,
    prompt_used TEXT,
    after_name TEXT,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (passport_id, kind, target_id)
);
CREATE TABLE IF NOT EXISTS preference_events (
    passport_id TEXT NOT NULL,
    event_key TEXT NOT NULL,         -- client id or content hash: makes POST /feedback idempotent
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reaction TEXT NOT NULL,
    reason_tags_json TEXT NOT NULL,
    ts TEXT NOT NULL,
    PRIMARY KEY (passport_id, event_key)
);
CREATE TABLE IF NOT EXISTS events (
    name TEXT NOT NULL,
    pid_hash TEXT,
    topic TEXT,
    ref TEXT,
    ts TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
    order_id TEXT PRIMARY KEY,
    passport_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    amount_cny REAL NOT NULL,
    status TEXT NOT NULL,            -- created | paid
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invite_codes (
    code_hash TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    redeemed_at TEXT,
    redeemed_passport_id TEXT,
    revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_invite_batch ON invite_codes(batch_id);
"""
# Columns added after V1 (ALTER TABLE on existing databases).
PASSPORT_COLUMNS = {
    "anchors_json": "TEXT",          # partial: {input_quality, anchors}
    "quick_json": "TEXT",            # partial: quick analysis
    "quick_failed": "INTEGER NOT NULL DEFAULT 0",
    "share_token": "TEXT",
    "paid": "INTEGER NOT NULL DEFAULT 0",
    "saved": "INTEGER NOT NULL DEFAULT 0",
    "json_expires_at": "TEXT",       # unsaved passports: JSON deleted after N days
    "deleted_at": "TEXT",
}


def now() -> datetime:
    return datetime.now(UTC)


def iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


class Store:
    def __init__(self, db_path: Path):
        db_path.parent.mkdir(parents=True, exist_ok=True)
        # execute() is locked, but cursors are fetched outside that lock. CPython's shared statement cache can
        # return empty/wrong rows across threads (python/cpython#118172); disable reuse on this shared connection.
        self._db = sqlite3.connect(db_path, check_same_thread=False, isolation_level=None, cached_statements=0)
        self._db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._db.execute("PRAGMA journal_mode=WAL")
            self._db.executescript(SCHEMA)
            have = {r[1] for r in self._db.execute("PRAGMA table_info(passports)").fetchall()}
            for col, decl in PASSPORT_COLUMNS.items():
                if col not in have:
                    self._db.execute(f"ALTER TABLE passports ADD COLUMN {col} {decl}")
            self._db.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_share ON passports(share_token)")

    def _exec(self, sql: str, args: tuple = ()) -> sqlite3.Cursor:
        with self._lock:
            return self._db.execute(sql, args)

    # --- passports ---------------------------------------------------------------
    def create(self, pid: str, ip_hash: str | None, media_ttl_hours: int, json_ttl_days: int = 7) -> None:
        t = now()
        self._exec(
            "INSERT INTO passports (id, status, stage, created_at, updated_at, media_expires_at, ip_hash, json_expires_at) "
            "VALUES (?, 'queued', NULL, ?, ?, ?, ?, ?)",
            (pid, iso(t), iso(t), iso(t + timedelta(hours=media_ttl_hours)), ip_hash, iso(t + timedelta(days=json_ttl_days))),
        )

    def set_stage(self, pid: str, stage: str) -> None:
        self._exec("UPDATE passports SET status='running', stage=?, updated_at=? WHERE id=? AND status!='deleted'",
                   (stage, iso(now()), pid))

    def set_partial(self, pid: str, kind: str, payload: Any) -> None:
        if kind == "anchors":
            self._exec("UPDATE passports SET anchors_json=?, updated_at=? WHERE id=?",
                       (json.dumps(payload, ensure_ascii=False), iso(now()), pid))
        elif kind == "quick":
            self._exec("UPDATE passports SET quick_json=?, updated_at=? WHERE id=?",
                       (json.dumps(payload, ensure_ascii=False), iso(now()), pid))
        elif kind == "quick_failed":
            self._exec("UPDATE passports SET quick_failed=1, updated_at=? WHERE id=?", (iso(now()), pid))

    def finish(self, pid: str, passport: dict[str, Any]) -> None:
        self._exec("UPDATE passports SET status='done', stage='done', passport_json=?, error_json=NULL, updated_at=? "
                   "WHERE id=? AND status!='deleted'", (json.dumps(passport, ensure_ascii=False), iso(now()), pid))

    def update_passport(self, pid: str, passport: dict[str, Any]) -> None:
        self._exec("UPDATE passports SET passport_json=?, updated_at=? WHERE id=? AND status!='deleted'",
                   (json.dumps(passport, ensure_ascii=False), iso(now()), pid))

    def fail(self, pid: str, code: str, detail: str, payload: dict[str, Any] | None = None) -> None:
        err = {"code": code, "detail": detail, **({"payload": payload} if payload else {})}
        self._exec("UPDATE passports SET status='failed', error_json=?, updated_at=? WHERE id=? AND status!='deleted'",
                   (json.dumps(err, ensure_ascii=False), iso(now()), pid))

    def get(self, pid: str) -> dict[str, Any] | None:
        row = self._exec("SELECT * FROM passports WHERE id=?", (pid,)).fetchone()
        if not row:
            return None
        d = dict(row)
        for key in ("passport", "error", "anchors", "quick"):
            raw = d.pop(f"{key}_json")
            d[key] = json.loads(raw) if raw else None
        return d

    def count_since(self, since: datetime, ip_hash: str | None = None) -> int:
        if ip_hash:
            row = self._exec("SELECT COUNT(*) FROM passports WHERE created_at>=? AND ip_hash=?", (iso(since), ip_hash))
        else:
            row = self._exec("SELECT COUNT(*) FROM passports WHERE created_at>=?", (iso(since),))
        return int(row.fetchone()[0])

    def expired_media(self, at: datetime) -> list[str]:
        rows = self._exec("SELECT id FROM passports WHERE media_deleted=0 AND media_expires_at<?", (iso(at),))
        return [r[0] for r in rows.fetchall()]

    def expired_json(self, at: datetime) -> list[str]:
        rows = self._exec("SELECT id FROM passports WHERE saved=0 AND status!='deleted' AND json_expires_at<?", (iso(at),))
        return [r[0] for r in rows.fetchall()]

    def mark_media_deleted(self, pid: str) -> None:
        self._exec("UPDATE passports SET media_deleted=1 WHERE id=?", (pid,))

    def set_share_token(self, pid: str, token: str) -> None:
        self._exec("UPDATE passports SET share_token=? WHERE id=?", (token, pid))

    def by_share_token(self, token: str) -> dict[str, Any] | None:
        row = self._exec("SELECT id FROM passports WHERE share_token=?", (token,)).fetchone()
        return self.get(row[0]) if row else None

    def issue_invite_codes(self, count: int = 100, ttl_hours: int = 24) -> tuple[str, list[str]]:
        """Create a persistent batch. Plaintext codes are returned only once for private CSV export."""
        if not 1 <= count <= 5000 or not 1 <= ttl_hours <= 8760:
            raise ValueError("count must be 1..5000 and ttl_hours must be 1..8760")
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        batch_id = secrets.token_hex(8)
        created = now()
        issued_at, expires_at = iso(created), iso(created + timedelta(hours=ttl_hours))
        codes: list[str] = []
        with self._lock:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                for _ in range(count):
                    # 20 random characters from a 32-character alphabet: ~100 bits.
                    code = "BAI-" + "-".join("".join(secrets.choice(alphabet) for _ in range(5))
                                            for _ in range(4))
                    digest = hashlib.sha256(code.encode("ascii")).hexdigest()
                    self._db.execute(
                        "INSERT INTO invite_codes (code_hash, batch_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                        (digest, batch_id, issued_at, expires_at),
                    )
                    codes.append(code)
                self._db.execute("COMMIT")
            except Exception:
                self._db.execute("ROLLBACK")
                raise
        return batch_id, codes

    def redeem_one_time_invite(self, code: str, pid: str) -> bool:
        """Redeem at most once globally, with entitlement in the SAME SQLite transaction."""
        digest = hashlib.sha256(code.strip().upper().encode("utf-8")).hexdigest()
        redeemed_at = iso(now())
        with self._lock:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                updated = self._db.execute(
                    "UPDATE invite_codes SET redeemed_at=?, redeemed_passport_id=? "
                    "WHERE code_hash=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?",
                    (redeemed_at, pid, digest, redeemed_at),
                )
                if updated.rowcount != 1:
                    self._db.execute("ROLLBACK")
                    return False
                awarded = self._db.execute(
                    "UPDATE passports SET paid=1, saved=1, updated_at=? WHERE id=? AND status!='deleted' "
                    "AND paid=0", (redeemed_at, pid),
                )
                if awarded.rowcount != 1:
                    self._db.execute("ROLLBACK")
                    return False
                self._db.execute("COMMIT")
                return True
            except Exception:
                self._db.execute("ROLLBACK")
                raise

    def set_paid(self, pid: str) -> None:
        self._exec("UPDATE passports SET paid=1, saved=1, updated_at=? WHERE id=?", (iso(now()), pid))

    def delete(self, pid: str) -> str:
        """Erase every user-derived row for the passport; keep a tombstone (id, status, deleted_at)."""
        t = iso(now())
        with self._lock:
            self._db.execute("BEGIN")
            self._db.execute(
                "UPDATE passports SET status='deleted', stage=NULL, error_json=NULL, passport_json=NULL, anchors_json=NULL, "
                "quick_json=NULL, share_token=NULL, ip_hash=NULL, media_deleted=1, deleted_at=?, updated_at=? WHERE id=?",
                (t, t, pid))
            self._db.execute("DELETE FROM preview_jobs WHERE passport_id=?", (pid,))
            self._db.execute("DELETE FROM preference_events WHERE passport_id=?", (pid,))
            self._db.execute("COMMIT")
        return t

    # --- previews ----------------------------------------------------------------
    def upsert_preview(self, pid: str, kind: str, target_id: str, status: str, *, paid: bool | None = None,
                       image_model: str | None = None, prompt_used: str | None = None, after_name: str | None = None,
                       error: str | None = None, attempts: int | None = None) -> None:
        t = iso(now())
        self._exec(
            "INSERT INTO preview_jobs (passport_id, kind, target_id, status, paid, image_model, prompt_used, after_name, "
            "error, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(passport_id, kind, target_id) DO UPDATE SET status=excluded.status, "
            "paid=COALESCE(?, paid), image_model=excluded.image_model, prompt_used=excluded.prompt_used, "
            "after_name=excluded.after_name, error=excluded.error, attempts=COALESCE(?, attempts), updated_at=excluded.updated_at",
            (pid, kind, target_id, status, int(bool(paid)), image_model, prompt_used, after_name, error, attempts or 0, t, t,
             None if paid is None else int(paid), attempts),
        )

    def recover_pending_previews(self) -> list[str]:
        """Mark interrupted jobs retryable after an API restart.

        BackgroundTasks are process-local: a terminated worker cannot complete its
        pending rows. Keep paid entitlement and generated passports unchanged.
        """
        with self._lock:
            rows = self._db.execute(
                "SELECT DISTINCT passport_id FROM preview_jobs WHERE status='pending'"
            ).fetchall()
            if rows:
                self._db.execute(
                    "UPDATE preview_jobs SET status='fallback', error=?, updated_at=? WHERE status='pending'",
                    ("本次试看因服务重启中断，请重试生成", iso(now())),
                )
        return [r[0] for r in rows]

    def previews(self, pid: str) -> list[dict[str, Any]]:
        rows = self._exec("SELECT * FROM preview_jobs WHERE passport_id=? ORDER BY created_at, kind, target_id",
                          (pid,)).fetchall()
        return [dict(r) for r in rows]

    # --- preference events ------------------------------------------------------------
    def add_preference_event(self, pid: str, key: str, ev: dict[str, Any]) -> bool:
        """Insert once per (passport, key). Returns False for a duplicate (idempotent replay)."""
        cur = self._exec(
            "INSERT OR IGNORE INTO preference_events (passport_id, event_key, target_type, target_id, reaction, "
            "reason_tags_json, ts) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (pid, key, ev["target_type"], ev["target_id"], ev["reaction"],
             json.dumps(ev.get("reason_tags") or [], ensure_ascii=False), ev["ts"]))
        return cur.rowcount == 1

    def preference_events(self, pid: str) -> list[dict[str, Any]]:
        rows = self._exec("SELECT * FROM preference_events WHERE passport_id=? ORDER BY ts, rowid", (pid,)).fetchall()
        return [{"target_type": r["target_type"], "target_id": r["target_id"], "reaction": r["reaction"],
                 "reason_tags": json.loads(r["reason_tags_json"]), "ts": r["ts"]} for r in rows]

    # --- funnel events / payments -------------------------------------------------------------
    def add_event(self, name: str, pid_hash: str | None, topic: str | None, ref: str | None) -> None:
        self._exec("INSERT INTO events (name, pid_hash, topic, ref, ts) VALUES (?, ?, ?, ?, ?)",
                   (name, pid_hash, topic, ref, iso(now())))

    def events(self) -> list[dict[str, Any]]:
        return [dict(r) for r in self._exec("SELECT * FROM events ORDER BY rowid").fetchall()]

    def create_payment(self, order_id: str, pid: str, provider: str, amount: float) -> None:
        t = iso(now())
        self._exec("INSERT OR IGNORE INTO payments (order_id, passport_id, provider, amount_cny, status, created_at, "
                   "updated_at) VALUES (?, ?, ?, ?, 'created', ?, ?)", (order_id, pid, provider, amount, t, t))

    def mark_payment_paid(self, order_id: str) -> tuple[str | None, bool]:
        """(passport_id, newly_paid). A replayed webhook returns newly_paid=False and changes nothing."""
        row = self._exec("SELECT passport_id, status FROM payments WHERE order_id=?", (order_id,)).fetchone()
        if not row:
            return None, False
        if row["status"] == "paid":
            return row["passport_id"], False
        self._exec("UPDATE payments SET status='paid', updated_at=? WHERE order_id=?", (iso(now()), order_id))
        self.set_paid(row["passport_id"])
        return row["passport_id"], True

    def payments(self, pid: str) -> list[dict[str, Any]]:
        return [dict(r) for r in self._exec("SELECT * FROM payments WHERE passport_id=?", (pid,)).fetchall()]
