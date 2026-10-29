# Preview recovery and quality acceptance

Refs #54, #1; backend recovery adapted from PR #49 (`360d453`). No deployment changes are included here.

## Verified failure and mitigation

The sanitized production evidence in #54 records an accepted preview request, an OOM restart on Free / 512 MiB,
and a subsequent missing report. This is premature loss of ephemeral SQLite/media, not the 24-hour photo TTL.
Changing application code cannot restore wiped storage. PR #49's infrastructure migration remains a separate
human deployment/cost gate: preserve accessible reports, provision sufficient memory and persistent `/data`, then
verify report survival across a supported restart. Do not treat the mitigation here as production migration.

Reuse #49's concurrency=1 and startup recovery rather than merging its frontend/deployment changes. Each process
also needs one shared preview budget: a per-batch executor alone allows independent HTTP requests to overlap.
Acquire the budget before reading the job/photo so queued work checks deletion and TTL when it actually starts.
On restart, process-local background jobs cannot resume; pending rows become `fallback`, preserving payment,
report content and original expiry. Existing succeeded rows stay unchanged. Deployment is currently single-worker;
multiple worker processes would require a shared queue/lease rather than a Python semaphore.

A separate eight-thread reproduction on Python 3.12 returned `None` for existing reports. Store execution is locked,
but fetches happen after the lock is released. Disable the shared statement cache, the minimal workaround for
[CPython #118172](https://github.com/python/cpython/issues/118172), and verify concurrent reads retain the requested
IDs. This fixes locally reproduced false misses; it does not establish that production's OOM incident had this cause.
Operational traces also distinguish crop restoration, registration and final composite verification, without
logging landmarks, quality measurements, raw prompts or images.

## Frontend contract (unchanged)

- Poll `pending`; terminate waiting on `fallback`, `failed`, `succeeded` or `skipped`.
- `fallback` is a rejected/unavailable generation, with a safe `error` and a retry of the same target. It is not a
  successful photorealistic preview. Failed outputs do not consume the active preview quota.
- Use `after_url`, `before_url` and `crop_box` only for their matching report, target and source photo. Do not bind
  differently cropped gallery photography to report geometry. Geometry is available only before media expiry.
- A missing report (404) is not evidence that its photos legitimately expired. PR #49's frontend preserves a loaded
  report during transient server loss; the frontend owner should assess that part independently.

## Quality boundary and next live check

Keep all registration, residual, duplicate-feature and final-composite checks unchanged. A `MisalignedEdit` user
message alone does not identify whether rejection occurred at aspect restoration, registration or final verification.
Do not lower thresholds based on the reported message. Existing candidates show target-adherence concerns, including
over-curled ends instead of a restrained inward C bend; no prompt/model change is justified as validated without
paired live output.

Compare the existing OpenCV registration/composite path, a prompt-only adjustment and replacing the image provider.
The existing path is the smallest compatible choice: no new dependency, licence, model or deployment cost. Defer
prompt/provider changes until an authorized same-source run demonstrates the actual failure. References:
[PR #49](https://github.com/tasconyeric-slack/BeautyAI/pull/49),
[prior target-adherence work #43](https://github.com/tasconyeric-slack/BeautyAI/pull/43),
[quality acceptance #1](https://github.com/tasconyeric-slack/BeautyAI/issues/1).

Live verification requires `DASHSCOPE_API_KEY` and, when required by the account, `DASHSCOPE_BASE_URL` in the local
environment. Use the same `request_previews` → `run_preview_job` path as the website, original source and exact
matching passport, first safe/easy, then the reported failed targets. Keep attempt logs operational only, and all
photos/results under ignored `runs/` or authorized external review storage; preserve the production 24h TTL.
Fixtures, fake renders and already-supplied candidate images cannot establish a fresh real-provider pass.
