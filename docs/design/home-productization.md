# Approved homepage → production

The canonical repository is tasconyeric-slack/BeautyAI; draft PR #32 remains the review gate. `/` now renders the approved portrait Hero, curated analysis and one Person-001 editorial decision section. `/dev/home` shares those components in development and stays a production 404. No alternate repository or deployment source is used.

The approved Hero, overlay primitives and camera are preserved in `web/components/home/`. Topic pages retain their existing Landing and topic/ref behavior. Funnel tracking keeps the same event payload/endpoint but has a narrow dependency so it does not load the complete fixture backend. Homepage start/report links disable automatic prefetch, keeping their report/upload bundles out until opened; the final browser check confirms full fixture JSON is absent from the initial client scripts. Privacy text uses the existing shared source.

## Curated evidence

Person-002 keeps his original photo and landmarks. The homepage selects three findings aligned with `user_context.optimize_focus`:

- **Eyewear — M001, 1.19:** shorter/broader proportions → width no greater than cheekbones, shallower frames; model action r3 specifies thin metal rectangular/half-rim eyewear.
- **Hair — M017, 26%:** shorter upper third → exposed forehead/back-swept hair and modest crown volume; original r1 gives 6–9 mm sides, 5–7 cm top and 7:3 part.
- **Near-face wardrobe colors — M139, b* 15:** measured cheek sampling locations are shown, while observations o12/o13, model r4 and its explanation supply the palette. The b* measurement does not independently assign clothing colors. Original model swatches and lighting caveat remain visible.

Person-001's section switches among M017 **29%** (hair), M033 **1.35** (brows) and M001 **1.21** (eyewear). All observations, interpretations, selected rule advice and linked model actions are read from her report. Eyewear guidance stays proportion based; no unsupported millimeter fit guarantee is introduced. The camera transforms each image and its native-coordinate SVG together. No new landmarks, metrics, report outputs or schema changes are made.

The original reports remain intact. Missing insight/recommendation/overlay elements are omitted; unusable optional portrait geometry omits the third section. If the primary sample is unavailable, the existing landing remains usable.

## Responsive behavior and validation

Mobile Hero positioning now uses the actual section height instead of mixing viewport height with a larger minimum. The approved composition is retained; short phones scroll to the CTA. The analysis portrait uses 34svh (180–320 px) so sticky content leaves room to read. Decision tabs have 48 px touch targets, arrow/Home/End keyboard navigation and an annotation toggle. Motion respects reduced-motion preferences.

See [the desktop/mobile capture index](../screenshots/home-production/README.md) and the reproducible `web/e2e/home-preview.mjs` runner. Tests cover evidence selection, missing geometry, report immutability, decision switching and tracking semantics. Final validation: 30 focused tests, all 336 Vitest tests (20-second per-test allowance on this worker), all 60 module tests, typecheck and production build passed. The initial default 5-second budget timed out in existing combined-makeup safety and eye-preset-composition tests; their assertions pass with the longer invocation allowance, without changing test configuration or compositor code.

## Remaining limits

Hair previews are pending in the actual samples. The homepage explicitly presents original portraits and written recommendations; it shows no generated try-on or before/after. Single-photo color advice carries the report's original uncalibrated-lighting caveat.

Reference/reuse: the approved [QOVES research](REFERENCE.md) and [MIT reference scan](SOURCES.md) already establish the visual/product pattern. This implementation uses original React/CSS and existing SVG primitives; no new dependency, proprietary code or external asset is copied.
