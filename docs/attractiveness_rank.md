# Learned-model reference ranks — Issue #33

This independent library ranks a learned model's predictions **in a named reference
sample**. The model predicts a human-rating protocol; this library answers a separate
question about the distribution of that model's predictions. Neither is a census or
universal attractiveness claim. Geometry, The Face Report histograms, report schemas,
the homepage and #13's runtime are untouched. #34 owns product integration.

## Current activation state

`config/attractiveness_reference.json` deliberately contains **no cohorts**. On the
2026-10-26 handoff, #13 has not supplied a production-authorized identity and matching,
permitted adult reference predictions. The existing MEBeauty/SCUT research evidence
does not grant this permission. No real-data rank check was run; no real-data rank is
claimed. The next external input is a #13 model authorization plus a lawfully licensed
or opt-in adult cohort explicitly permitting this ranking and aggregate retention.
Do not activate synthetic fixtures, research-only outputs, six demo personas or a
competitor's reference distribution.

## Contract for #13 and #34

`attractiveness_rank.contracts.ModelResult` is the ranking-side typed stub for the
agreed `learned-attractiveness-1` handoff. Its **flat, required** fields are:

| Fields | Meaning |
| --- | --- |
| `contract_version` | Exactly `learned-attractiveness-1` |
| `status` | `ok`, `unavailable`, or `research_only` |
| `raw_score` | Finite native-scale number or null; larger means higher predicted rating |
| `model_id`, `checkpoint_id` | Exact trained model and immutable weights/checkpoint hash identifier |
| `native_scale_id` | Versioned scale including units, direction and rating protocol |
| `preprocessing_version`, `crop_version` | Exact inference preparation identities |
| `calibration_version` | Required, explicit string or null; no implicit calibration |
| `production_authorized` | Explicit boolean for the intended deployment's model rights |
| `quality_flags`, `unavailable_reason` | String array and string/null; any flag blocks ranking pending #13's QC contract |

The cohort copies all six identity fields. Equality is exact, including null
calibration. An adapter may extract this subset from #13's richer output; this PR
does not edit that producer or assume its final implementation. No shared-file edits
are needed to use the stub. If its contract changes, version the adapter and reference
together. A changed checkpoint, crop or calibration always requires rescoring the
cohort and a new immutable distribution version.

```python
from aesthetic_passport.attractiveness_rank import load_registry, rank_prediction

# model_result is supplied by the #13 adapter; the group is explicitly user-selected.
result = rank_prediction(model_result, load_registry(),
                         cohort_id=selected_cohort_id,
                         distribution_version=selected_distribution_version)
```

`RankResult` is frozen: `status=available|unavailable`, `percentile`, `top_percent`,
`cohort_id`, `cohort_label`, `n_unique_subjects`, `distribution_version`, `method`,
`limitations`, `unavailable_reason`, `percentile_interval`, `display_step_percent`.
All three numerical **rank** fields are null when unavailable. Cohort size may still
be returned for a rejected cohort; it is not a rank. The caller must gate numerical
display on `status == "available"` and use only the provided display precision.

Main reason codes: `invalid_model_result`, `model_research_only`,
`model_not_authorized`, `model_unavailable`, `image_quality_limited`,
`reference_missing`, `reference_version_missing`, `invalid_reference`,
`cohort_not_authorized`, `cohort_qc_failed`, `model_reference_mismatch`,
`reference_too_small`, `reference_insufficient_variation`,
`score_out_of_native_scale`, `unsupported_tail`, `unsupported_display_tail`.
An unreadable registry raises `ReferenceDataError("reference_unreadable")` at load;
the integration should present unavailable, never substitute a different cohort.

## Statistical choices

The raw midrank CDF is `100 * (count_below + count_equal / 2) / N`.
Between observed scores it is constant. There is no interpolation across unsupported
gaps or extrapolation beyond the sample. `empirical_quantile` uses the generalized
inverse ECDF (an observed order statistic), including endpoints. It is an offline
aggregate utility, not a display authorization gate.

