# Ridge percentile mapping (#86)

The existing 2,128 model-matched held-out predictions span native 1.75617–4.16293 (mean 2.97136, SD 0.39760). Inspecting the upper shoulder favors a local Gaussian probability plot over fitting one Gaussian to the whole heterogeneous distribution.

Compared methods: empirical CDF alone (no extrapolation); exponential shoulder (simple but heavier tail); normal probability-plot shoulder (selected). At empirical 95%, 98%, 99.9% knots, unanchored normal Top estimates are 4.83%, 1.98%, 0.178%, versus exponential 4.67%, 1.98%, 0.314%. Tail observations remain sparse; this comparison is a diagnostic, not validation of extreme predictions.

Implementation uses Python standard-library [NormalDist and linear_regression](https://docs.python.org/3/library/statistics.html), avoiding new dependencies or license/deployment cost. Regress score on normal quantiles of midrank probabilities in [0.90, 0.99]. Join the interpolated empirical midrank curve at 0.95, rescaling survival by S(x)/S(join) times 0.05. This guarantees matching values and monotonicity at the join (not matching derivatives). The lower tail mirrors this construction. Policy values and model/reference selection live in YAML. Full model identity checks and the service's reference hash check run before ranking.

Raw native scores drive ranking; the display transformation remains 1 + (raw - 1) * 9/4. Display rounding never feeds back into rank. Existing unrelated empirical ranking callers retain their policy. Missing, invalid, unauthorized or mismatched references remain unavailable.

| Native | Display /10 | Empirical Top % | Continuous Top % | Tail estimate |
|---|---|---|---|---|
| 3 | 5.500 | 45.066 | 45.0859 | no |
| 3.5 | 6.625 | 11.466 | 11.4558 | no |
| 3.65 | 6.962 | 5.0282 | 5.03977 | no |
| 3.85 | 7.413 | 1.0338 | 1.16708 | yes |
| 4 | 7.750 | 0.23496 | 0.311170 | yes |
| 4.16293 | 8.117 | 0.023496 | 0.0590285 | yes |
| 4.3 | 8.425 | 0 | 0.0121099 | yes |
| 4.5 | 8.875 | 0 | 0.000882080 | yes |
| 5 | 10.000 | 0 | 0.000000249055 | yes |

Reproduce with `PYTHONPATH=src python scripts/diagnose_ridge_percentiles.py <reference-json>`; the script checks the configured reference hash and prints aggregates only. No images or new inference calls are used.

All extrapolations show 模型估计 and an explicit caveat. Top 0.01% has not been empirically validated by 2,128 observations. There is no claim of population position or tail-fit confidence interval. The existing KDE chart shows observed reference density, with the current score marker; its shaded area is descriptive and is not used to compute the tail probability.
