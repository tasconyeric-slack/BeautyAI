# Chinese BeautyAI Hero — focused reference-led preview

## Scope and visual decisions

Source branch: `codex/chinese-hero-refinement`, based on BeautyAI `origin/main` at `da3f22c`. Development preview: `/dev/hero` (production returns 404). Run `cd web && npm ci && NEXT_PUBLIC_USE_FIXTURE=1 npm run dev`, then open that route on the dev server.

The owner-supplied `BeautyAI-Chinese-Hero-reference.zip` contains **visual baselines only**: desktop 1536 × 961 and mobile 711 × 1536. No editable Chinese Hero source was found in the task workspace or available branches. This implements the owner's explicitly authorized fallback: a small isolated preview in the actual BeautyAI repo. It is not a restarted QOVES reconstruction or a production homepage change.

- Preserve the baseline's 30% / 40% / 30% desktop composition, full-height center portrait, utility navigation and start/sample destinations.
- Replace generic feature cards with one real observation that connects a dimensionless proportion to interpretation and a practical styling choice. No beauty score or invented status appears.
- Use existing Noto Serif SC for the two-line Chinese promise; Noto Sans SC for explanatory text; existing Inter/mono for numbers and utility type. Use existing paper, ink and petrol-primary tokens. No new fonts, dependencies, image generation, portrait retouching or borrowed brand assets.
- Use approved Person-002's original frontal photograph. Person-001 and Person-002 were both visually inspected and their report/provenance files checked. Person-002 has natural skin texture and flyaway hair, plus a matching real-pipeline sample report. The reference screenshot's unrelated idealized portrait is not reused.
- Mobile uses one coherent portrait, a compact data/advice block and a full-width start action visible at 390 × 844. No collage, feature cards or fake menu.
- Reuse the existing `HoldButton` / `useHold` pointer and keyboard behavior: hold to see the clean original; release restores the analytical layer. Transition is 220 ms, disabled under reduced motion.

## Exact data powering the preview

These are **checked-in pipeline-backed sample data**, not a fresh live analysis or a claim about the visitor. The subject is explicitly labeled `AI 虚构人物 002`.

| Display / graphic | Field / source | Contract |
|---|---|---|
| Subject and report destination | `DEMO_CASES` → `demoCaseByKey("p002")`, `.key`, `.label`, `.passport.passport_id` | `/report/sample?v=p002` opens that same person's report. |
| Portrait | `.photos.front` resolved from `person-002.provenance.json.published_images.front.path` | `/sample/demo/person-002/front.jpg`; existing approved image, unchanged. |
| Intrinsic coordinate system | `.geometry.width`, `.geometry.height` and `.provenance.published_images.front.width/height` | 1122 × 1402. Mismatched dimensions suppress insight and overlay. |
| Ratio and definition | `.passport.measurement_profile.metrics.find(id === "M006")`: `value`, `decimals`, `unit`, `name_zh`, `definition_zh`, `availability`, `source_photo` | `key=jaw_cheek`, raw value `0.7861`, two decimal ratio display `0.79`; unitless, never cm. Existing `display()` formatter. |
| Measured width | M006 `.overlay.segments[0]` → `geometry.points.jaw_l`, `.jaw_r` | `[0.3274,0.5963]` to `[0.6708,0.5943]`; solid measurement line and endpoint ticks. |
| Reference width | M006 `.overlay.segments[1]` → `geometry.points.cheek_l`, `.cheek_r` | `[0.2801,0.4425]` to `[0.7169,0.4430]`; dashed reference line. |
| Facial contour | M006 `.overlay.outline` resolved by existing `metricOverlay()` to `geometry.jaw` | Only its lower-face samples at/below the cheek reference height are shown. Catmull–Rom interpolation runs through those measured points; no hand-drawn outline or dense mesh. |
| Observation / interpretation | `.passport.derived.measurement_insights.items.find(metric_id === "M006")`: `.seen_zh`, `.means_zh` | Rendered from that exact report's rules-derived reading. Interpretation includes the report's existing qualitative wording; no new population statistic is inferred. |
| Styling advice | Same insight's `.advice.find(area === "hair").text_zh` | “下巴到锁骨之间的长度都容易驾驭，可按打理时间来选。” Unmodified report advice. |

The presentation calls existing `metricOverlay()` so missing landmarks, locked or unmeasured metrics cannot silently produce fabricated lines. Missing insight/photo/measurements suppress the numerical block. Portrait and SVG share the exact intrinsic viewBox and centered cover crop (`object-fit: cover`, `preserveAspectRatio="xMidYMid slice"`). Browser verification projects a real jaw endpoint through the SVG screen matrix and the image cover transform at both target sizes and requires <0.1 px drift.

## Coordination and preserved behavior

PR [#68](https://github.com/tasconyeric-slack/Stopped-Face-Assess/pull/68), `codex/photo-led-landing`, was checked before implementation. It modifies production landing components, copy, tests and six persona assets in the sibling `Stopped-Face-Assess` repository. This change does not modify that branch, import its unmeasured gallery portraits, or edit any shared landing, font, token, layout or report file. All preview-specific shell styling is scoped by the preview's CSS module and is absent on the production homepage.

Existing route targets remain `/start`, `/report/sample?v=p002`, `/about` and `/`. Scoring, report assembly, algorithms, passport fixtures, landmark data, original image bytes, schema and user data are unchanged. Only `web/app/dev/hero/*`, its focused browser check and this document are added.

## Verification and stopping point

One focused visual review at **1440 × 900** and **390 × 844**, DPR 1, light color scheme. The sole correction from that review enlarged mobile analytical labels, restored a 44 px hold target and removed the dev badge from this preview's canvas. No further art-direction rounds.

Checks:

- `npm run typecheck`
- `npx vitest run app/dev/hero/model.test.ts components/report/demo-cases.test.tsx` — provenance/fail-closed behavior and same-person sample reports.
- `NEXT_PUBLIC_USE_FIXTURE=1 npm run build`
- `BASE=http://localhost:3200 HERO_OUTPUT=/tmp/beautyai-hero-review node e2e/hero-preview.mjs` — target-size captures, same image/metric, crop alignment, first-screen CTA, actual hrefs, hold keyboard/pointer, reduced motion, overflow.

This is a development-only route for visual approval. No deployment, merge or production adaptation is part of the delivery. A draft PR must remain draft until the owner reviews the visuals.
