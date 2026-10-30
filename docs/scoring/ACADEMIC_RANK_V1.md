# D42 — Provisional academic-reference attractiveness position (2026-10-30)

Product-owner decision: **ship a score-to-relative-position formula now**, without collecting or calibrating new faces. Keep the real learned-model rank path (#13/#33/#34) independent; this version uses the **existing geometric 0–100 score** as input and is **not** a learned predictor of human attractiveness.

## Published distribution: SCUT-FBP5500

Yang et al. (2023), *Implementation of an Attention Mechanism Model for Facial Beauty Assessment Using Transfer Learning*, Diagnostics 13(7), 1291, §2.1, https://doi.org/10.3390/diagnostics13071291, reports the 5,500-face SCUT-FBP5500 score-bin frequencies from the 1–5 human rating scale:

| Human mean rating bin | Images | Cumulative images below upper bound |
|---|---:|---:|
| 1–2 | 265 | 265 |
| 2–3 | 3,011 | 3,276 |
| 3–4 | 1,582 | 4,858 |
| 4–5 | 642 | 5,500 |

Original benchmark: Liang et al. (2018), SCUT-FBP5500, https://arxiv.org/abs/1801.06345. It uses multiple ratings per image. This published histogram is a distribution of **curated benchmark images and their human ratings**, not a census of all people. No image or checkpoint is copied, and the summary is attributed.

## Executable V1 formula

Let `s` be BeautyAI's existing `aes-geo-1.0` geometric harmony score in [0, 100], with `status=full`. Transfer it to the academic dataset's 1–5 rating scale using a **fixed, uncalibrated product convention**:

```text
r(s) = clamp(2.8 + 0.14 * (s - 75), 1, 5)
```

The constants **2.8, 0.14 and 75 are BeautyAI product defaults** chosen to give a useful spread around the existing score midpoint. They were **not measured or validated by Yang, Liang, or BeautyAI**. They are versioned in `config/academic_rank.yaml` for straightforward replacement. They do not assert that facial geometry predicts human preferences accurately.

Within each published rating interval [k, k+1] with count `n_k` and total `N=5500`, take a piecewise-uniform interpolation:

```text
CDF(r) = (sum(n_j for j<k) + n_k*(r-k)) / N       where k<=r<k+1
estimated_percentile = 100 * CDF(r(s))
estimated_top = 100 - estimated_percentile
```

Round ordinary top estimates to the nearest 5%; extreme tails to whole percentages (bounded at 1–99%). The *published four bin counts* are empirical; both **uniformity within each bin and the geometry-to-rating bridge** are product assumptions. This is a simple baseline that can later be replaced with real paired-label data, without changing the report's display layout.

Example approximate outputs for the versioned V1 defaults:

| BeautyAI geometry score | Converted academic rating | Model-estimated top share displayed |
|---:|---:|---:|
| 75 | 2.80 | 50% |
| 78 | 3.22 | 35% |
| 83 | 3.92 | 15% |
| 87 | 4.48 | 5% |

These align broadly with The Face Report's *presentation tiers*, but they are not independent proof of BeautyAI's human-rating accuracy. The Face Report itself uses a different geometric scoring implementation and a different scan distribution.

## Product integration / limitations

- Engine: `src/aesthetic_passport/percentiles/academic.py`, activated as an explicit fallback ONLY when the existing geometry rank returns `score_scale_unverified` and `aes-geo-1.0` has `status=full`. The original TFR percentiles and their scale gate remain unchanged.
- Output: the existing `reference_percentiles.rank` Passport schema shape, with `mapping_mode=crosswalk`, `method=published_score_bins_uniform_with_fixed_geometry_bridge_v1`, `reference_distribution_version=academic-geometry-rank-v1`, `cohort.kind=academic_published_images`, and mandatory approximate text/attribution.
- UI: "学术颜值参考估计（试行）", "按学术分布模型估计约前 X%" and a short method/source disclosure. Never use "真实人群前 X%" or "全球人口前 X%".
- Unusable/limited score, unknown scorer version or disabled academic config => unchanged unavailable behavior, no fake rank.
- Existing saved passports do not mutate automatically. New valid Passport calculations receive the result; old sample passports need regeneration to reflect the new method.
- Do not import/use the research-only SCUT or MEBeauty photo dataset and model weights in production. The quoted four published aggregate bin counts are not deployment of licensed research assets.

This satisfies the product owner's immediate rank-function objective without waiting for new calibration data; continue #13/#33 as an *improvement path*, not as a blocker for this explicitly modeled, approximate V1.
