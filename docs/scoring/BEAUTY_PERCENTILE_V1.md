# BeautyAI attractiveness score -> reference percentile, v1 (2026-10-30)

**Status:** algorithm and percentile-tier policy ready; the #13 licensed learned scorer, a matching authorized adult reference cohort, and #34 report wiring are separate activation dependencies. This document does not claim that an actual learned-score population distribution has been measured.

## 1. Competitor evidence, not a transplanted model

[The Face Report attractiveness tool](https://thefacereport.com/tools/attractiveness) discloses its *geometric harmony* score as 35% symmetry + 25% facial thirds + 25% facial fifths + 15% golden-ratio proximity, using 478 landmarks. The tier labels displayed on that page are 87+ (Top 5%), 83–86 (Top 15%), 78–82 (Top 35%), 60–77, and below 60. These are product- and score-scale-specific categories; they do not validate the same raw-score thresholds for BeautyAI's separately trained attractiveness model.

The publisher's [19 August 2026 scan study](https://thefacereport.com/guides/face-analysis-study), released 4 September 2026, observed 15,447 scans (15,429 scored), mean 71.5, median 75, and thresholds 80+ = 29.9% of scans, 84+ = 10%, 89+ = 1%, 91+ = 0.1%. Binned shares: <50 = 7.4%, 50–59 = 7.9%, 60–69 = 16.6%, 70–79 = 38.2%, 80+ = 29.9%. One-day, self-selected *scans*, potentially repeat scans, not people sampled randomly from the population. The source also changed its score calibration in June–July 2026.

A defensible monotone reconstruction of this **TFR-only** approximate CDF uses these (score, cumulative share below) anchors:

```text
(50, 0.074), (60, 0.153), (70, 0.319), (75, 0.500),
(80, 0.701), (84, 0.900), (89, 0.990), (91, 0.999)
```

Piecewise-linear interpolation at integer scores gives approximately 78 -> top 38%, 83 -> top 15%, 87 -> top 4.6%. These calculations explain the competitor's tier thresholds. They are NOT a distribution measured for BeautyAI. The published coarse bins and selected quantiles do not reveal the true within-bin shape. Existing implementation and anchor tests are in `src/aesthetic_passport/percentiles/**` / `tests/test_percentiles.py`; **reuse them**.

## 2. Production algorithm for the learned attractiveness model

The #13 model's **native continuous rating prediction** is `s`, with a versioned rating protocol and model identity. From a lawful, model-matched, person-deduplicated adult reference cohort of N predictions, build counts at each distinct native score. The percentile is an empirical CDF with midranks:

```text
n_less  = count(reference_score < s)
n_equal = count(reference_score == s)
percentile_raw = 100 * (n_less + 0.5 * n_equal) / N
top_share_raw  = 100 - percentile_raw
```

No assumption of Gaussian/normal beauty scores; no hand-picked mean or standard deviation. Scores outside known support have only a tail bound, not a made-up extrapolation. This is **already implemented** in `src/aesthetic_passport/attractiveness_rank/engine.py` (`rank_prediction`); `ingest.py` builds the aggregated, deduplicated reference. `contracts.py` and `config/attractiveness_reference*.json` carry exact model/checkpoint/preprocessing/crop/native-scale/calibration/cohort version matching. Synthetic fixtures test code only.

Current `config/attractiveness_rank.yaml` policy: minimum 100 unique subjects; 100–999 -> round to 10 percentile points; >=1000 -> 5 points; require >=5 observations in each tail. A DKW sampling interval is available for the same sampling mechanism (it does not correct self-selection bias). This is sufficiently usable for an MVP with a correctly named reference cohort; only the missing *real matched data* prevents activation.

**Do not map SCUT label scores, Face++ scores, the existing `aes-geo-1.0` score, or the competitor's scan histogram directly to this learned model's percentile.**

## 3. Percentile tiers: BeautyAI original presentation, not arbitrary raw score ranges

This PR adds `config/attractiveness_rank_tiers.yaml` and `src/aesthetic_passport/attractiveness_rank/tiers.py`. The optional `tier_for_rank(RankResult)` consumes only an **available, already rounded** rank result from the existing engine, and returns a relative-position tier. It does not change inference, generate rankings, or bypass licensing and cohort gates.

| Displayed reference percentile | Internal tier id | Suggested result-page copy |
|---|---|---|
| >=95 | `top_5` | 参考样本前 5% 区间 |
| >=85 and <95 | `top_15` | 参考样本前 15% 区间 |
| >=65 and <85 | `top_35` | 参考样本前 35% 区间 |
| >=15 and <65 | `middle_range` | 参考样本常见区间 |
| <15 | `lower_15` | 参考样本后 15% 区间 |

These are **relative position** tiers, not clinical, moral or objective labels for a person. They follow displayed (rounded) percentiles, so cases close to a boundary may change tiers due to display resolution; keep the word "约" next to percentile results. For smaller N, a 5% category may not be resolvable; if the #33 engine gives unavailable, this helper returns no tier.

The tier names and thresholds live in config so product copy is editable independently of the model score. Never hardcode "BeautyAI score 87 = top 5%": the raw native score threshold for a percentile is learned from the **actual matching reference cohort**, and changes with model and cohort versions.

## 4. What to display, when

Result order for #34:

1. `AI 颜值预测分`: learned model's display prediction, specify the rating protocol and label scale; show unavailable when #13 cannot produce an authorized, quality-passed score.
2. `在[具名参考样本]中的约前 X%`: only when #33 returns `status=available`. Also show cohort N/version and an expandable explanation of self-selected vs representative sampling. Optional `tier_for_rank(result)` label sits next to it, not in place of a numeric rank.
3. `AI 面部几何美学参考分`: existing independent 0–100 landmark-based metric, never presented as a learned human rating.
4. Geometric findings and actionable styling suggestions, including when learned score/rank is unavailable.

**Example of display contract (illustrative, NOT measured BeautyAI output):**
```text
predicted_score: 7.4 / 10 (example only)
reference_rank:  approximately top 15% in [named, authorized sample]
rank_band:       "参考样本前 15% 区间"
cohort:          [source, N unique adults, sampling date, model hash, score-scale version]
```

Never show "ahead of 95% of all humans" from app visitors, academic convenience samples or AI-generated demo portraits.

## 5. Launch path: do not block the product on perfection

**Lane A — geometry, available now for scale testing:** `src/aesthetic_passport/percentiles/**` already stores the TFR published score anchors and can do a versioned `direct` mapping or quantile-crosswalk. The live `aes-geo-1.0` mapping is intentionally disabled in `config/percentiles.yaml`, as its 0–100 penalty constants do not reproduce TFR's exact score scale. Run the existing `scripts/calibrate_score_scale.py` on approximately 200 opted-in, QC-valid independent front photos (or another lawful relevant set); if scale agreement passes, register the scorer version. If not, fit an explicitly documented crosswalk and describe the result as a *comparison to TFR's self-selected geometry scans*, not learned attractiveness or a human population rank.

**Lane B — learned attractiveness, production target:** reuse #13's authorized scorer. Collect/import an appropriately permitted adult reference dataset, compute the **same model's** predictions once, deduplicate subjects, aggregate with #33 and record exact model/cohort/calibration versions. Use 100+ only for coarse position; prefer 1000+ for 5-point display intervals. Have #34 wire the existing rank result and optional tier into Passport/UI. Do not require a new normal-distribution fitting project.

**Lane C — if no licensed cohort is yet available:** continue shipping the score and the geometry/report experience without a numerical reference-population claim. Internal demos may show explicitly labeled fixture examples, but must not simulate a measured "top X%" for actual users.

## 6. What research supports (and does not support)

- Rhodes (2006), *The Evolutionary Psychology of Facial Beauty*, Annual Review of Psychology, doi: [10.1146/annurev.psych.57.102904.190208](https://doi.org/10.1146/annurev.psych.57.102904.190208): symmetry, averageness and sexual dimorphism are documented correlates of **perceived** attractiveness; no universal 35/25/25/15 scientific formula.
- Langlois & Roggman (1990), *Attractive Faces Are Only Average*, Psychological Science, doi: [10.1111/j.1467-9280.1990.tb00079.x](https://doi.org/10.1111/j.1467-9280.1990.tb00079.x): population-typical composite faces can receive higher observer attractiveness ratings.
- Liang et al. (2018), *SCUT-FBP5500: A Diverse Benchmark Dataset for Multi-Paradigm Facial Beauty Prediction*, [arXiv:1801.06345](https://arxiv.org/abs/1801.06345): 5500 face images with rating and rating-distribution labels; supports supervised/ranking paradigms, **not** borrowing its 1–5 scores or noncommercial data for our live population CDF.
- Talebi & Milanfar (2018), *NIMA: Neural Image Assessment*, doi: [10.1109/TIP.2018.2831899](https://doi.org/10.1109/TIP.2018.2831899): learning the distribution of human image-aesthetic ratings rather than only a mean; relevant future uncertainty design, but **image aesthetics is not face attractiveness**.
- [Photofeeler help](https://www.photofeeler.com/help/results): adjusts rater severity; its standardized 1–10 score is relative to its photo users and accounts for the subject's stated age/gender, not directly portable to BeautyAI.
- [Face++ Detect API](https://console.faceplusplus.com/documents/6329465): beauty `male_score`/`female_score` 0–100 outputs; no publicly documented sampled-population percentile mapping in those API fields.
- [Perfect Corp YouCam attractiveness implementation guide](https://www.perfectcorp.com/business/blog/general/how-to-build-attractiveness-test-youcam-api): API geometry/skin signals can be weighted into application-defined scores; these are distinct from a validated human-rating model.
- [Kumar et al. (2026) bias review](https://www.jmir.org/2026/1/e95452): dataset composition and rater perspective affect attractiveness prediction. Keep the reference population named and avoid claiming an app-user distribution is a representative population.

## 7. Acceptance checks

- TFR source facts are cited; scores 78/83/87 match *approximate TFR-only* top ~38/15/5% anchor interpolation.
- For a #33 `status=available` result, output percentile and optional config-derived tier, not a raw-score-based tier.
- For unavailable, quality-limited, research-only, version-mismatched or unlicensed paths, neither rank nor tier is shown.
- No edits to geometry scorer, learned model, production routes, report schema, user-photo retention, or existing TFR calibration gates.
- A single targeted pytest run for tiers plus normal CI; no repetitive audit loops.

Owner for #34 integration: Codex, once #13 and #33's compatible real-data contract is ready.
