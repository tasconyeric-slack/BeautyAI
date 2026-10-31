"""Payment provider interface: create a checkout, verify a webhook."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


class PaymentError(RuntimeError):
    pass


@dataclass
class Checkout:
    order_id: str
    pay_url: str | None       # where the H5 page sends the user (None for fake: settles immediately)
    settled: bool             # fake provider: paid on creation


class PaymentProvider(Protocol):
    name: str

    def create_checkout(self, passport_id: str, amount_cny: float) -> Checkout: ...

    def verify_webhook(self, body: dict[str, Any], headers: dict[str, str],
                       raw_body: bytes | None = None) -> tuple[str, str]:
        """Return (order_id, status) or raise PaymentError for an invalid notification."""
        ...
