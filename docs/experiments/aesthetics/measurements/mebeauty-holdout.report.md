# Aesthetics evaluation — mebeauty

- Source: `dr-irina-lebedeva/MEBeauty-Facial-Beauty-Prediction [fbp_extended]` · label `beauty_score` on its native range [1.0, 10.0]
- Protocol: published holdout: train → test (validation unused; identity-grouped by the publisher) · test n = 250
- Status: **complete** · tool 0.1.0 · commit 6aa2b8a60e2a

| Method | Status | Coverage | Spearman [95% CI] | Pearson | MAE | RMSE | Error basis |
|---|---|---|---|---|---|---|---|
| `train_mean` | ok | 250/250 | — | — | 0.9107 | 1.1512 | native |
| `geometric` | ok | 146/250 | 0.0779 [-0.088, 0.229] | 0.1242 | 0.8915 | 1.1333 | calibrated_on_train |
| `geometry_ridge` | ok | 146/250 | 0.2876 [0.127, 0.429] | 0.3010 | 0.8711 | 1.0796 | native |
| `mebeauty_dinov2` | ok | 250/250 | 0.7669 [0.708, 0.816] | 0.7711 | 0.5658 | 0.7373 | native |

Common subset (all ranked methods scored): n = 146

| Method | Spearman | MAE |
|---|---|---|
| `train_mean` | — | 0.8886 |
| `geometric` | 0.0779 | 0.8915 |
| `geometry_ridge` | 0.2876 | 0.8711 |
| `mebeauty_dinov2` | 0.7769 | 0.5500 |

## Parity with published predictions: **PASS** (tolerance 0.001)

```json
{
  "tolerance": 0.001,
  "reference": "dinov2-partial_predictions.npz",
  "n_reference": 250,
  "n_compared": 250,
  "max_abs_diff": 2.38e-06,
  "mean_abs_diff": 5.67e-07,
  "n_over_tolerance": 0,
  "published_predictions_metrics": {
    "n": 250,
    "spearman": 0.7669,
    "pearson": 0.7711,
    "spearman_ci95": null,
    "mae": 0.5658,
    "rmse": 0.7373
  },
  "status": "pass"
}
```

## Notes

- The published dinov2-partial weights were trained on this holdout's train split and early-stopped on its validation split, so only `test` is a fair evaluation split for them.
- Scores predict a specific rater panel's mean rating; MEBeauty (1–10) and SCUT (1–5) scales are kept separate. Cross-scale MAE is only reported after a train-split linear calibration.
