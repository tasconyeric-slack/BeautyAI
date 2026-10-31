"""Payment providers (D27). Fake mode is development only; optional Stripe-hosted checkout requires merchant credentials."""
from __future__ import annotations

import os

from .base import Checkout, PaymentError, PaymentProvider
from .fake import FakePaymentProvider
from .stripe import StripePaymentProvider

__all__ = ["Checkout", "FakePaymentProvider", "StripePaymentProvider", "PaymentError", "PaymentProvider", "payment_from_env"]


def payment_from_env() -> PaymentProvider:
    from ..runtime import mocks_allowed

    name = os.environ.get("PAYMENT_PROVIDER", "fake").strip().lower() or "fake"
    if name == "fake":
        if not mocks_allowed():  # never "charge" money through a fake provider in production
            raise PaymentError("payment is not available yet")
        return FakePaymentProvider()
    if name == "stripe":
        return StripePaymentProvider()
    raise PaymentError(f"payment provider {name!r} is not configured (merchant credentials required)")
