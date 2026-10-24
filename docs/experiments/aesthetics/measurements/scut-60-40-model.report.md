# Aesthetics evaluation — scut-fbp5500

- Source: `Images` · label `beauty score (mean of 60 raters)` on its native range [1.0, 5.0]
- Protocol: split files train.txt / test.txt · test n = 2200
- Status: **complete** · tool 0.1.0 · commit 6aa2b8a60e2a

| Method | Status | Coverage | Spearman [95% CI] | Pearson | MAE | RMSE | Error basis |
|---|---|---|---|---|---|---|---|
| `train_mean` | ok | 2200/2200 | — | — | 0.5597 | 0.6784 | native |
| `mebeauty_dinov2` | ok | 2200/2200 | 0.6526 [0.627, 0.676] | 0.6597 | 0.3939 | 0.5103 | calibrated_on_train |

Common subset (all ranked methods scored): n = 2200

| Method | Spearman | MAE |
|---|---|---|
| `train_mean` | — | 0.5597 |
| `mebeauty_dinov2` | 0.6526 | 0.3939 |

## Notes

- Subsets AF/AM/CF/CM are SCUT's own published file-name labels.
- SCUT publishes no identity grouping; folds are used exactly as released.
- Scores predict a specific rater panel's mean rating; MEBeauty (1–10) and SCUT (1–5) scales are kept separate. Cross-scale MAE is only reported after a train-split linear calibration.