Thresholds are in `config/attractiveness_rank.yaml`: N < 100 is unavailable;
100–999 permits 10 percentage point steps; N ≥ 1000 permits 5 point steps. At least
two distinct scores and five midrank observations in each tail are required. Rounding
is nearest step, half up; an estimate rounded to 0% or 100% is refused. These choices
prevent precise tail claims even for large, self-selected samples. They do not make
a self-selected cohort representative.

The interval uses a Dvoretzky–Kiefer–Wolfowitz half-width
`100 * sqrt(log(2 / alpha) / (2*N))`, alpha = .05, rounded **outward** to display
steps and clipped to [0,100]. It is a conditional IID sampling band for the same
recruitment mechanism; it does not quantify selection bias, model error, rater-panel
error or population coverage. `limitations` states this. A finite reference sample's
ECDF itself is descriptive, not uncertain. Show approximate language such as
`在[cohort_label]中约前 X%`, the sample size, recruitment limitations and interval;
never “top X% of all people”. No ethnicity, gender identity or other membership is
inferred. A user-selected cohort needs a clear, licensed definition of its own.

The rank calculation has no IO or mutation. Its default immutable policy is loaded
once at module import; offline callers can pass an explicit `RankPolicy` via `policy`.
No new dependencies: stdlib math plus the existing jsonschema/PyYAML. SciPy's
[`percentileofscore(kind="mean")`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.percentileofscore.html)
documents the same strict/weak CDF averaging convention. No SciPy source was copied.

## Import, validate, retain only aggregates

The JSON Schema is `config/attractiveness_reference.schema.json`, outside product
`schema/`. It defines the registry and the private ingestion contracts; unknown
fields, missing identity, non-finite scores, bad counts and unordered distributions
are rejected. The rank boundary revalidates the registry to catch later mutations.

A private manifest has the exact `CohortManifest` fields in `contracts.py`:

- Cohort ID, label, immutable distribution version, definition, recruitment method
  (`self_selected|convenience|probability_sample`), identity and native bounds.
- Provenance: `data_kind=real_adult`, source/license/permission references, explicit
  `ranking_authorized`, `aggregate_retention_authorized`,
  `model_production_authorized`, and `adults_confirmed` booleans, all true.
- QC: `status=passed`, evidence reference, and versioned deduplication procedure.

Each local JSONL record has **only** `subject_key`, `duplicate_cluster`,
`observation_key`, `adult_confirmed=true`, and `prediction` (the exact model contract).
Keys must be opaque, stable local IDs, never names or external media links. The
curator must establish adult status/consent from records, not image inference, and
review subject/near-duplicate clusters **before** import. Give each unique image a
cluster key even if there is no duplicate. The script does not inspect portraits or
pretend that a hash alone proves subject identity.

Subject and near-duplicate relationships are unioned transitively. Each connected
component contributes the observation with the lexicographically smallest unique
`observation_key`; define its score-independent selection procedure in QC evidence.
Reject duplicate observation IDs, incompatible predictions and unconfirmed adults
rather than silently biasing the sample by dropping invalid rows. Identifiers exist
only transiently in memory and the private input; output contains score/count bins,
unique N, import totals and permitted versioned cohort provenance, never keys or rows.

```bash
PYTHONPATH=src python -m aesthetic_passport.attractiveness_rank \
  --manifest /private/cohort-manifest.json \
  --predictions /private/model-predictions.jsonl \
  --out /private/new-aggregate.json
```

The command does not overwrite existing files. Errors expose reason codes without
record values or source paths; successful imports print nothing. Review metadata
references for personal identifiers and retain source material only under its own
consent/deletion policy. This library neither copies portraits nor changes product
photo retention. Human review must verify actual license/consent evidence: booleans
are a curator's attestation, not proof of rights. Activate a reviewed aggregate by PR;
do not relabel test fixtures or put private source records in Git.

## Verification

`tests/test_attractiveness_rank.py` uses deterministic non-person values only; its
hypothetical authorization manifest exercises gates and is never registered in config.
One critical path executes the CLI, reloads its aggregate, checks the midrank and
confirms the production registry still returns unavailable. When the required real
model and permitted cohort arrive, run that same import once and record the actual
aggregate provenance/QC evidence. Do not repeat the completed MEBeauty experiments.

```bash
make test
make lint
```
