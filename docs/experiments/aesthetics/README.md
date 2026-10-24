# Pretrained facial-attractiveness model — offline run & benchmark (Issue #11)

Code: [`experiments/aesthetics/`](../../../experiments/aesthetics/README.md) · Tests: `tests/test_aesthetics_experiment.py` ·
Raw measurements: [`measurements/`](measurements/) · First recorded 2026-10-24 at `3d61096`; SCUT geometry at `5ba1cec`; real-checkpoint runs at `5e1eff4`.

## Status — acceptance evidence complete (updated 2026-10-24, third pass)

| Acceptance item | State |
|---|---|
| `predict` / `evaluate` / `bench` commands, clean failure statuses, leakage guards | **Done** (PR #16) |
| Truthful `complete` status; explicit parity `pass`/`fail` with tolerance | **Done** (PR #17) |
| **Real-checkpoint inference** | **Done** — `predict` `status=ok` with the published weights, below |
| **MEBeauty holdout benchmark + published-prediction parity** | **Done** — parity **PASS** (max \|Δ\| 2.4e-06), metrics reproduce exactly |
| Framing drift (`--crop face` vs `--crop none`) | **Done** — aggregate accuracy unchanged, per-image drift quantified |
| SCUT-FBP5500 benchmark (geometry) and cross-dataset model evaluation | **Done** (geometry in PR #17, model here) |
| Real-weight ONNX parity, CPU latency and memory | **Done** — ONNX **PASS** on the 250 real test images; int8 **FAIL** |

Access: weights and dataset are gated (automatic approval). The account holder accepted the terms; the session
authenticates through a proxy-injected Hugging Face credential (no token in the environment, files or repo). Weights
(`dinov2-partial.pt`, sha256 `7b8fd2cb55aa…`, 348 MB) and the dataset cache live in git-ignored `models/` and `data/`.
Nothing derived from the weights (including `model.onnx`) is committed or distributed.

## Real-checkpoint results (ours, measured 2026-10-24 on 4 vCPU, no GPU)

**Single-photo inference** (`predict`, SCUT-FBP5500 image `CF1.jpg`, research terms): `status=ok`,
`model_version mebeauty-fbp/dinov2-partial@sha256:7b8fd2cb55aa`, `raw_score 7.61` on MEBeauty's 1–10 `beauty_score`
(`--crop none` 7.60). The checkpoint loads *strictly* into the re-implemented architecture with the backbone config
inferred from tensor shapes; `score_range` read from the model's `config.json`. Cold load 8–13 s (includes hashing
348 MB), inference 0.40–0.46 s. Evidence: [`real-weights-predict-example.json`](measurements/real-weights-predict-example.json).

**MEBeauty holdout test** (publisher's identity-grouped split, n = 250, `--crop none` = harness setting):

| Method | Coverage | Spearman [95% CI] | Pearson | MAE (1–10) | Error basis |
|---|---|---|---|---|---|
| `train_mean` | 250 | — | — | 0.911 | native |
| `geometric` (product `aes-geo-1.0`) | 146 | 0.078 [−0.088, 0.229] | 0.124 | 0.892 | calibrated on train |
| `geometry_ridge` | 146 | 0.288 [0.127, 0.429] | 0.301 | 0.871 | native |
| **`mebeauty_dinov2`** | **250** | **0.767** [0.708, 0.816] | **0.771** | **0.566** | native |

- **Parity PASS**: our predictions vs the 250 published ones: max |Δ| 2.4e-06, mean 5.7e-07 (tolerance 1e-3). The
  authors' published holdout numbers (PC 0.7711, SROCC 0.7669, MAE 0.5658) are reproduced exactly by our run.
- Common subset (n = 146, all methods scored): model Spearman 0.777 / MAE 0.550 vs ridge 0.288 / 0.871 vs geometric 0.078.
- Geometry covers only 146 / 250 aligned 256×256 crops: MediaPipe finds every face, but tight crops often cut the
  forehead/chin the D36 components need (`geometry_unavailable`).
- Model by dataset-published group (Spearman): female 0.57, male 0.65; asian 0.84, caucasian 0.67, hispanic 0.74,
  indian 0.90 (black n = 29, mideastern n = 28 below the n ≥ 30 reporting floor). Small groups; wide uncertainty.
- **Framing drift** (`--crop face`, MediaPipe square crop, no alignment): Spearman 0.765, MAE 0.569 — aggregate
  accuracy is unchanged, but individual scores move (mean |Δ| 0.030, max 0.345; parity correctly **FAIL**s at 1e-3).
  For arbitrary portraits expect per-photo noise of a few tenths, not a systematic loss.

**SCUT-FBP5500 cross-dataset** (official 60/40 test, n = 2,200; the MEBeauty model never saw SCUT):

| Method | Coverage | Spearman [95% CI] | MAE (1–5) | Error basis |
|---|---|---|---|---|
| `train_mean` | 2200 | — | 0.560 | native |
| `geometric` (PR #17) | 2128 | −0.187 [−0.231, −0.144] | 0.529 | calibrated on train |
| `geometry_ridge` (PR #17, fitted on SCUT train) | 2128 | 0.614 [0.589, 0.642] | 0.420 | native |
| **`mebeauty_dinov2`** | **2200** | **0.653** [0.628, 0.676] | **0.394** | calibrated on 500 SCUT train images (label ≈ −0.449 + 0.591·score) |

By SCUT subset (Spearman): AF 0.80, AM 0.64, CF 0.86, CM 0.64. The MEBeauty-panel predictor transfers to a different,
mostly-Asian panel better than a geometry model fitted on that panel itself; raw scores are on MEBeauty's scale and
need the train-fitted map for MAE (scales never mixed).

**Real-weight ONNX parity, latency, memory** (identical weights; timing on seeded random tensors, parity on the 250
real MEBeauty test images via `python -m experiments.aesthetics.onnx_parity`):

| Path | Real-image parity vs published | Spearman / MAE | p50 per photo (flip avg) 4 thr / 1 thr | Load | RSS after load / peak |
|---|---|---|---|---|---|
| PyTorch fp32 | PASS (2.4e-06) | 0.767 / 0.566 | 263 ms / 820 ms | 1.2 s import + 4.8 s | 1,018 MB / 1.8–2.6 GB with variants |
| **ONNX Runtime fp32, no torch** | **PASS (max 3.8e-06)** | 0.767 / 0.566 | 327 ms / 713 ms | 0.8 s | **596 MB / 608 MB** |
| Torch dynamic int8 | **FAIL** (mean \|Δ\| 3.88) | 0.541 / 3.81 | 150 ms / 357 ms | — | — |

Dynamic int8 quantisation of the Linear layers wrecks this model (scores shift by ~4 points); do not use it.
Exported ONNX file 332 MB. Raw files: `measurements/real-weights-*.json`.

### Remaining limits

- Evidence is research-only: MEBeauty and SCUT are non-commercial, and the weights' licence forbids deployment that
  scores real people (below). Nothing here authorises production use.
- SCUT publishes no identity grouping; MEBeauty subgroup cells are small (29–130). No GPU measurements.
- The geometric-score coverage gap on aligned crops is a dataset-framing effect, not a product defect, but means the
  MEBeauty geometry numbers rest on 146 images.

### Licence finding that gates Issue #13

The weights' `LICENSE` (read from the model repo, 2026-10-24) restricts them to non-commercial research and
**explicitly forbids "deployment that scores, ranks, filters or gates real people"**, commercial use, cosmetic
advice, and redistribution (including re-uploading or derived weights, so an ONNX export must not be redistributed
either). A score shown to product users is a deployment that scores real people. Unless the licensor grants
permission, these weights cannot back a production feature, whatever the benchmark shows. Issue #13 should start
from this constraint (e.g. a written licence from the author, or a model trained on data whose terms allow it).

## SCUT-FBP5500 geometry benchmark (PR #17)

SCUT-FBP5500 v2 images from the official Google Drive release (non-commercial research use), kept in git-ignored
`data/`. Labels: 1–5, mean of 60 raters. Splits: the release's own files. MediaPipe found a face in every test image;
72 / 2,200 (40 / 1,100) lacked complete geometry for the D36 components. CPU, 4 vCPU; ~95 s per run, peak RSS 762 MB.
Reports (aggregates only): [`measurements/scut-60-40.report.md`](measurements/scut-60-40.report.md),
[`measurements/scut-cv-fold1.report.md`](measurements/scut-cv-fold1.report.md).

| Split | Method | Coverage | Spearman [95% CI] | Pearson | MAE (1–5) | Error basis |
|---|---|---|---|---|---|---|
| 60/40 (test 2,200) | `train_mean` | 2200 | — | — | 0.560 | native |
| | `geometric` (product `aes-geo-1.0`) | 2128 | **−0.187** [−0.231, −0.144] | −0.211 | 0.529 | calibrated on train |
| | `geometry_ridge` | 2128 | **0.614** [0.589, 0.642] | 0.608 | 0.420 | native |
| CV fold 1 (test 1,100) | `train_mean` | 1100 | — | — | 0.567 | native |
| | `geometric` | 1060 | **−0.205** [−0.261, −0.151] | −0.230 | 0.533 | calibrated on train |
| | `geometry_ridge` | 1060 | **0.601** [0.558, 0.637] | 0.593 | 0.428 | native |

60/40 breakdown by SCUT's own subset labels (Spearman): `geometric` AF −0.27, AM −0.08, CF 0.00, CM −0.03;
`geometry_ridge` AF 0.66, AM 0.59, CF 0.49, CM 0.54.

What this shows (research evidence, not a product claim):
- The product's geometric harmony score does **not** track how SCUT's raters scored faces; it is weakly *negative*
  overall and strongest-negative on Asian female faces. This supports D36's framing as a geometric reference that is
  explicitly not an attractiveness verdict, and argues against ever presenting it as one.
- The same landmark measurements carry real signal when weighted by data (ridge, fitted on train only): Spearman ≈ 0.61,
  MAE 0.42 vs 0.56 for the train-mean floor, within every subset. That ceiling belongs to the SCUT panel and does not
  transfer to other raters or scales.
- The pretrained-model cross-panel result is in the real-checkpoint section above.

## Runtime / resource verdict (real weights)

- ONNX Runtime alone: **~600 MB RSS**, 0.8 s load, ~0.33 s per photo on 4 vCPU (~0.7 s on 1 vCPU), parity PASS on
  real images. PyTorch: ~1.0 GB after load (CUDA wheel), more during inference. int8 dynamic: not usable (FAIL).
- Render web tiers (render.com/pricing, 2026-10-24): **Starter 512 MB / 0.5 CPU** (the plan in `render.yaml`),
  Standard 2 GB / 1 CPU. The model alone exceeds Starter before the API and MediaPipe load; anything would need at
  least a Standard-size separate worker. ~0.5 CPU would push latency towards ~1.4 s per photo (1-thread figure × 2).
- **Verdict:** technically, an ONNX Runtime fp32 worker on a ≥ 1 GB instance is the smallest faithful inference path.
  **Legally, these weights may not be deployed to score real people (Issue #13 gate below)**; the numbers only size a
  future, permissively licensed model of the same ViT-B class.

## Reproduce (gated access required; CPU is enough)

```bash
hf download dr-irina-lebedeva/MEBeauty-FBP-models dinov2-partial.pt config.json --local-dir models/aesthetics/mebeauty-fbp
REF=../MEBeauty-Benchmark/results/dinov2-partial_predictions.npz       # git clone dr-irina-lebedeva/MEBeauty-Benchmark
python -m experiments.aesthetics predict data/scut-fbp5500/SCUT-FBP5500_v2/Images/CF1.jpg
python -m experiments.aesthetics evaluate --dataset mebeauty --reference-predictions $REF
python -m experiments.aesthetics evaluate --dataset mebeauty --crop face --methods mebeauty_dinov2 --reference-predictions $REF
T="data/scut-fbp5500/SCUT-FBP5500_v2/train_test_files/split_of_60%training and 40%testing"
python -m experiments.aesthetics evaluate --dataset scut-fbp5500 --images-dir data/scut-fbp5500/SCUT-FBP5500_v2/Images \
    --train-file "$T/train.txt" --test-file "$T/test.txt" --methods train_mean,mebeauty_dinov2
python -m experiments.aesthetics bench --variants int8_dynamic,onnxruntime --export-onnx models/aesthetics/mebeauty-fbp/model.onnx
python -m experiments.aesthetics bench-onnx --onnx models/aesthetics/mebeauty-fbp/model.onnx [--threads 1]
python -m experiments.aesthetics.onnx_parity --onnx models/aesthetics/mebeauty-fbp/model.onnx --reference $REF --int8
```

Run the evaluations one at a time: two concurrent torch jobs on 4 vCPU oversubscribe threads and slowed each ~5×
(the MEBeauty holdout took 28 min while sharing the CPU).

## What was verified from the reference source

MEBeauty-Benchmark @ `e0878933` (MIT), SCUT-FBP5500-Database-Release @ `bff34ad2`.

| Question | Finding |
|---|---|
| Published weights | Only `dinov2-partial` (`<name>.pt` + `config.json`); other methods' weights were not retained |
| Architecture | `facebook/dinov2-base` (Apache-2.0) via `transformers.AutoModel`, last 4 blocks fine-tuned; features = CLS ‖ mean(patch tokens) (1536); head LayerNorm → Dropout 0.2 → Linear 256 → GELU → Dropout 0.1 → Linear 1; L1 regression |
| Checkpoint format | `{"backbone": state_dict, "head": state_dict}`; the whole backbone is stored, so loading needs no second download — we infer the Dinov2 config from tensor shapes |
| Preprocessing | Resize to 256×256 (aspect not kept) → centre-crop 224 → ImageNet mean/std → mean of image and horizontal flip → clip to 1–10. Reproduced with Pillow/numpy; a test checks equality with the reference transform |
| Face alignment | **None in the model path.** The harness feeds dataset images as stored; MEBeauty's own landmarks are used only by the classical methods. How MEBeauty images were cropped could not be checked (dataset card unreachable) → `predict --crop face` is an approximation flagged `unverified` |
| Label | `beauty_score` (current label version, not legacy `plain_mean_score`), 1–10; config `fbp_extended` |
| Splits | Publisher's holdout train 1,962 / val 250 / test 250 and `cv_fold`, grouped so one person never spans splits. The hosted weights come from a holdout run → only `test` is a fair split for them (other splits are blocked in `evaluate`) |
| Runtime deps | torch ≥ 2.13, torchvision, transformers < 5.19 (5.18 renamed Dinov2 attention keys; we remap both layouts, tested). Python ≥ 3.12 for their package — not needed here, we do not install it |
| Licences | Code MIT. MEBeauty and SCUT-FBP5500: non-commercial research only; MEBeauty explicitly excludes face recognition / biometric use |
| SCUT-FBP5500 | 5,500 images, 1–5 scale, 60 raters; repo ships 5-fold split files (4,400 / 1,100, folds disjoint — checked) using legacy names (`fty12.jpg` = AF12), mapped in `datasets.py`; no identity grouping published |

## Reference numbers (theirs, not ours)

From MEBeauty-Benchmark `docs/results.md`, MEBeauty holdout test (n = 250), trained and scored by the benchmark
authors. **These are a published benchmark result, not a measurement by this project and not a production accuracy
claim.** They set the expectation the blocked run should reproduce.

| Method | Pearson | Spearman | MAE (1–10) |
|---|---|---|---|
| `dinov2-partial` (the hosted weights) | 0.7711 | 0.7669 | 0.5658 |
| `dinov2-partial`, 5-fold CV mean ± sd | 0.8035 ± 0.0136 | 0.8022 ± 0.0104 | 0.5371 ± 0.0061 |
| `eisenthal2006` (landmark geometry + regressor) | 0.3769 | 0.3928 | 0.8549 |
| `mean-baseline` | 0 | 0 | 0.9107 |

Geometry-only methods in their benchmark reach Spearman ≈ 0.33–0.39; how far the product's `aes-geo-1.0` score and
our `geometry_ridge` get on the same split is exactly what the blocked `evaluate` run will measure.

## Measured runtime — first pass, untrained weights (superseded by the real-weight table above)

Intel Xeon @ 2.10 GHz, 4 vCPU, 16 GB, no GPU · Python 3.13 · torch 2.14.1 (CUDA build from PyPI; the CPU-only wheel
is smaller) · transformers 5.18.0 · onnxruntime 1.31.0. Identical architecture with **untrained** weights (`bench
--random-init`); inputs are seeded random tensors; 10 timed iterations after warm-up. Per image = one portrait with
flip averaging (2 forward passes), the published-metrics setting.

| Path | Cold start | p50 / image, 4 threads | p50 / image, 1 thread | RSS after load | Peak RSS |
|---|---|---|---|---|---|
| PyTorch fp32 | 1.1 s import + 3.7 s build/load | 263–268 ms (batch 8: 244 ms/img) | 748 ms | 1,277 MB | 1,426 MB |
| PyTorch dynamic int8 (Linear layers) | + quantise | 175 ms | 321 ms | — | — |
| **ONNX Runtime fp32, no torch in process** | 0.02 s import + 0.8 s load | 324 ms | 886 ms | 628 MB | **641 MB** |

- Of PyTorch's 1,277 MB after load, ~920 MB is importing torch + transformers; the model itself adds ~360 MB.
- ONNX export is faithful: max |Δ raw output| vs PyTorch = 3.2e-07 on identical weights. Exported file 331 MB.
- int8 changes raw outputs by up to 0.017 on untrained weights; its effect on Spearman/MAE is **unmeasured** until a
  labelled run with real weights.
- A flip-free pass halves cost (136–142 ms fp32, 4 threads) but no longer matches the published metrics.

## Recommendation (from the measurements above)

> **Superseded for these weights by the licence finding at the top:** the MEBeauty weights may not be deployed to
> score real people. Points 1–2 apply only to a replacement model with permissive terms and the same architecture
> class. Real-weight ONNX parity has since been measured (PASS); dynamic int8 FAILs and is ruled out.

1. **Deployable path: export the checkpoint once to ONNX and run it with onnxruntime (fp32), no PyTorch in
   production.** Same latency as PyTorch on CPU, less than half the memory (641 vs 1,426 MB peak), sub-second cold
   start, and `onnxruntime` + `numpy` + `Pillow` instead of a multi-GB torch install. This respects “no PyTorch in
   production dependencies”.
2. **In-process vs separate service is decided by host memory, not speed.** The model needs ~0.6 GB resident on top of
   the API's MediaPipe footprint. If the API host has that headroom, load the ONNX session once per process; if not
   (the current Render plan should be checked — `render.yaml` already notes MediaPipe needs ~1 GB), run it as a small
   separate CPU worker. ~0.3 s/image on 4 vCPU, ~0.9 s on 1 vCPU, is fine for one score per passport.
3. **Gate before any integration** (a separate issue): reproduce the published holdout metrics via the parity check,
   measure `--crop face` vs `--crop none` on MEBeauty test (framing for real uploads), and run the SCUT-FBP5500
   cross-dataset check (Spearman, calibrated MAE) to see how a MEBeauty-panel predictor transfers to a mostly-Asian
   cohort with a different panel. Consider int8 only if those numbers hold with it.
4. Product framing stays as Issue #11 states: a prediction of one rater panel's average opinion on a 1–10 scale,
   research-licensed data, never an objective or population-rank claim, never mixed with the D36 geometric score.
