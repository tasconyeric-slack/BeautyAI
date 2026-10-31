"""Signed Stripe webhook/checkout tests; no network calls, no live payments."""
from __future__ import annotations

import hashlib
import hmac
import json
import time

import pytest

from aesthetic_passport.payments.base import PaymentError
from aesthetic_passport.payments.stripe import StripePaymentProvider


@pytest.fixture
def provider(monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_not_real")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_not_real")
    monkeypatch.setenv("PAYMENT_RETURN_BASE_URL", "https://beautytest.byliyz.com")
    return StripePaymentProvider()


def signed_event(event, secret="whsec_not_real"):
    raw = json.dumps(event, separators=(",", ":")).encode()
    ts = str(int(time.time()))
    sig = hmac.new(secret.encode(), ts.encode() + b"." + raw, hashlib.sha256).hexdigest()
    return raw, {"stripe-signature": f"t={ts},v1={sig}"}


def test_signed_paid_checkout_unlock_signal(provider):
    event = {"type": "checkout.session.completed", "data": {"object": {
        "id": "cs_test_example", "mode": "payment", "payment_status": "paid",
        "amount_total": 13900, "currency": "cny",
    }}}
    raw, headers = signed_event(event)
    assert provider.verify_webhook(event, headers, raw) == ("cs_test_example", "paid")
    with pytest.raises(PaymentError):
        provider.verify_webhook(event, headers, raw + b" ")


def test_unpaid_or_wrong_price_cannot_unlock(provider):
    unpaid = {"type": "checkout.session.completed", "data": {"object": {
        "id": "cs_test_example", "mode": "payment", "payment_status": "unpaid",
        "amount_total": 13900, "currency": "cny",
    }}}
    raw, headers = signed_event(unpaid)
    assert provider.verify_webhook(unpaid, headers, raw) == ("", "ignored")
    unpaid["data"]["object"]["payment_status"] = "paid"
    unpaid["data"]["object"]["amount_total"] = 3900
    raw, headers = signed_event(unpaid)
    with pytest.raises(PaymentError):
        provider.verify_webhook(unpaid, headers, raw)


def test_only_https_return_url(monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_not_real")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_not_real")
    monkeypatch.setenv("PAYMENT_RETURN_BASE_URL", "http://example.com")
    with pytest.raises(PaymentError):
        StripePaymentProvider()
