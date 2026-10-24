# AI 面部美学参考分 — competitor formula map (Issue #31, D36)

Baseline: The Face Report's public tool pages, read 2026-10-23. Our implementation: `src/aesthetic_passport/scoring/`,
every constant in `config/scoring.yaml` (scoring version `aes-geo-1.0`). We reproduce **publicly observable behavior**
on our own MediaPipe landmarks. This is not a copy of their code, and we do not claim to be mathematically identical.

Legend: **P** = publicly specified · **O** = observed in a published example · **I** = inferred by us · **B** = ours.

| Item | What we use | Basis |
|---|---|---|
| Overall | `0.35 sym + 0.25 thirds + 0.25 fifths + 0.15 golden`, 0–100 | **P** [attractiveness], [psl-score] |
| Landmarks | MediaPipe face mesh 478, one front photo | **P** (same model family as ours) |
| Symmetry | Midline fitted through upper forehead, forehead centre, nose bridge, nose base and chin (10, 151, 168, 2, 152). Each left point is reflected and its 2D residual to the right partner is divided by the pair's mean distance from the midline. 12 pairs; features jaw 35 / eyes 25 / brows 15 / mouth 15 / nose 10 | **P** [symmetry] |
| Symmetry pairs | eyes 133/362, 33/263, 159/386, 145/374; brows 107/336, 105/334, 70/300; ala 129/358; mouth 61/291; jaw 127/356, 234/454, 172/397 | **P** for the counts per region (nose 1, jaw 3), **B** for the exact indices (all verified as mirror pairs on the canonical mesh) |
| Symmetry penalty | `100 − 400 × mean normalized residual` per feature | **B** ("fixed penalty", constant not public). Gives 82 on a real frontal test portrait vs a published median of 75 |
| Pose gate | Their symmetry tool withholds the score at yaw > 2°. We: full ≤ 5°, limited ≤ 12°, symmetry and fifths not scored above 12° | **P** / **B** (our yaw estimate is not precise to 2°) |
| Thirds | Visible window from mesh top (10) to chin (152), split at the brow (105/334) and the nose base (2), against 18/41/41 | **P** for 18/41/41 = template-mesh thirds. **I** for brow 105/334: on the canonical mesh it gives 17.8/40.7/41.4 ≈ 18/41/41 (glabella would give 19/40/41) |
| Thirds conversion | `100 − 400 × mean |share ÷ ref − 1|` | **I**: fits the median scan 16/44/40 → 73 (ours 72.2) and the sample report 19/44/37 → 70 (ours 69.8) **O** [sample-report] |
| Fifths | Five segments: face edge → outer eye → inner eye → inner eye → outer eye → face edge, measured in eye widths | **P** (definition). Edge 234/454 is **B** |
| Fifths conversion | `100 − 140 × mean |segment ÷ eye width − 1|` | **B**: puts a typical face near the published median of 77 **O**; the canonical mesh scores 74 |
| Golden ratio | Visible length (10→152) ÷ cheekbone width (234→454); target 1.38 (phi 1.618 applies hairline → chin) | **P** [golden-ratio] |
| Golden conversion | `100 − 200 × |ratio ÷ 1.38 − 1|`; bands 90+ ≤ 5 %, 80–89 5–10 %, 70–79 10–15 % | **P** ("every 10 points ≈ 5 % relative deviation") |
| Tiers | 87 / 83 / 78 / 60 thresholds | **P** [attractiveness]. Labels are our own neutral wording; we do not show their percentile claims |
| Missing data | Profile view refused; covered hairline/jaw blocks; smile and tilt distort | **P**. We return explicit `unavailable` / `limited` states and never estimate |

Their own caveats, which we keep: the thresholds are product-authored calibrations, not scientific truths. The score
measures distance from selected targets on one photo. It is not a verdict on appearance and not a population
percentile. (Population percentiles belong to Issue #41, which consumes `score_summary()`.)

## Checks (tests/test_scoring.py)

- Canonical mesh → thirds 18/41/41, symmetry 100.
- Published thirds examples within 2.5 points.
- Golden-ratio bands.
- Tier thresholds.
- Roll invariance and determinism.
- Pose, expression, eyewear and forehead gates.
- The real pipeline scores the same landmarks the measurement profile uses.

Real-photo check: MediaPipe's Apache-licensed test portrait (`mediapipe-assets/portrait.jpg`, not committed) went
through the real API with real QC. The four components were in the 60–90 range, and the smile was flagged `limited`.

## Open calibration items

- The symmetry and fifths penalties are product constants. Re-fit them once consented real scans exist (D36).
- The yaw gate is looser than the competitor's 2°, because QC yaw is coarse.

[attractiveness]: https://thefacereport.com/tools/attractiveness
[psl-score]: https://thefacereport.com/tools/psl-score
[golden-ratio]: https://thefacereport.com/tools/golden-ratio
[symmetry]: https://thefacereport.com/tools/symmetry
[sample-report]: https://thefacereport.com/sample-report
Also read: https://thefacereport.com/tools/facial-ratios (12 ratio bands, used by #41, not by this score).
