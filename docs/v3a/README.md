# V3A face measurement — research inputs

These files are the product owner's research inputs for D34 (see `docs/DECISIONS.md`):

| File | What it is |
|---|---|
| `V3A_TASK.md` | The implementation brief. |
| `benchmark_study.md` | A study of a public facial-aesthetics product's *public* pages (functional benchmark only). |
| `facial_metric_catalog_v1.csv` / `.json` | A 176-row candidate pool of measurements (classes A / B / C). |

They are reference material, not specifications. What we actually measure is defined only in
`config/face_metrics.yaml`: our own formulas on MediaPipe landmarks, reusing the catalog's `Mxxx` ids for traceability.
No formula, threshold, image, text or asset from any other product is used, and labels whose formula is not public are
kept as `research_candidates` and never computed.
