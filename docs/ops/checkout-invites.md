# BeautyAI: ¥139 paid unlock and 24-hour one-time invitations

## Product flow

- Free reports keep the current free entitlements.
- The full passport costs **CNY 139 per report**, one-time (not a recurring subscription).
- **Preferred payment UX:** /p/{id}/unlock → create provider checkout → redirect to hosted payment → provider sends a verified, paid webhook → server sets the original passport paid → user returns to the SAME report. The return URL never grants paid access.
- Invite codes remain an alternative way to unlock a report. Payment does **not** generate or require a code.
- Production refuses fake payments. If the live merchant provider is not configured, the UI shows "支付暂未开放" while permanent and one-time invitations remain available.

## Issue 100 one-time codes that expire after 24 hours

Run this command in the **API runtime** with the *same RUNS_DIR / SQLite database* used by the running API:

~~~sh
python scripts/generate_invite_codes.py --count 100 --ttl-hours 24 --output /secure/invites-20261031.csv
~~~

Requirements:

1. Use a writable private directory outside the repository (example /secure is illustrative, create an actual directory first).
2. Only the running API's SQLite database contains the hashed codes and redemption state. CSV contents are bearer secrets; store and distribute privately, never in Git or build logs. A generated local CSV is **not** registered with the deployed API unless the command runs against the deployed API's persistent DB.
3. CSV includes batch ID, plaintext code, exact UTC expiration and initial unused status.
4. Each code unlocks **one** passport. The database rejects replay, expired and revoked codes. Redemption and premium entitlement are one SQLite transaction.
5. Legacy INVITE_UNLOCK_CODES remain reusable permanent unlocks. INVITE_CODES is a separate **upload gate** and remains unchanged.
6. Revocation (if ever needed) can be performed by an operator using the stored SHA-256 code hash and a database update; a public admin management endpoint was intentionally not added.

Example environment for the persistent SQLite path:

~~~sh
RUNS_DIR=/data/runs
~~~

Your active deployment must actually mount persistent storage there. Do not publish or paste actual codes.

## Automated payment, optional merchant-backed Stripe Checkout

This implementation includes an optional Stripe-hosted payment adapter to enable a real merchant-backed checkout without migrating the website to a WeChat Mini Program. Payment-method availability (e.g. Alipay, WeChat Pay or cards) depends on **Stripe merchant eligibility and dashboard settings**. This is not a claim that domestic WeChat H5 payment is already live. Other providers require their own signed API adapter.

Configure **server-side Render API environment** (never NEXT_PUBLIC, GitHub or frontend):

~~~dotenv
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_...                   # merchant private API key
STRIPE_WEBHOOK_SECRET=whsec_...             # signing secret for this webhook endpoint
PAYMENT_RETURN_BASE_URL=https://beautytest.byliyz.com
~~~

Configure Stripe's webhook destination as:

~~~text
https://YOUR_PUBLIC_API_HOST/api/payments/webhook
~~~

Subscribe to:
- checkout.session.completed
- checkout.session.async_payment_succeeded

Backend behavior:
- Creates CNY 139 Checkout Session with the current passport ID and hosted payment URL.
- Does not grant a paid entitlement when creating a session or receiving a browser redirect.
- Verifies Stripe-Signature using the **original raw request body**, strict timestamp tolerance and HMAC comparison.
- Checks that the event is a paid Checkout Session with CNY 13900 total and matches an actual pending order from our DB.
- Marks the order paid and the passport paid **atomically**, once.
- On return, the unlock page refreshes entitlement until the signed webhook has been processed. If confirmation is delayed, it reports pending rather than incorrectly claiming success.

For debugging, configure test-mode credentials first, exercise a test payment and verified webhook, and check paid entitlement on the same report. Actual money cannot be accepted without an eligible merchant account and validated credentials.

## Scope limitations

- This PR does not apply for a merchant account, enable payment methods, or charge any real customer.
- A different payment channel (direct WeChat Pay/Alipay) can use the existing create_checkout/verify_webhook interface; signed async confirmation is mandatory.
- Existing photo/media retention is separate: unlocking a report does not extend the photo TTL or restore expired photos.
