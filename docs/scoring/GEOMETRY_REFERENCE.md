# Independent D36 photo reference

D45 / schema 0.10. Geometry remains aes-geo-1.0 at native 0–100; display is /10,
including each component. No training or calibration changes the geometric score.

The owner selected option B on 2026-10-31: original-score resampling, separate from
Ridge. The builder reuses MediaPipe and D36 and writes aggregate score/count bins only.
The private artifact `models/aesthetics/geometry-reference/scut-heldout-geometry-v1.json`
contains 1075 full-QC photos from the official SCUT 2200-photo holdout, 260 distinct
scores, mean 7.5283/10, observed 4.99–8.83. Ridge's reference has 2128 photos under
a different eligibility policy. Neither represents a population; ages/identities
are unverified. This QC selection difference must not be described as the same cohort.

Rank reuses empirical midrank CDF `(below + equal / 2) / N`, with existing sample-size
rounding and sparse-tail refusal. Rank the native score before display rounding.
A private deterministic-formula identity adapter reuses the existing rank boundary;
it is not a learned prediction and is stored separately. KDE reuses Gaussian/Scott
smoothing on geometry counts, normalized over 0–10, for visualization only. No
assumption of normality, symmetric tails or a centre of 5; smoothing never affects rank.

## Build and activation

With PYTHONPATH=src, run:

```text
python -m experiments.aesthetics.build_geometry_reference --root <existing-SCUT-root> --out models/aesthetics/geometry-reference/scut-heldout-geometry-v1.json
```

The builder refuses overwrites. No photos or individual records enter Git/logs.
The aggregate stays private under models/. Do not activate synthetic test fixtures.
Set BEAUTYAI_GEOMETRY_REFERENCE to the private aggregate path. Offline research may
set BEAUTYAI_GEOMETRY_REFERENCE_MODE=research; production refuses research mode.

Production needs BEAUTYAI_GEOMETRY_REFERENCE_AUTHORIZATION pointing to a private JSON
receipt: scope `production_geometry_photo_sample_comparison`, exact aggregate identity,
reference_sha256 of its bytes, cohort_id, distribution_version, ranking_authorized=true,
aggregate_retention_authorized=true, and a nonempty permission_reference. This is
independent of Ridge permission. The owner explicitly confirmed production authorization in chat on 2026-10-31. The exact private receipt is prepared beside the aggregate; deployment remains outside this PR.

Missing/invalid reference, identity mismatch, missing/mismatched permission, limited
geometry and unsupported tails suppress numerical ranks independently of both scores.

## Verification

Windows has no make executable; its pytest/ruff equivalents passed (697 tests, 34 optional skips; Ruff clean). Web: 431 Vitest tests plus module checks, TypeScript and next build passed. Real Chrome at 1440px and 390px showed both independent scores/ranks without horizontal overflow. The private production receipt was checked against the built aggregate using a fictional demo score. No deployment was performed.
