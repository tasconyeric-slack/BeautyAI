# Issue #1: preview reliability validation

## Backend continuation from `main` at `bf5b275`

PR #7 is already integrated. This continuation reproduces one remaining failure with synthetic pixels and mocked
Qwen HTTP, without changing the provider, prompts, masks, registration limits or upload framing editor:

- Qwen returns a square image for a portrait request. The output aspect-ratio guard rejects it before resizing
  or registration, but raised `PreviewError`, which the job treats as a terminal input failure. Only one request
  ran, even though another generation with a new seed could recover.
- The guard now raises the existing `MisalignedEdit` quality-gate failure. The existing retry loop tries once with
  the next seed. A valid second response proceeds through registration, composite and quality checks to the served
  preview; a second reframed response ends in `fallback` with a useful error, no image URL and no entitlement spent.
- The regression covers both outcomes through the API and retains each generated attempt's USD 0.03 estimated
  cost, even when rejected. Signed result URLs remain absent from diagnostics. Before the fix, both cases failed
  because only seed 7 ran; after it, seeds 7 and 8 run and both cases pass.

Local validation (2026-10-24): the focused command below passed **121 tests, 2 skipped**; `make test` passed
**555 tests, 32 skipped**; `make lint` and `git diff --check` passed. The new regression's two cases and the engine
rejection test passed. Tests used downloaded MediaPipe models and a local Debian `libgles2` library; no portraits
or provider credentials were installed.

Live acceptance remains **BLOCKED** in this cloud run: `DASHSCOPE_API_KEY` is unset and `data/test_faces` has no
authorized portrait samples (the directory is absent). No live provider request was made. `DASHSCOPE_BASE_URL`
is also unset, but is optional if the configured Beijing endpoint serves the selected model. Supply a Beijing key
authorized for `qwen-image-2.0` and the consented photo set privately to complete the two-cut comparison below.
Identity, naturalness, haircut adherence, live latency and actual billed cost remain unmeasured. These fixture
results demonstrate recovery and failure behavior only; they do not demonstrate photorealistic quality.

## Earlier PR #7 evidence

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
