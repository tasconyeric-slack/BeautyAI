# Aesthetics evaluation — mebeauty

- Source: `dr-irina-lebedeva/MEBeauty-Facial-Beauty-Prediction [fbp_extended]` · label `beauty_score` on its native range [1.0, 10.0]
- Protocol: published holdout: train → test (validation unused; identity-grouped by the publisher) · test n = 250
- Status: **partial** · tool 0.1.0 · commit 6aa2b8a60e2a

| Method | Status | Coverage | Spearman [95% CI] | Pearson | MAE | RMSE | Error basis |
|---|---|---|---|---|---|---|---|
| `mebeauty_dinov2` | ok | 250/250 | 0.7646 [0.705, 0.814] | 0.7713 | 0.5692 | 0.7360 | native |

Common subset (all ranked methods scored): n = 250

| Method | Spearman | MAE |
|---|---|---|
| `mebeauty_dinov2` | 0.7646 | 0.5692 |

Incomplete: `parity` (fail)

## Parity with published predictions: **FAIL** (tolerance 0.001)

```json
{
  "tolerance": 0.001,
  "reference": "dinov2-partial_predictions.npz",
  "n_reference": 250,
  "n_compared": 250,
  "max_abs_diff": 0.345,
  "mean_abs_diff": 0.0297,
  "n_over_tolerance": 114,
  "published_predictions_metrics": {
    "n": 250,
    "spearman": 0.7669,
    "pearson": 0.7711,
    "spearman_ci95": null,
    "mae": 0.5658,
    "rmse": 0.7373
  },
  "status": "fail",
  "reason": "max |\u0394| 0.345 > tolerance 0.001"
}
```

## Notes

- The published dinov2-partial weights were trained on this holdout's train split and early-stopped on its validation split, so only `test` is a fair evaluation split for them.
- Scores predict a specific rater panel's mean rating; MEBeauty (1–10) and SCUT (1–5) scales are kept separate. Cross-scale MAE is only reported after a train-split linear calibration.
