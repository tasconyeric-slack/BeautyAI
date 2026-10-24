# Reference distributions and percentiles (Issue #41)

Code: `src/aesthetic_passport/percentiles/` · data: `config/reference_distributions.json` (version
`refdist-2026-10-23.1`) · settings and the scoring-version gate: `config/percentiles.yaml` · tests:
`tests/test_percentiles.py`.

The engine answers two questions, both relative to a **self-selected cohort of scans**. Neither is a ranking against
the human population:

1. *Where does an overall 0–100 score sit among published reference scans?* → `score_percentile()`
2. *Where does each of 12 frontal proportions sit among published reference scans?* → `ratio_rails()`. This shows
   size only. Higher is not better.

No faces, photos, private endpoints or per-person data were used. Only published aggregate numbers are used.

## Sources

| id | What | N | Date | Licence | Used for |
|---|---|---|---|---|---|
| `tfr-harmony-2026-08-19` | The Face Report, [face analysis study](https://thefacereport.com/guides/face-analysis-study) | 15,447 scans, 15,429 scored | 2026-08-19 (published 2026-09-04) | No licence stated for the harmony figures | 5 score bins, median, 4 top-X% thresholds (aggregate facts, cited; no text, charts or files copied) |
| `tfr-ratio-norms-2026-08-31` | The Face Report, [facial measurement norms](https://thefacereport.com/guides/facial-measurement-norms) | 14,144 frontal scans | 2026-08-31 | **CC BY 4.0** | p5/p10/p25/p50/p75/p90/p95 of 12 ratios, copied unchanged with attribution |

Both cohorts are people who chose to upload a photo to free tools on one day. Repeats are possible, the cohort skews
young (the score cohort also skews male), and no demographics are recorded. The score figures come from that
publisher's engine as recalibrated in June–July 2026.

SCUT-FBP5500 and MEBeauty are licensed for non-commercial research only and are **not** used.

## Overall score → percentile

**Anchors.** These are the only points known for the CDF (score → share of scans scoring lower):

| score | 50 | 60 | 70 | 75 | 80 | 84 | 89 | 91 |
|---|---|---|---|---|---|---|---|---|
| share below | 0.074 | 0.153 | 0.319 | 0.50 (median) | 0.701 | 0.90 | 0.99 | 0.999 |

The 50/60/70/80 values are cumulative bin edges. The bin at 80 and the published "80+ ≈ 29.9%" figure agree exactly,
and `score_anchors()` rejects the file if any two published facts disagree. Between anchors the CDF is
piecewise-linear. That keeps it monotonic and deterministic, and assumes no distribution shape (no normal curve, no
invented mean or standard deviation).

**Tails.** Nothing is published below 50 except "7.4% of scans", so any score under 50 returns a bound:
`lower_tail_bound` with copy "参考扫描人群中约后 7%". From 91 up, the result is `upper_tail_bound` with copy
"前 0.1% 以内". The highest score observed in the cohort was 92. Between 89 and 91 the copy is "前 1% 以内".

**Rounding** (`config/percentiles.yaml › score_display`) keeps the shown precision in line with what the anchors
support. When the smaller tail share is at least 10%, the share is rounded to the nearest 5%. Otherwise it is rounded
to a whole percent. If the top share is 50% or less, the copy is "参考扫描人群中约前 X%". Otherwise it is
"约高于 Y% 的参考扫描".

Fixtures (tests): 80 → top 30% (percentile 70, *not* 80) · 84 → top 10% · 89 → top 1% · 91 → top 0.1%.

**Scale gate.** A score is placed only if its `scoring_version` is listed under `score_mappings`:

- `direct`: the scorer uses the publicly disclosed weights and normalisations (#31), **and**
  `check_scale_compatibility(sample)` returned `compatible` on at least 200 consented scores. The check passes when
  every bin share is within 5 points of the published share, the shares above 80, 84 and 89 are within 5 points, and
  the median is within 3 points.
- `crosswalk`: a monotonic piecewise-linear map from our score to the reference scale. `fit_crosswalk(sample)` builds
  it by quantile matching on the published anchors. This assumes our scanned cohort resembles the reference cohort;
  record that assumption next to the knots. A score beyond the first or last knot returns a bound only (for example
  "约后 7%" or "前 10% 以内"). It is never clamped to a point estimate.
- Anything else returns `unavailable / score_scale_unverified`. `complete=False` (a partial or limited score) returns
  `partial_score`, and a missing score returns `no_score`. We never assign a reference-cohort rank to an unrelated
  scale.

A `limited` score (photo-condition flags) is never ranked (`rankable_score_status: [full]`).

**Calibration gap (current state).** `aes-geo-1.0` (#31) is **not registered**, so the hero shows
"参考人群位置校准中" with no number. Here is the evidence considered:

- **For:** the overall weights are the publisher's, and so is the golden-ratio conversion. The thirds conversion
  reproduces both published examples within 0.8 points. The publisher's sample report (79 = .35·81 + .25·70 + .25·85
  + .15·78, "Top 30%") confirms the weights and our CDF (79 → top 35%, one rounding step away).
- **Against:** the symmetry and fifths penalties are product constants tuned so a typical face lands near the
  published medians. On the one real test portrait, symmetry scored 82 against a published median of 75. Matching
  weights do not prove matching scales, and a 5-point offset near 80 moves a rank from top 30% to top 50%.
- **Missing:** a distribution of our scores on real faces. Synthetic or fixture faces are not a population.

To close the gap, run `PYTHONPATH=src python scripts/calibrate_score_scale.py <consented front photos>` on at least
200 `full` scores. It prints the verdict, our component medians next to the publisher's (75 / 73 / 77 / 76, n =
7,997), and crosswalk knots when needed. Then register the version with what was checked.

**Output** (`status: "ok"`): `percentile_estimate`, `top_percent_estimate`, `precision`, `approximate: true`,
`label_zh`, `higher_than_zh`, `note_zh` (for the expandable note), `cohort {n, source_date, source_url, publisher,
population_representative: false}`, `scoring_version`, `reference_distribution_version`, `mapping_mode`.

## 12 ratio rails

The publisher measures with a 478-point browser face mesh, which is assumed to be the MediaPipe Face Landmarker
topology. It describes each ratio in words but does not publish landmark indices. Our indices follow the text
literally:

| id | Published definition | Our MediaPipe implementation |
|---|---|---|
| canthal_tilt | inner→outer eye-corner line vs fitted face-horizontal, +ve = outer higher | 133/362 → 33/263 against the eye-centre line; mean of both eyes |
| eye_spacing | inner-corner distance ÷ mean visible eye width | \|133–362\| ÷ mean(\|33–133\|, \|362–263\|) |
| fwhr | cheekbone width ÷ (upper-eyelid midpoint → upper lip) | \|234–454\| ÷ vertical(mean 159/386 → 0) |
| face_length_width | mesh top → chin ÷ cheekbone width | vertical(10 → 152) ÷ \|234–454\| |
| ipd_face_width | iris centres ÷ cheekbone width | \|468–473\| ÷ \|234–454\| (needs iris) |
| midface_length | brow midpoint → nose base ÷ face height | vertical(mean 105/334 → 2) ÷ vertical(10 → 152), the same brow cut as #31's thirds |
| lower_face_length | nose base → chin ÷ face height | vertical(2 → 152) ÷ vertical(10 → 152) |
| jaw_cheek_width | jaw width ÷ cheekbone width | \|172–397\| ÷ \|234–454\| |
| mouth_face_width | mouth corners ÷ cheekbone width | \|61–291\| ÷ \|234–454\| |
| nose_mouth_width | alar width ÷ mouth width | \|129–358\| ÷ \|61–291\| |
| nose_length | nose bridge → tip ÷ face height | vertical(168 → 1) ÷ vertical(10 → 152) |
| lip_fullness | upper-lip top → lower-lip bottom ÷ mouth width | vertical(0 → 17) ÷ \|61–291\| (closed mouth only) |

Widths are Euclidean distances. Heights are vertical distances in the roll-free frame, the same `make_frame` that
`face_metrics` uses.

**Gates:** |yaw| > 12° or |pitch| > 20° → all `pose_off_axis` · fewer than 478 points → `ipd_face_width: no_iris`
· open lips → `lip_fullness: mouth_open` · no face → `no_face`. A missing rail shows as unavailable and is never
estimated.

**Position:** linear between the published quantile knots. Below p5 or above p95 the result is a bound. The shown
percentile is rounded to the nearest 5, and the band is very_low (<5) / low (<25) / typical / high (>75) /
very_high (>95), using the same number that is shown. Each rail carries `higher_is_better: null`, and its copy ends
with "百分位只表示数值大小的位置，不代表好坏".

**Shown vs computed.** All 12 ratios are computed, but a rail is shown only when its id is in
`config/percentiles.yaml › ratio_verified`. Every other rail reports `definition_unverified` and exposes no value.
Two ratios are verified today, `midface_length` and `lower_face_length`. Their cuts (mesh top 10, brow 105/334,
nose base 2, chin 152) are exactly #31's thirds, which match the publisher's 18/41/41 template on the canonical mesh
and its published thirds examples. The publisher's median scan (16/44/40) also equals this table's medians (0.44 /
0.40).

**Landmark match for the other 10: inferred, not yet verified on photos.** On the MediaPipe canonical (average) mesh, which is an
orthographic projection rather than a selfie, 10 of the 12 values fall inside p5–p95. Mouth/face (0.32) sits exactly
at p5 and ipd/face (0.41) falls below it. The values that use cheek width miss the median in one consistent direction
(ipd/face 0.41, mouth/face 0.32, fWHR 2.41). That pattern is what selfie
perspective would produce (the face sides look narrower and the centre features wider than in an orthographic
view), so the canonical mesh cannot confirm the index choices. To verify, run
`PYTHONPATH=src python scripts/check_ratio_norms.py <folder of consented front photos>` (≥ 30 faces). It prints
cohort medians only. Drop or fix any rail whose median lands outside the published IQR before it is shown as a
cohort comparison.

## Integration (done with #31, schema 0.7)

- **Pipeline.** `pipeline._percentiles` calls `percentiles.reference_percentiles(aesthetic_score, landmarks, yaw,
  pitch)` right after the scorer, on the same front landmarks. The result goes into the top-level
  `reference_percentiles` field (rules layer). A failure records only the exception type in `cv.json`. The score's
  photo-derived status and flags are no longer written to `cv.json` (PR #46 review).
- **Web.** `referenceRank()` feeds the score hero: the approximate position with an "近似" badge, or the reason
  there is none, with cohort, N, date and source in the "怎么算的" note. `referenceRatios()` feeds the workbench's
  `ReferenceRails`: the verified rails, plus one line about the unverified ones.
- **Fixtures.** `scripts/make_sample_geometry.py` builds the same block for the synthetic sample, with the same gate,
  so it also shows the calibration state.

## Later (not a V1 prerequisite)

An opt-in, consented aggregate of our own score distribution: one entry per person or session, no photo retention.
Once N is large enough it would replace or recalibrate the crosswalk.
