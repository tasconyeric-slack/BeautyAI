# Offline facial-attractiveness predictor (Issue #11)

Runs and benchmarks the published **MEBeauty `dinov2-partial`** model — a predictor of how the MEBeauty rater panel
scored a face on its **1–10 `beauty_score`** scale — against the product's existing geometric harmony score
(`aes-geo-1.0`) and a cheap geometry-only regression baseline.

**Isolated experiment.** Nothing in `src/` imports this package; the production schema, API, scoring engine,
percentiles and UI are untouched. torch / transformers / datasets are experiment-only (`requirements.txt`), never
production dependencies. Results and decisions: [`docs/experiments/aesthetics/`](../../docs/experiments/aesthetics/README.md).

> A score is a prediction of one specific rater panel's average opinion, not an objective property of a person, not a
> population rank, and not comparable across datasets. MEBeauty (1–10) and SCUT-FBP5500 (1–5) scales are never mixed.
> Both datasets and the weights are **non-commercial research only**; never commit photos, weights or tokens.

## Setup

```bash
make install && make models                       # repo env + MediaPipe (also needs system libegl1 libgles2)
pip install -r experiments/aesthetics/requirements.txt   # torch, transformers, datasets, huggingface_hub
python -m experiments.aesthetics doctor           # lists exactly what is present / missing (exit 3 if anything is)
```

Weights (≈ 330 MB by parameter count, git-ignored location). The model repo is **gated** (automatic approval):
accept its terms while signed in to huggingface.co, then provide a read token as `HF_TOKEN`. Research use only; the
licence forbids deploying it to score real people.

```bash
hf download dr-irina-lebedeva/MEBeauty-FBP-models dinov2-partial.pt config.json \
    --local-dir models/aesthetics/mebeauty-fbp
```

Loading is fully offline after that: the checkpoint stores the whole fine-tuned backbone, and the Dinov2
hyper-parameters are inferred from its tensor shapes, so `facebook/dinov2-base` is **not** downloaded.
Override the path with `--weights` or `AESTHETICS_WEIGHTS`.

## Single photo

```bash
python -m experiments.aesthetics predict path/to/portrait.jpg            # JSON on stdout, nothing written
python -m experiments.aesthetics predict portrait.jpg --crop none        # feed the image as-is
```

Output fields: `status`, `model_version` (`mebeauty-fbp/dinov2-partial@sha256:<12>`), `dataset`, `label_scale`
(`beauty_score`, 1–10), `raw_score` (clipped to the range, flip-averaged), `raw_score_unclipped`,
`preprocessing` (crop mode/margin, resize, crop, normalisation, flip), `face`, `model`, `runtime`
(`model_load_s`, `inference_s`, `peak_rss_mb`), `error`, `prerequisite`.

| status | exit | meaning |
|---|---|---|
| `ok` | 0 | scored |
| `no_face` · `unreadable_image` | 2 | input problem; no score is produced |
| `model_unavailable` · `model_incompatible` · `dependency_missing` | 3 | a local prerequisite is missing; `prerequisite` says which |
| `error` | 1 | unexpected |

**Framing caveat.** The reference harness feeds MEBeauty's own images straight into resize-256 → centre-crop-224.
For an arbitrary portrait the default `--crop face` takes a square around the MediaPipe face box (`--margin 0.25`
per side) to approximate a face-centred dataset image. MEBeauty's `image` field holds *aligned* 256×256 face crops,
and a MediaPipe box crop does no alignment, so a match is **not** established; the output says
`framing_matches_training: "unverified"`. Compare `--crop face` vs `--crop none` on the MEBeauty test split before
trusting single-photo numbers.

## Evaluation

```bash
# MEBeauty: published holdout test split (250). The weights trained on train and early-stopped on validation,
# so only `test` is allowed for the model (other splits → status "blocked").
python -m experiments.aesthetics evaluate --dataset mebeauty \
    --reference-predictions ../MEBeauty-Benchmark/results/dinov2-partial_predictions.npz   # optional parity check

# SCUT-FBP5500 60/40 split shipped inside the dataset zip (train_test_files/…), as used in docs/experiments/aesthetics
T="data/scut-fbp5500/SCUT-FBP5500_v2/train_test_files/split_of_60%training and 40%testing"
python -m experiments.aesthetics evaluate --dataset scut-fbp5500 --images-dir data/scut-fbp5500/SCUT-FBP5500_v2/Images \
    --train-file "$T/train.txt" --test-file "$T/test.txt"
# or the official 5-fold split files from the release repo
git clone https://github.com/HCIILAB/SCUT-FBP5500-Database-Release ../SCUT-FBP5500-Database-Release
python -m experiments.aesthetics evaluate --dataset scut-fbp5500 \
    --images-dir data/scut-fbp5500/Images --splits-dir ../SCUT-FBP5500-Database-Release/data --fold 1

# Any local folder + CSV (image,label,split[,group…]) on its own label range
python -m experiments.aesthetics evaluate --dataset csv --csv labels.csv --label-min 1 --label-max 5

# Geometry only (no torch, no weights):  --methods train_mean,geometric,geometry_ridge
# Quick look:  --max-test 200 --max-train 800   (reported as subsampled)
```

Writes `report.json`, `report.md` and `predictions.jsonl` (dataset ids, labels, scores — no pixels) to
`runs/aesthetics/eval-<dataset>-<time>/` (git-ignored) and prints the Markdown table.

