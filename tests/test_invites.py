"""Single-use premium invitations: persistence, replay, concurrency and expiry."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from aesthetic_passport.api.store import Store, iso, now


def test_batch_100_codes_24_hours_and_persistence(tmp_path):
    path = tmp_path / "app.db"
    store = Store(path)
    batch, codes, expires_at = store.issue_invite_codes(100, 24)
    assert len(codes) == len(set(codes)) == 100
    assert len(batch) == 16
    assert expires_at > iso(now() + timedelta(hours=23))
    assert all(code.startswith("BAI-") for code in codes)
    row = store._exec("SELECT COUNT(*) AS n FROM invite_codes WHERE batch_id=?", (batch,)).fetchone()
    assert row["n"] == 100
    pid1, pid2 = "ap_000000000001", "ap_000000000002"
    store.create(pid1, None, 24)
    store.create(pid2, None, 24)
    assert store.redeem_one_time_invite(codes[0], pid1) is True
    assert store.get(pid1)["paid"] == 1
    assert store.redeem_one_time_invite(codes[0], pid2) is False
    assert Store(path).redeem_one_time_invite(codes[0], pid2) is False
    assert store.get(pid2)["paid"] == 0


def test_atomic_double_redemption(tmp_path):
    store = Store(tmp_path / "app.db")
    _, codes, _ = store.issue_invite_codes(1, 24)
    pids = [f"ap_{i:012x}" for i in range(1, 21)]
    for pid in pids:
        store.create(pid, None, 24)
    with ThreadPoolExecutor(max_workers=20) as executor:
        outcomes = list(executor.map(lambda pid: store.redeem_one_time_invite(codes[0], pid), pids))
    assert outcomes.count(True) == 1
    assert sum(bool(store.get(pid)["paid"]) for pid in pids) == 1


def test_expiry_revocation_and_no_double_benefit(tmp_path):
    store = Store(tmp_path / "app.db")
    _, codes, _ = store.issue_invite_codes(3, 24)
    pid = "ap_000000000001"
    store.create(pid, None, 24)
    from hashlib import sha256
    expired = sha256(codes[0].encode()).hexdigest()
    revoked = sha256(codes[1].encode()).hexdigest()
    store._exec("UPDATE invite_codes SET expires_at=? WHERE code_hash=?",
                (iso(now() - timedelta(seconds=1)), expired))
    store._exec("UPDATE invite_codes SET revoked_at=? WHERE code_hash=?", (iso(now()), revoked))
    assert store.redeem_one_time_invite(codes[0], pid) is False
    assert store.redeem_one_time_invite(codes[1], pid) is False
    assert store.redeem_one_time_invite(codes[2], pid) is True
    assert store.get(pid)["paid"] == 1
    # A second code is NOT wasted to unlock an already-paid passport.
    pid2 = "ap_000000000002"
    store.create(pid2, None, 24)
    _, more, _ = store.issue_invite_codes(1, 24)
    assert store.redeem_one_time_invite(more[0], pid) is False
    assert store.redeem_one_time_invite(more[0], pid2) is True
