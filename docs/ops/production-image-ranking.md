# Production photo-sample ranking (D43)

The 2026-10-31 owner explicitly confirmed production ranking/aggregate-retention permission and requested implementation. This is recorded as an owner attestation; the original licensor evidence remains with the owner. It does not assert verified ages, subject independence or population representativeness.

## Activation

Keep `APP_ENV=production`, `BEAUTYAI_RIDGE_MODE=production` and the existing scoring receipt. Upload the frozen `scut-heldout-reference-v1.json` and an independent `production-reference-permission.json` as Render Secret Files. Set:

```text
BEAUTYAI_RIDGE_REFERENCE=/etc/secrets/scut-heldout-reference-v1.json
BEAUTYAI_RIDGE_REFERENCE_AUTHORIZATION=/etc/secrets/production-reference-permission.json
```

The private receipt must contain:

```json
{
  "contract_version": "image-reference-permission-1",
  "scope": "production_image_reference_comparison",
  "identity": {"model_id": "...", "checkpoint_id": "sha256:...", "preprocessing_version": "...", "crop_version": "...", "native_scale_id": "...", "calibration_version": null},
  "reference_sha256": "...",
  "cohort_id": "...",
  "distribution_version": "...",
  "ranking_authorized": true,
  "aggregate_retention_authorized": true,
  "permission_reference": "owner-attestation:2026-10-31:production-ranking-and-aggregate-retention"
}
```

Copy identity/hash/version from the checked-in model config, not from user input. The service independently verifies reference bytes against the configured SHA256 and validates registry/schema/model identity. Missing, malformed or mismatched permission fails closed; the scoring receipt alone is insufficient. No photos, identifiers, raw observation rows or model coefficients go into Git or logs.

## Release and verification

1. CI and current-head review; this authorization-path PR is `manual-review` and requires human **Squash and merge** under AGENTS.md.
2. Deploy the merged main commit with the prepared secret files/variables; never enable research mode in production.
3. One new QC-qualified approved synthetic-photo upload through `/api/passport`; expect `full_ready`, score `ok`, rank `available`, `reference_unit=image`, `n_reference=2128`, `n_unique_subjects=null`, `research_only=false`, and the age/identity limitation. Extremely low/high predictions may correctly remain unavailable under existing tail rules.
4. Verify web and PDF show photo-sample label, name, count and scope note. Old stored reports are immutable snapshots; create a new report to obtain a rank.

Rollback: remove/disable `BEAUTYAI_RIDGE_REFERENCE_AUTHORIZATION` and redeploy; scoring remains enabled, photo rank unavailable. No retraining, new service, payment integration or persistent-disk changes.
