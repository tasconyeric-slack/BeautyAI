# Independent geometry and predicted scores

**Goal:** User-approved option B: retain Ridge /10 and add D36 overall and components /10,
with independently rescored reference photos, empirical midrank percentiles and a KDE display.
No normality assumption, no forced bell curve, no mixing scores or borrowing Ridge ranks.

**Architecture:** Reuse the existing rank boundary through an explicit deterministic formula
identity adapter. Store geometry_reference_rank separately, retain D36's native 0–100 measurements.
Private production authorization binds formula identity, aggregate hash and sample version.

- [x] Test and implement geometry rank with identity, quality, sparse-tail and receipt gates.
- [x] Build a deduplicated full-QC SCUT held-out geometry aggregate with the original scorer.
- [x] Add optional schema v0.10 geometry_reference_rank; bump prompt; regenerate types/examples.
- [x] Show independent /10 geometry, components, rank and curve in web and PDF.
- [x] Run Python suite/lint and web typecheck/tests/build; open a manual-review PR.

Validation: nonlinear synthetic mass, midpoint ties, missing/mismatched references,
full versus limited geometry, sparse tails, missing/mismatched production receipt,
and independent unavailable states. Native geometry rounding precedes display conversion;
never rank a rounded /10 display value. Shared reference code is reused without dependencies.

Validation: Python 697 passed, 34 skipped; Ruff clean; Vitest 431 passed plus module checks; TypeScript and production build passed. Browser desktop 1440px/mobile 390px: both independent cards and no overflow. Owner explicitly confirmed authorization; hash-bound private receipt validated against actual reference with a fictional demo score. No deployment.
