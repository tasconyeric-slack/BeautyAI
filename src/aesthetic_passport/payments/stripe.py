"""Optional Stripe-hosted CNY checkout; paid entitlements are granted by signed webhooks ONLY.

Requires a merchant Stripe account and server-side secrets; provider remains unavailable if missing.
Stripe payment method eligibility (including Alipay/WeChat Pay) depends on merchant account.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from decimal import Decimal
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import Request, urlopen

from .base import Checkout, PaymentError


class StripePaymentProvider:
    name = "stripe"

    def __init__(self) -> None:
        self.api_key = os.environ.get("STRIPE_SECRET_KEY", "").strip()
        self.webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
        self.site_url = os.environ.get("PAYMENT_RETURN_BASE_URL", "").strip().rstrip("/")
        if not self.api_key.startswith("sk_") or not self.webhook_secret.startswith("whsec_"):
            raise PaymentError("Stripe credentials are not configured")
        parsed = urlparse(self.site_url)
        if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1")):
            raise PaymentError("PAYMENT_RETURN_BASE_URL must use HTTPS")

    def create_checkout(self, passport_id: str, amount_cny: float) -> Checkout:
        cents = int((Decimal(str(amount_cny)) * 100).to_integral_exact())
        if cents <= 0:
            raise PaymentError("invalid charge amount")
        home = f"{self.site_url}/p/{quote(passport_id, safe='')}/unlock"
        fields = {
            "mode": "payment",
            "client_reference_id": passport_id,
            "success_url": f"{home}?payment=return",
            "cancel_url": f"{home}?payment=cancel",
            "line_items[0][price_data][currency]": "cny",
            "line_items[0][price_data][unit_amount]": str(cents),
            "line_items[0][price_data][product_data][name]": "BeautyAI 完整形象护照",
            "line_items[0][quantity]": "1",
        }
        request = Request(
            "https://api.stripe.com/v1/checkout/sessions",
            data=urlencode(fields).encode("utf-8"),
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=12) as response:
                session = json.loads(response.read())
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            raise PaymentError("Stripe checkout unavailable") from exc
        session_id, url = session.get("id"), session.get("url")
        if not isinstance(session_id, str) or not session_id.startswith("cs_") or not isinstance(url, str):
            raise PaymentError("Stripe returned an invalid checkout session")
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname != "checkout.stripe.com":
            raise PaymentError("Stripe returned an unexpected checkout URL")
        return Checkout(order_id=session_id, pay_url=url, settled=False)

    def verify_webhook(self, body: dict[str, Any], headers: dict[str, str],
                       raw_body: bytes | None = None) -> tuple[str, str]:
        signature = headers.get("stripe-signature", "")
        if raw_body is None or not signature:
            raise PaymentError("Stripe webhook signature required")
        values: dict[str, list[str]] = {}
        for part in signature.split(","):
            key, _, value = part.strip().partition("=")
            values.setdefault(key, []).append(value)
        try:
            timestamp = int(values["t"][0])
            signatures = values["v1"]
        except (ValueError, KeyError, IndexError) as exc:
            raise PaymentError("invalid Stripe signature header") from exc
        if abs(time.time() - timestamp) > 300:
            raise PaymentError("stale Stripe webhook timestamp")
        signed = str(timestamp).encode() + b"." + raw_body
        expected = hmac.new(self.webhook_secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
        if not any(hmac.compare_digest(expected, sig) for sig in signatures):
            raise PaymentError("invalid Stripe signature")
        try:
            event = json.loads(raw_body)
        except (ValueError, UnicodeError) as exc:
            raise PaymentError("invalid Stripe webhook body") from exc
        typ = event.get("type")
        if typ not in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            return "", "ignored"
        session = event.get("data", {}).get("object", {})
        if not isinstance(session, dict) or session.get("mode") != "payment":
            raise PaymentError("invalid Stripe checkout event")
        if session.get("payment_status") != "paid":
            return "", "ignored"
        from ..api.entitlement import pricing
        expected_cents = int(Decimal(str(pricing()["full_passport_price"])) * 100)
        if session.get("currency") != "cny" or session.get("amount_total") != expected_cents:
            raise PaymentError("checkout amount or currency mismatch")
        order_id = session.get("id")
        if not isinstance(order_id, str) or not order_id.startswith("cs_"):
            raise PaymentError("invalid Stripe checkout session id")
        return order_id, "paid"
