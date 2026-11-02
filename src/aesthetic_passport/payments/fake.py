"""Fake payment provider: every checkout settles at once. For development, tests and demos (no credentials)."""
from __future__ import annotations

import uuid
from typing import Any

from .base import Checkout, PaymentError


class FakePaymentProvider:
    name = "fake"

    def create_checkout(self, passport_id: str, amount_cny: float) -> Checkout:
        return Checkout(order_id=f"fake_{uuid.uuid4().hex[:16]}", pay_url=None, settled=True)

    def verify_webhook(self, body: dict[str, Any], headers: dict[str, str],
                       raw_body: bytes | None = None) -> tuple[str, str]:
        order_id, status = body.get("order_id"), body.get("status")
        if not isinstance(order_id, str) or not order_id.startswith("fake_") or status not in ("paid", "failed"):
            raise PaymentError("invalid fake webhook")
        return order_id, status
