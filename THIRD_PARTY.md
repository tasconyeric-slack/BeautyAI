# Third-party code, data and models

## Adapted code and data (MIT)

| Source | License | What we use | Where |
|---|---|---|---|
| [Oby-Borges/haircut-vision-advisor](https://github.com/Oby-Borges/haircut-vision-advisor) | MIT, © 2026 Haircut Vision Advisor contributors | Face-shape heuristic (weighted scores over length/width, forehead/cheek, jaw/cheek ratios); forehead landmark choice (103/332) for comparison; hairstyle catalog (`assets/hairstyles.json`, 15 styles with face-shape fit, length and mm parameters). V2 (K3) adds 45 original feminine entries and V2 fields (length band, fringe type, curl, salon scripts) to the same file; only the 15 adapted entries derive from the MIT source | `src/aesthetic_passport/face_shape.py`, `config/hairstyles.json` |
| [QuLi-ops/ai-hairstyle-try-on](https://github.com/QuLi-ops/ai-hairstyle-try-on) | MIT | Skimmed `detect_face_shape.py` as a second opinion on thresholds; no code copied | — |

The MIT license text for haircut-vision-advisor is reproduced at the top of `face_shape.py` and in
`config/hairstyles.LICENSE`.

## Published aggregate data

| Source | License | What we use | Where |
|---|---|---|---|
| The Face Report, [Facial measurement norms](https://thefacereport.com/guides/facial-measurement-norms) (14,144 frontal scans, 31 Aug 2026) | CC BY 4.0 | p5–p95 of 12 frontal ratios, copied unchanged; landmark indices are our own reconstruction | `config/reference_distributions.json › ratio_norms` |
| The Face Report, [Face analysis study](https://thefacereport.com/guides/face-analysis-study) (15,447 scans, 19 Aug 2026) | none stated for these figures | Aggregate facts only (5 score bins, median, 4 top-X% thresholds), cited; no text, chart or data file copied | `config/reference_distributions.json › overall_score` |
| The Face Report, [sample report](https://thefacereport.com/sample-report) | none stated | Four sub-score medians (n = 7,997) and one published overall / sub-score example, cited; used only as calibration checks | `config/reference_distributions.json › overall_score.component_medians / publisher_checks` |

## Reference only — no code copied

| Source | License | How it informed us |
|---|---|---|
| [F-Korpik/face_color_analysis](https://github.com/F-Korpik/face_color_analysis) | none (all rights reserved) | The idea of regional median colors → CIE Lab → warmth / depth / chroma / contrast signals. `color_sample.py` is an independent implementation on MediaPipe landmarks. |
| [henry-hai/AI-Hairstyle-Recommender](https://github.com/henry-hai/AI-Hairstyle-Recommender) | restrictive (no hosted service) | Architecture idea only. |

## Models and services (not redistributed)

| Item | License / terms | Notes |
|---|---|---|
| MediaPipe Tasks `face_landmarker.task`, `selfie_multiclass_256x256.tflite` | Apache 2.0 | Downloaded at build time by `make models` / the API Dockerfile; never committed. |
| MediaPipe canonical face model `canonical_face_model.obj` (google-ai-edge/mediapipe, `mediapipe/modules/face_geometry/data/`) | Apache 2.0 | Committed at `scripts/mesh/` (vertex positions only, an average face, not a person). Used to derive the 220 left/right landmark mirror pairs (`face_metrics/points.py`, re-checked by tests) and to build the synthetic test / demo face (`face_metrics/synthetic.py`). |
| DeepSeek API (`deepseek-flash`) | DeepSeek API terms | Production analysis model. |
| Alibaba Model Studio / DashScope (`qwen-image-edit-plus`) | Alibaba Cloud terms | Recommended Look image editing. |

## Front-end libraries

Next.js, React, Tailwind CSS, Radix UI primitives (shadcn/ui pattern), lucide-react, react-dropzone,
react-compare-slider, json-schema-to-typescript — all MIT or ISC; see `web/package.json`.
Fonts: Noto Serif SC, Noto Sans SC, Inter, JetBrains Mono (SIL Open Font License, via Google Fonts).

Photo framing (Issue #54) uses [Cropper.js](https://github.com/fengyuanchen/cropperjs) 2.3.1
(MIT, © 2015–present Chen Fengyuan) as a dependency for image dragging, wheel/pinch zoom and resizable crop
handles. Its distributed packages retain their license notices; our source-coordinate adapters are original code.

PDF report export (Issue #33, D38): `@react-pdf/renderer` (MIT) generates the PDF in the browser; `unpdf` (MIT,
bundles Mozilla pdf.js, Apache 2.0) is a dev dependency used only by the PDF tests. The PDF font is a subset of
Noto Sans SC Regular / Bold (SIL Open Font License 1.1, © Adobe / Google), committed at `web/public/fonts/report/`
with its `OFL.txt` and built by `web/scripts/subset-report-font.py`; it is embedded (further subset) in each PDF.
