# D42 — V1 quantile mapping from geometry score to human-semantic reference rating (2026-10-30)

**Product decision:** ship now without new face annotation, human-rater recruitment or new data collection. This is a transparent mathematical display transform of the existing `aes-geo-1.0` score, not a validated predictor of perceived attractiveness.

## Why not divide the score by ten?

An existing geometric harmony score near 75/100 does **not** imply that human raters would give a face 7.5/10. The scales have different meanings and central tendencies. Kramer et al. (2024), https://doi.org/10.1177/03010066241256221, discusses the dependence of facial attractiveness ratings on response scales.

We adopt the **rank equivalence assumption** instead: preserve the BeautyAI geometry ordering, but change the numeric 1–10 display to a model of human ratings at the same relative quantile. This assumption is necessary and **not proven** by the papers.

## 1. Geometry percentile: existing TFR aggregate reference

`config/reference_distributions.json` includes previously attributed public summary facts from The Face Report's 15,429 voluntarily submitted scans (not population representative), with CDF anchors:

| Geometry score | CDF (= share lower scoring) |
|---:|---:|
| 50 | 0.074 |
| 60 | 0.153 |
| 70 | 0.319 |
| 75 | 0.500 |
| 80 | 0.701 |
| 84 | 0.900 |
| 89 | 0.990 |
| 91 | 0.999 |

Source: https://thefacereport.com/guides/face-analysis-study .

For `S` between two consecutive anchors, set `p=linear_interpolate(S, anchors)`; tails are **bounds**, not invented exact quantiles. **Crucial assumption:** `aes-geo-1.0` geometry scoring behaves like the separate TFR geometry-score scale at equal score values. BeautyAI has not checked this with paired faces. Retain the TFR score gate in `config/percentiles.yaml`; this is separately labeled an exploratory estimate.

## 2. Human rating target: Hayden 2007 + Rhodes 2011

Hayden et al. (2007), *Economic principles motivating social attention in humans*, Proceedings of the Royal Society B, DOI https://doi.org/10.1098/rspb.2007.0368 (https://pmc.ncbi.nlm.nih.gov/articles/PMC2493582/), re-rated 2,000 female and 2,000 male photographs on a native **1–10 attractiveness scale**.

Published raw-rating group means:
- central 200/2000: 5.44 for female photographs (male raters); 4.47 for male photographs (female raters)
- top 100/2000 (5%): 7.40 for female photographs; 6.89 for male photographs

**These are group means, not population means or precise top-five-percent thresholds.** For a single V1 model, give both study categories equal weight: approximate central reference `mu=(5.44+4.47)/2=4.955` and upper-tail group mean `m_top=(7.40+6.89)/2=7.145`.

As a *further modeling approximation*, posit a Normal(mu,sigma) 1–10 rating distribution. Under this assumption, the conditional mean of the top 5% is `mu + 2.063*sigma`. Therefore `sigma=(7.145-4.955)/2.063≈1.062`.

Rhodes et al. (2011), https://doi.org/10.1371/journal.pone.0026653, found approximately normally distributed 1–10 attractiveness rating averages among 60 male images (`mean=4.1, SD=1.1`). This supports trying a Normal model but does **not** confirm the Hayden distribution is Normal, or that the pooled coefficients are population parameters. Hayden's 4,000 photographs and Rhodes's 60 men are *different* datasets, not interchangeable validation.

## 3. Human-semantic display

```text
p(S)    = interpolate TFR geometry CDF at S
H(S)    = clamp(4.955 + 1.062 * inverse_standard_normal_cdf(p(S)), 1, 10)
Top(S)  = 100 * (1 - p(S))
```

The same p drives H and Top. Never calculate Top by dividing the 0–100 geometric score by 10. Semantics are **model-based** and not a newly collected human score.

| BeautyAI geometry score | TFR model Top (%) | Human-semantic rating (1–10) |
|---:|---:|---:|
| 70 | ~68 | 4.5 |
| 75 | 50 | 5.0 |
| 78 | ~38 | 5.3 |
| 80 | ~30 | 5.5 |
| 83 | ~15 | 6.1 |
| 87 | ~4.6 | 6.7 |
| 89 | ~1 | 7.4 |

Display percent rank coarsely, usually nearest 5%; reserve whole-% or 0.1% for the extreme tails. Outside published anchor range (below 50 and at/above 91), mark outputs as **one-sided bounds**, rather than falsely precise point scores.

## 4. Implementation

- Policy `config/academic_rank.yaml` contains the two paper sources and `mu`/`sigma`. No photos, checkpoints or paid inference.
- `src/aesthetic_passport/percentiles/academic.py` reads the geometry score and published TFR anchors, computes `p` and `H`, and returns the existing `reference_percentiles.rank` schema. `reference_score` carries the derived 1–10 human semantic rating **only under method** `tfr_harmony_quantile_to_hayden_semantic_normal_v1`; other methods retain their prior meaning.
- The report labels `AI颜值参考分（试行）` and `颜值参考分约 H/10 · 参考样本前 X%`. Expandable methodology distinguishes TFR scan rank, Hayden human ratings, and assumptions.
- Only `full`, valid `aes-geo-1.0` scores qualify, without affecting the existing TFR calibrated rank path or #33 learned-model ECDF.
- No new face/rating data; no representative-population rank; no commercial reuse of research-only face images or model weights.
- Existing snapshots are immutable until separately regenerated; the new calculation applies to newly issued reports.

**Scope:** quantile normalization is a valid mathematical transformation, but its use as a proxy for human attractiveness is an explicitly unverified product hypothesis. Its purpose is a legible V1 scale, not proof that geometry predicts human judgments.
