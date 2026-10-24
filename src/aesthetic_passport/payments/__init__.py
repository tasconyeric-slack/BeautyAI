"""Payment providers (D27). PAYMENT_PROVIDER=fake (default) needs no credentials; real WeChat Pay / Alipay H5 adapters
are added later with merchant credentials (D3)."""
from __future__ import annotations

import os

from .base import Checkout, PaymentError, PaymentProvider
from .fake import FakePaymentProvider

__all__ = ["Checkout", "FakePaymentProvider", "PaymentError", "PaymentProvider", "payment_from_env"]


def payment_from_env() -> PaymentProvider:
    from ..runtime import mocks_allowed

    name = os.environ.get("PAYMENT_PROVIDER", "fake").strip().lower() or "fake"
    if name == "fake":
        if not mocks_allowed():  # never "charge" ¥39 through a fake provider in production
            raise PaymentError("payment is not available yet")
        return FakePaymentProvider()
    raise PaymentError(f"payment provider {name!r} is not configured (merchant credentials required)")
