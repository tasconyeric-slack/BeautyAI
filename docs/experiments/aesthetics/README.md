# Pretrained facial-attractiveness model — offline run & benchmark (Issue #11)

Code: [`experiments/aesthetics/`](../../../experiments/aesthetics/README.md) · Tests: `tests/test_aesthetics_experiment.py` ·
Raw measurements: [`measurements/`](measurements/) · First recorded 2026-10-24 at `3d61096`; SCUT benchmark at `5ba1cec`.

## Status — what is done, what is blocked (updated 2026-10-24, second pass)

| Acceptance item | State |
|---|---|
| `predict` / `evaluate` / `bench` commands, clean failure statuses, leakage guards | **Done** (PR #16), 19 no-photo tests |
| Report quality: `complete` only when every requested method scored ≥ 1 test image; parity is an explicit `pass`/`fail` against a stated tolerance (default 1e-3), zero usable rows → `fail` without crashing | **Done** (this follow-up) |
| **Measured benchmark of our own** | **Done on SCUT-FBP5500** — official 60/40 split and 5-fold CV fold 1, below |
| **Real-checkpoint inference** (`predict` with `status=ok`), MEBeauty holdout benchmark + parity, real-weight ONNX parity | **Blocked — needs a Hugging Face credential.** Network access now works, but both repos are *gated* (see below) |
| Runtime / memory | Measured for the identical architecture (untrained weights); Render-tier verdict below. Real-weight ONNX parity still pending the checkpoint |

### Remaining blocker (exact)

`dr-irina-lebedeva/MEBeauty-FBP-models` (weights) and `dr-irina-lebedeva/MEBeauty-Facial-Beauty-Prediction` (dataset)
are both **gated** (`gated: auto`, automatic approval). `hf download` from this environment returns
*"Access denied … requires approval"* because there is no Hugging Face credential here. The account holder must,
while signed in to huggingface.co, accept the terms on **both** pages, then expose a read token to the environment as
the secret/environment variable **`HF_TOKEN`**. No access control was bypassed and no token is stored in the repo.
The weights are therefore *not* "public": they are free-to-request, research-only.

### Licence finding that gates Issue #13

The weights' `LICENSE` (read from the model repo, 2026-10-24) restricts them to non-commercial research and
**explicitly forbids "deployment that scores, ranks, filters or gates real people"**, commercial use, cosmetic
advice, and redistribution (including re-uploading or derived weights, so an ONNX export must not be redistributed
either). A score shown to product users is a deployment that scores real people. Unless the licensor grants
permission, these weights cannot back a production feature, whatever the benchmark shows. Issue #13 should start
from this constraint (e.g. a written licence from the author, or a model trained on data whose terms allow it).

## Measured benchmark — SCUT-FBP5500 (ours)

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
| both | `mebeauty_dinov2` | 0 | — | — | — | `model_unavailable` (gated weights) |

60/40 breakdown by SCUT's own subset labels (Spearman): `geometric` AF −0.27, AM −0.08, CF 0.00, CM −0.03;
`geometry_ridge` AF 0.66, AM 0.59, CF 0.49, CM 0.54.

What this shows (research evidence, not a product claim):
- The product's geometric harmony score does **not** track how SCUT's raters scored faces; it is weakly *negative*
  overall and strongest-negative on Asian female faces. This supports D36's framing as a geometric reference that is
  explicitly not an attractiveness verdict, and argues against ever presenting it as one.
- The same landmark measurements carry real signal when weighted by data (ridge, fitted on train only): Spearman ≈ 0.61,
  MAE 0.42 vs 0.56 for the train-mean floor, within every subset. That ceiling belongs to the SCUT panel and does not
  transfer to other raters or scales.
- No pretrained-model number on SCUT exists yet: it needs the gated weights, and would be cross-panel (MEBeauty → SCUT)
  with a train-calibrated MAE.

## Runtime / resource verdict

- Measured (architecture-identical, untrained weights; see below): ONNX Runtime alone peaks at **641 MB RSS**, PyTorch
  at **1,426 MB**; ~0.26–0.32 s per photo on 4 vCPU, ~0.75–0.89 s on 1 vCPU.
- Render web tiers (render.com/pricing, 2026-10-24): **Starter 512 MB / 0.5 CPU** (the plan in `render.yaml`),
  Standard 2 GB / 1 CPU. The model alone exceeds Starter even before the API and MediaPipe are loaded (this benchmark's
  geometry-only run already peaks at 762 MB). On Starter the only option would be a separate service of at least
  Standard size; in-process needs Standard or larger with headroom measured on the real API.
- The licence finding above blocks production use regardless; the resource numbers matter only if a permissive model
  replaces these weights (a similar ViT-B backbone would cost the same).

## To finish once `HF_TOKEN` is available (CPU is enough)

```bash
hf download dr-irina-lebedeva/MEBeauty-FBP-models dinov2-partial.pt config.json --local-dir models/aesthetics/mebeauty-fbp
python -m experiments.aesthetics predict data/scut-fbp5500/SCUT-FBP5500_v2/Images/<one adult image>.jpg   # real status=ok
git clone https://github.com/dr-irina-lebedeva/MEBeauty-Benchmark ../MEBeauty-Benchmark
python -m experiments.aesthetics evaluate --dataset mebeauty \
    --reference-predictions ../MEBeauty-Benchmark/results/dinov2-partial_predictions.npz      # parity PASS/FAIL
python -m experiments.aesthetics evaluate --dataset mebeauty --crop face --methods mebeauty_dinov2   # framing drift
T=data/scut-fbp5500/SCUT-FBP5500_v2/train_test_files/split_of_60%training\ and\ 40%testing
python -m experiments.aesthetics evaluate --dataset scut-fbp5500 --images-dir data/scut-fbp5500/SCUT-FBP5500_v2/Images \
    --train-file "$T/train.txt" --test-file "$T/test.txt"                                   # cross-panel transfer
python -m experiments.aesthetics bench --variants onnxruntime --export-onnx models/aesthetics/mebeauty-fbp/model.onnx
python -m experiments.aesthetics bench-onnx --onnx models/aesthetics/mebeauty-fbp/model.onnx   # real-weight parity + RSS
```

MEBeauty's `image` field holds aligned 256×256 face crops, so `--crop none` is the harness-faithful setting on that
dataset; `--crop face` on arbitrary portraits (MediaPipe box, no alignment) is not established to reproduce that
alignment until the framing-drift run above quantifies it.

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

## Measured runtime (this environment)

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
> class; real-weight ONNX parity is still unmeasured.

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
