# Pretrained facial-attractiveness model — offline run & benchmark (Issue #11)

Code: [`experiments/aesthetics/`](../../../experiments/aesthetics/README.md) · Tests: `tests/test_aesthetics_experiment.py` ·
Raw measurements: [`measurements/`](measurements/) · Recorded 2026-10-24 at repo commit `3d61096`.

## Status — what is done, what is blocked

| Acceptance item | State |
|---|---|
| Single-photo command (`predict`) with `model_version`, `dataset`/`label_scale`, `raw_score`, `status`, preprocessing; clean no-face / unreadable / missing-model handling | **Done**, covered by tests |
| Evaluation command (`evaluate`) — MEBeauty holdout, SCUT-FBP5500 official folds, CSV; geometric score vs geometry ridge vs pretrained model; coverage, Spearman (+CI), MAE per native scale, common subset, group breakdowns; leakage guards | **Done**, covered by tests (synthetic data) |
| Synthetic / no-photo smoke test | **Done** — 17 tests; the 3 checkpoint tests load a tiny synthetic Dinov2 checkpoint in both transformers attention layouts (they skip in CI, which has no torch) |
| **Real-model output** | **Not done — blocked.** The published weights could not be downloaded |
| **Benchmark result of our own** | **Not done — blocked.** Neither MEBeauty nor the SCUT-FBP5500 images could be downloaded |
| Measured CPU runtime / memory | **Done** for the identical architecture with untrained weights (timing does not depend on weight values); no GPU in this environment |
| Weights / photos / tokens out of git | **Done** — `models/`, `runs/`, `data/`, images ignored at the root; `experiments/aesthetics/.gitignore` also blocks `*.pt`, `*.onnx`, `*.npz`, … |

**Exact blocker.** The build sandbox's network policy refuses CONNECT to `huggingface.co` (weights
`dr-irina-lebedeva/MEBeauty-FBP-models`, dataset `dr-irina-lebedeva/MEBeauty-Facial-Beauty-Prediction`),
`drive.google.com` / `drive.usercontent.google.com` / `pan.baidu.com` (SCUT-FBP5500 images), and the mirrors tried
(`hf-mirror.com`, `kaggle.com`, `modelscope.cn`). GitHub (git) and PyPI were reachable, which is how the reference
code, the SCUT split files and the dependencies were obtained. **No model run is claimed.**

To complete acceptance on a machine with that access (CPU is enough; weights ≈ 330 MB by parameter count; the
benchmark docs quote ~750 MB of Hub downloads for dataset + backbone):

```bash
pip install -r experiments/aesthetics/requirements.txt
hf auth login                                   # after accepting the MEBeauty terms on its dataset page
hf download dr-irina-lebedeva/MEBeauty-FBP-models dinov2-partial.pt config.json --local-dir models/aesthetics/mebeauty-fbp
python -m experiments.aesthetics doctor
git clone https://github.com/dr-irina-lebedeva/MEBeauty-Benchmark ../MEBeauty-Benchmark
python -m experiments.aesthetics evaluate --dataset mebeauty \
    --reference-predictions ../MEBeauty-Benchmark/results/dinov2-partial_predictions.npz
python -m experiments.aesthetics evaluate --dataset mebeauty --crop face --methods mebeauty_dinov2   # framing check
python -m experiments.aesthetics bench                                                              # real weights
```

The parity check compares our predictions on the 250 holdout-test images with the 250 predictions the benchmark
published (`max_abs_diff`); the maintainers state the hosted weights reproduced those metrics bit-exactly, so a
difference above ~1e-3 means our port or the transformers version differs.

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
