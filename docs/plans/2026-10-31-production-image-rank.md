# Authorized production photo-sample ranking

Owner direction: show both Ridge score and rank on the public website; on 2026-10-31 the owner explicitly confirmed permission for production ranking and aggregate retention and requested direct implementation.

## Design and alternatives

Use the existing frozen SCUT held-out image distribution and ECDF, with a separate private production permission receipt bound to the full model identity, reference SHA256, cohort and distribution version. Preserve image units, unknown subject count, unverified age/identity limitations and all QC, precision and tail limits. This is a photo-sample comparison, not an adult-subject cohort or population rank.

Alternatives: importing a new consented adult cohort is valid but requires external data; setting research mode in production or changing existing adult/dedup flags would misrepresent the evidence and is rejected. No new dependency, training, model, schema field or infrastructure is needed. Source and its default research restriction: https://github.com/HCIILAB/SCUT-FBP5500-Database-Release . The owner's additional permission is recorded as an attestation, not independently verified legal evidence.

## Implementation plan

- [x] Add failing tests: explicit image-reference authorization permits a production model; missing/mismatched receipt, failed QC, research-only model, version mismatch and synthetic cohorts stay unavailable.
- [x] Add the narrowly scoped image-reference capability to rank gates, and verify the private receipt at the Ridge service boundary. Keep default production adult-subject gates intact.
- [x] Show named photo reference, image count and limitations in the existing score card and PDF; test visible copy.
- [x] Document D43, operational variables and receipt format; run full Python tests/lint and affected web tests/typecheck. Run the real frozen model/reference locally on the approved synthetic photo and validate the resulting Passport.
- [ ] Open a manual-review PR. Prepare and verify private Render files without exposing them in Git. Human squash merge is required by repository policy for authorization/privacy changes; after merge, activate and run one production upload.

## Review focus

- A scoring receipt alone must never authorize production photo ranking.
- Every identity/reference binding and both grant booleans must match exactly; malformed receipts fail closed.
- Photo references must never acquire verified-adult or unique-subject claims.
- Model/QC/tail gates and missing-reference behavior remain unchanged.
- Web and PDF must both identify the sample; do not convert display score into percentile.

Execution: inline by the assigned agent; no delegation. Ruling: implement directly per the owner's instruction; do not add a further design approval loop.

Verification ledger: Python `-X utf8 -m pytest -q`: 673 passed, 37 skipped; `ruff check src tests scripts`: clean; affected Vitest suites: 30 passed; `npm run typecheck`: passed. Full local pipeline: real MediaPipe, real frozen Ridge and frozen 2128-photo reference, fake text analyzer only (no paid call); score ok, rank available and validate_passport passed. Render secret contents and both new path variables read back exactly; no deploy triggered. Windows default GBK caused three unrelated test reads to fail initially; UTF-8 invocation resolved them. Human merge/release and one production upload remain pending.