| method | what | scale handling |
|---|---|---|
| `train_mean` | train-split mean label | native MAE floor; no ranking |
| `geometric` | production `score_face` overall (0–100), engine unchanged | Spearman/Pearson raw; MAE only after a linear map fitted on **train** rows |
| `geometry_ridge` | ridge on the 17 D36 measurements + pose, alpha by 5-fold CV **inside train** | native |
| `mebeauty_dinov2` | published weights | native on MEBeauty; on other datasets Spearman raw + MAE after train-only calibration (`--calibration-n`, default 500 train images) |

Reported per method: coverage and failure counts (`no_face`, `geometry_unavailable`, `unreadable_image`, …),
Spearman with a seeded bootstrap 95 % CI, Pearson, MAE, RMSE with their `error_basis`, the same metrics on the
**common subset** every ranked method scored, and breakdowns by dataset-published group labels (MEBeauty
gender/ethnicity, SCUT AF/AM/CF/CM) where n ≥ `--min-group` (30). Group labels come from the dataset; nothing is
inferred from faces.

Leakage guards: train/test id overlap aborts the run; the MEBeauty model is blocked on any split but `test`; all
fitting (ridge, calibration) uses train rows only. SCUT publishes no identity grouping — its folds are used as
released and that limitation is recorded in the report.

## Runtime

```bash
python -m experiments.aesthetics bench                          # real weights
python -m experiments.aesthetics bench --random-init            # identical architecture, untrained (timing only)
python -m experiments.aesthetics bench --random-init --threads 1 --variants int8_dynamic,onnxruntime
```

Reports torch import time, model build/load time, RSS after load, p50/p90 latency for one image (with and without
the flip) and batch throughput, peak RSS, and optional int8 / ONNX Runtime variants with their numerical
difference from fp32 on the same weights.

Real-image parity of an export (and torch dynamic int8) against the 250 published MEBeauty test predictions:
`python -m experiments.aesthetics.onnx_parity --onnx models/aesthetics/mebeauty-fbp/model.onnx --reference <npz> --int8`.
Measured result: ONNX Runtime PASS (max |Δ| 3.8e-06); dynamic int8 FAIL (mean |Δ| 3.9 points), so don't use int8.
The ONNX export is derived from restricted weights: keep it in git-ignored `models/`, never redistribute or deploy it.

## Tests

`tests/test_aesthetics_experiment.py` (runs in `make test`): metrics, exact preprocessing parity with the reference
transform, crop bounds, SCUT name mapping, every predict/evaluate failure status, leakage guards, and — when torch is
installed — offline loading of a tiny synthetic Dinov2 checkpoint in both transformers attention layouts.
No photos, weights or network are used.

## Provenance

Architecture and preprocessing re-implemented from MEBeauty-Benchmark (MIT, © 2026 Irina Lebedeva),
`src/fbp_benchmark/methods/foundation.py`, `methods/training.py`, `pretrained.py`; `align_state` adapted from
`pretrained.py`. See `THIRD_PARTY.md`.


## Zero-additional-server-cost geometry Ridge experiment (research only)

The existing `geometry_ridge` benchmark already fitted a 17-feature Ridge regressor,
but its report recorded metrics **without saving the fitted coefficients**. A Spearman
score is not a model, so it cannot be used to predict new photos by itself.

The optional `--ridge-artifact-out` now captures the actual `mu/sd/w/b` arrays
**when the existing evaluation fits its research TRAIN split**. This is an
optional repeat of the existing training operation, not zero training; it
requires the already-licensed local research data, but no new annotations,
GPU, third-party API calls or paid inference tier.

```bash
# If the already authorized SCUT local research dataset is available:
python -m experiments.aesthetics evaluate \
  --dataset scut-fbp5500 \
  --images-dir data/scut-fbp5500/SCUT-FBP5500_v2/Images \
  --methods geometry_ridge --bootstrap 0 \
  --ridge-artifact-out models/aesthetics/geometry-ridge/scut-research.json

# Subsequent local inference: no fitting, weights download, PyTorch or GPU.
python -m experiments.aesthetics ridge-predict path/to/consented-photo.jpg \
  --artifact models/aesthetics/geometry-ridge/scut-research.json
```

The exported model preserves the **SCUT 1–5 panel scale**; it is NOT a
verified strict PSL/TikTok 1–10 score, not a population rank and not
a licensed commercial model. Artifacts stay in git-ignored `models/` and
are NOT committed. Missing/mismatched files or unusable face geometry
return `status=unavailable` and null scores.

If absolutely no model fitting is allowed, no Ridge artifact exists in
the repository as of this change. Only `ridge-predict` against
an independently obtained compatible, appropriately authorized
pre-fitted artifact can run. Do not silently substitute arbitrary
weights or rebrand the old deterministic geometry score.

This experiment does not alter `src/`, public reports, the production
geometry scorer or existing ranking gates. The feature extractor needs
MediaPipe (already used by the product); the Ridge prediction adds only
a tiny NumPy matrix-vector operation and requires no Render memory upgrade.
# Parameter export and upload-path delivery

See [Ridge path delivery](../../docs/experiments/aesthetics/RIDGE_PATH.md) for the
2026-10-30 actual coefficient export, reproduced SCUT metrics, single-path memory
measurement, commands and the remaining production-contract integration boundary.
