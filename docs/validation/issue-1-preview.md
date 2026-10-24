# Issue #1: preview reliability validation

Base: `tasconyeric-slack/BeautyAI`, `main` at `89bcf0f`. No source or samples were taken from the old repository.

## Reproduced failures and changes

- A fallback counted against both free quota and the paid preview cap. At the cap, the existing Studio retry
  action received HTTP 429 (or HTTP 402 for a free retry). Only pending reservations and successful previews now
  consume quota. A failed result keeps its failure status and has no preview URL; a successful retry consumes quota.
- Provider error prose, unchecked error-code/request-ID strings, quality-gate exception text and unexpected
  exception tracebacks could enter diagnostics. Logs now retain machine categories, allowlisted provider codes,
  UUID request IDs and timings, without provider prose, prompts, signed URLs or measured face/change values.
- Provider success followed by a registration/composite rejection previously lost its model, latency and cost.
  Each attempt now retains provider cost and timing and records operational milestones through crop preparation,
  provider request/completion, registration, composite, quality checks and saved preview. `latency_ms` measures
  the whole attempt; `provider_latency_ms` isolates the provider call. Failed stages never publish a successful URL.

The existing Qwen Beijing routing, prompts, crop/mask logic, registration limits, protected feature pixels,
duplicate-feature rejection and Studio failure/retry controls remain in use. No new library or model is needed.

## Automated evidence

Focused path:

```sh
python -m pytest -q tests/test_preview.py tests/test_preview_registration.py tests/test_hair_masks.py \
  tests/test_api.py tests/test_launch_guards.py
```

Regression coverage includes failed free and paid retries, successful quota consumption, mocked Qwen HTTP
generation/download through registration/compositing to a served image, rejected-output accounting, and
untrusted diagnostics. Portrait pixels and CV detections in these tests are synthetic. These tests verify
pipeline behavior, not photorealism or haircut adherence.

Local results (2026-10-24): focused path **119 passed, 2 skipped**; `make test` **517 passed, 17 skipped**;
`make lint` and `git diff --check` passed. Live-photo tests remain skipped without authorized samples.

## Live acceptance: BLOCKED

This environment has no `DASHSCOPE_API_KEY`, no configured `DASHSCOPE_BASE_URL` override and no consented samples
in `data/test_faces`. No live image call was made, no private photo was used, and actual live latency/cost and
visual acceptance are unmeasured. A Beijing-region key and a model-enabled endpoint are required; the default
endpoint may suffice, otherwise set the workspace endpoint with `DASHSCOPE_BASE_URL`.

Complete this small check in a private environment with explicit consent to send each sample to the provider:

1. Keep samples only in ignored `data/` or the API's expiring media directory. Submit a consented front photo and
   use the normal preview endpoint for two allowed haircut targets with different length, outline or fringe
   (for example a short bob and a long layered cut). Use the same original photo for both.
2. Follow the corresponding image-edit attempts in private `runs/<id>/calls.jsonl`. Check provider completion,
   registration, composite, quality pass and saved preview against the image served to Studio. Diagnostics must
   contain only operational categories/timings/cost, never images, prompts or signed download URLs.
3. Privately inspect the original and both outcomes for same-person recognition, eyes/brows/ears in their original
   positions without duplicates, natural hairline/temples/lighting, and recognizable target-style differences.
4. Record pass/fail and operational timings/cost privately. Publish only a sanitized aggregate result with no
   portraits, prompts, face measurements or credential-bearing URLs. Honor the existing 24-hour media deletion.

| Required observation | Short target | Long/layered target |
|---|---|---|
| Identity, naturalness, style match | Blocked | Blocked |
| No doubled/shifted eyes, brows or ears | Blocked | Blocked |
| Actual end-to-end / provider latency | Unmeasured | Unmeasured |
| Actual provider cost | Unmeasured | Unmeasured |

Configured cost is an estimate of USD 0.03 per generated Qwen image: USD 0.06 for two first-attempt outputs,
up to USD 0.12 if each needs the existing one retry. Rejected generated outputs can still incur provider cost;
they do not consume user preview entitlement. These estimates are not live billing evidence.
