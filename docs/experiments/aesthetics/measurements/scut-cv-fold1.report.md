# Aesthetics evaluation — scut-fbp5500

- Source: `Images` · label `beauty score (mean of 60 raters)` on its native range [1.0, 5.0]
- Protocol: split files train_1.txt / test_1.txt · test n = 1100
- Status: **partial** · tool 0.1.0 · commit 5ba1ceca6ac5

| Method | Status | Coverage | Spearman [95% CI] | Pearson | MAE | RMSE | Error basis |
|---|---|---|---|---|---|---|---|
| `train_mean` | ok | 1100/1100 | — | — | 0.5666 | 0.6827 | native |
| `geometric` | ok | 1060/1100 | -0.2051 [-0.261, -0.151] | -0.2301 | 0.5333 | 0.6585 | calibrated_on_train |
| `geometry_ridge` | ok | 1060/1100 | 0.6005 [0.557, 0.637] | 0.5926 | 0.4275 | 0.5451 | native |
| `mebeauty_dinov2` | model_unavailable | 0/1100 | — | — | — | — | — |

Common subset (all ranked methods scored): n = 1060

| Method | Spearman | MAE |
|---|---|---|
| `train_mean` | — | 0.5621 |
| `geometric` | -0.2051 | 0.5333 |
| `geometry_ridge` | 0.6005 | 0.4275 |
| `mebeauty_dinov2` | — | — |

## Not run

- `mebeauty_dinov2`: model_unavailable — weights not found at models/aesthetics/mebeauty-fbp/dinov2-partial.pt · prerequisite: Download dinov2-partial.pt and config.json from https://huggingface.co/dr-irina-lebedeva/MEBeauty-FBP-models into models/aesthetics/mebeauty-fbp/ (git-ignored), e.g. `hf download dr-irina-lebedeva/MEBeauty-FBP-models dinov2-partial.pt config.json --local-dir models/aesthetics/mebeauty-fbp`, or pass --weights / set AESTHETICS_WEIGHTS. Needs network access to huggingface.co.

Incomplete: `mebeauty_dinov2` (model_unavailable)

## Notes

- Subsets AF/AM/CF/CM are SCUT's own published file-name labels.
- SCUT publishes no identity grouping; folds are used exactly as released.
- Scores predict a specific rater panel's mean rating; MEBeauty (1–10) and SCUT (1–5) scales are kept separate. Cross-scale MAE is only reported after a train-split linear calibration.
