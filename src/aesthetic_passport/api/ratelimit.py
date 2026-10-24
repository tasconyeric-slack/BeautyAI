"""Tiny in-memory sliding-window limiter (single API instance; good enough for an invite-only demo)."""
from __future__ import annotations

import hashlib
import os
import threading
import time
from collections import defaultdict, deque

_SALT = os.environ.get("IP_HASH_SALT", "aesthetic-passport")


def hash_ip(ip: str | None) -> str | None:
    if not ip:
        return None
    return hashlib.sha256(f"{_SALT}:{ip}".encode()).hexdigest()[:16]


class SlidingWindow:
    def __init__(self, limit: int, window_s: float):
        self.limit, self.window_s = limit, window_s
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str | None) -> bool:
        if self.limit <= 0 or key is None:
            return True
        t = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and t - q[0] > self.window_s:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(t)
            return True
