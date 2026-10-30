# Frozen Ridge score + reference MVP (2026-10-30)

This continues [PR #66](https://github.com/tasconyeric-slack/BeautyAI/pull/66), using the #33 ECDF contract, #62 percentile tiers and #34 report integration. Production analysis remains a separate provider. No fitting, new labels, DINOv2, homepage changes or resource deployment were performed in this integration.

## Artifacts and identity

All paths below are relative to the checkout. These private artifacts are git-ignored, provisioned locally and verified at runtime. The config alone does not contain a trained model.

| Artifact | Location | SHA256 |
| --- | --- | --- |
| Actual PR #66 frozen fit | `models/aesthetics/geometry-ridge/scut-fbp5500-ridge-17.json` | `e74489df4953054838dee2d4e9468a6095f5e77e837ae62ff9cc94cea95a4d25` |
| Held-out image ECDF | `models/aesthetics/geometry-ridge/scut-heldout-reference-v1.json` | `7eed142fa39242905ecb097c2abacddcf6ad1582998868b71e66c721aa501826` |

Model: `geometry-ridge17-scut-60-40-v1`; preprocessing: `d36-17-aes-geo-1.0-v1`; crop: `photo-check-working-rgb-v1`; native scale: `scut-human-panel-1-5`; calibration: null. Exact 17-feature order lives in `attractiveness/features.py` and must equal the artifact and experiment extractor. Test coverage compares production and experimental vectors from the same mesh. The artifact contains w, mu, sd, b and alpha=100 with 3196 fitted training observations; historical held-out Spearman=0.6144 and MAE=0.4197 are research validation, not a production accuracy promise.

Native prediction is clipped to [1,5]. Display transformation `scut-linear-1-10-v1` is `1 + (raw - 1) * 9/4`: 1→1, 3→5.5, 5→10. No percentile is inferred from this transformation. D36 geometric harmony keeps its own score, label and reference engine.

## Reproduce the reference without fitting

With authorized original SCUT data and the PR #66 fit present, from the repository root:

```bash
PYTHONPATH=src:. .venv/bin/python -m experiments.aesthetics.build_ridge_reference \
  --root data/scut-fbp5500/SCUT-FBP5500_v2 \
  --out models/aesthetics/geometry-ridge/scut-heldout-reference-v1.json
```

On Windows use `$env:PYTHONPATH="$PWD/src;$PWD"` and `.venv/Scripts/python -X utf8`. The output path must be fresh. UTF-8 with LF is explicit so SHA256 is reproducible across platforms. The builder verifies the artifact SHA, original held-out split SHA, disjoint train/test lists, 2200 held-out inputs, exactly 2128 valid vectors and no byte-identical images. It predicts with the frozen parameters, stores only an aggregate score/count ECDF and asserts all reference contracts. Labels are loaded only as part of the existing dataset record parser; no labels enter inference, fitting, selection or calibration. MediaPipe/version drift is rejected by the coverage/hash checks rather than silently replacing the pinned reference.

Reference: `scut-heldout-ridge17-research`, version `scut-heldout-ridge17-ecdf-v1`, convenience sample, 2128 **photos**; unique identities and adulthood unverified. `n_unique_subjects` is null. Its explicit research/ranking/aggregate permissions preserve the user's research authorization, while `model_production_authorized` and `adults_confirmed` remain false. The #33 ECDF computes midrank, requires sufficient observations/tails and rounds to 5 percentage points for this size; #62 assigns its existing tier. The sampling interval assumes independent observations and does not cover identity duplication, selection bias or model error. No full-population claim is made.

## Local real-inference preview

```bash
APP_ENV=development BEAUTYAI_RIDGE_MODE=research ANALYSIS_PROVIDER=fake \
  PYTHONPATH=src:. .venv/bin/python -m experiments.aesthetics.validate_ridge_mvp \
  --photo data/scut-fbp5500/SCUT-FBP5500_v2/Images/AF1.jpg \
  --out runs/ridge-mvp-20261030-final
```

This uses actual multipart upload, real PhotoCheck/MediaPipe, existing measurements, frozen Ridge, the pinned ECDF, normal assembly and Passport validation. Only the language-analysis provider is fake; there are no paid calls. A second upload with a missing model verifies the full-ready report, null learned score/rank and intact D36, then deletes that fallback job. A single face-detection invocation is asserted per upload. Use a new output path when rerunning.

The retained research report follows normal 24h photo retention. Start the existing API with `RUNS_DIR=runs/ridge-mvp-20261030-final/jobs` and the web app with `NEXT_PUBLIC_API_BASE` pointed at that API; open `/p/<preview-id.txt value>/report`. The generated report, not a fixture or invented prediction, supplies the learned score. The existing profile and PDF also consume those fields. Desktop/mobile browser checks verify the learned score and reference position render and the narrow layout does not overflow. Screenshots stay under ignored `runs/`.

## Actual local validation

Windows 10, Python 3.14.7, CPU; one fresh process, real CV, fake language analysis. 10ms RSS sampling includes Windows process high-water working set. `runs/ridge-mvp-20261030-final/runtime.json` contains aggregate evidence only:

| Check | Result |
| --- | --- |
| Upload → complete report | passed, 5.550s including cold startup |
| Face detections, primary upload | 1 |
| Feature-vector + Ridge prediction | 0.094ms (artifact/reference I/O excluded) |
| Peak RSS | 280.47 MiB, including successful and missing-model uploads |
| Missing-model fallback | full report; learned score and percentile null |
| Research reference | 2128 valid images, same artifact, pinned SHA |

These are local single-path measurements, not a Render memory or latency guarantee. No deployment was attempted. The foundational lower-level benchmark remains recorded in `RIDGE_PATH.md`.

Checks: Python 671 passed / 34 skipped (optional photo/provider cases), ruff clean; web 400 Vitest tests plus 60 module tests passed; TypeScript and Next production build passed. Windows ran the exact pytest/ruff commands behind `make test` / `make lint`, with UTF-8 mode. Focused tests cover artifact/order/hash rejection, production authorization identity, reference mismatch/research permissions, geometry-vector parity, QC/null fallbacks, and older stored reports.

## Production blockers and activation

`BEAUTYAI_RIDGE_MODE=off` is the default. Research runs only outside production; mock/provider flags do not bypass this gate. Production scoring requires `BEAUTYAI_RIDGE_MODE=production` plus `BEAUTYAI_RIDGE_AUTHORIZATION` pointing at a private receipt with the exact full `identity`, `scoring_authorized: true` and a nonempty `permission_reference`. No such production receipt was created by this work.

Production ranking additionally needs an explicitly authorized same-identity adult, subject-deduplicated reference cohort. The SCUT photo ECDF cannot satisfy those gates. A future authorized cohort must be versioned, ingested via #33 and registered with its own ID/version/SHA in `config/attractiveness.yaml`; merely changing an environment path cannot bypass the pinned identity/hash or permission checks. Missing/mismatched references withhold ranking while an authorized score can still work. Existing v0.3–v0.7 reports retain their historical behavior.

The concrete remaining blockers are a model-specific production permission receipt and a production-eligible matched reference cohort. They do not block the working local research MVP. Deployment remains a separate user approval step.
