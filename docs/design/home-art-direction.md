# Homepage art direction — approved baseline

**Productized in draft PR #32:** `/` now uses these approved components plus the Person-001 decision section. See [productization notes](home-productization.md) and [screenshots](../screenshots/home-production/README.md). The notes below record the original approved baseline.

Development route **`/dev/home`** (404 in production). Run `cd web && NEXT_PUBLIC_USE_FIXTURE=1 npm run dev`.
The original proof of concept did not touch the production homepage, shared layout, tokens or report code. Separate from draft
[tasconyeric-slack/BeautyAI#31](https://github.com/tasconyeric-slack/BeautyAI/pull/31) (`/dev/hero`), which it supersedes as a direction.
The PR #68 named in the brief lives in the sibling `Stopped-Face-Assess` repo, outside this repo; nothing here imports
from or overlaps with it.

## Direction: portrait as environment

- **Field = backdrop.** Person-002's studio backdrop samples at `#c0c4ca`, nearly QOVES's own blue-gray. The page
  field uses that tone and the photo's edges are feathered, so the portrait has no frame and becomes the space the type
  sits in. This replaces the 30/40/30 three-panel dashboard.
- **Type on the subject's eye line.** The headline sits above, and the lead + action below, a hairline at the measured
  iris height (`geometry.points.iris_l/r`). The rule stops at the outer eye corner. Typography and photograph share one
  axis instead of sitting in neighbouring boxes.
- **Analysis drawn like a technical drawing, without numbers.** The CV face contour draws in slowly. Cheek width
  (M001 segment) is drawn in place. Face length (forehead top → chin, the same two heights) is drawn as an offset
  dimension line beside the face, not as a crosshair through the nose.
- **Mobile is its own composition.** The headline and lead sit in the backdrop above the hair, and nothing crosses the
  face. The action rests on the subject's dark sweater (light pill on black).
- **Section 2 shifts tone to a dark gallery stage.** A "camera" moves to whichever feature the open chapter measures:
  motion that carries information. Each chapter discloses **观察 → 解读 → 建议** verbatim from
  `derived.measurement_insights` (M001 轮廓, M017 三庭, M033 眉眼, M006 下颌); values use the report's own `display()`.
- **Type:** Noto Serif SC 600 display / 500 section titles and advice, Inter + Noto Sans SC body, JetBrains Mono for
  values only. Explicit Chinese line breaks; no Latin tracking on CJK. One restrained accent (champagne) marks the
  guidance tier only.

## Honesty and data

The landmarks, values and sentences all come from person-002's checked-in pipeline sample (passport + geometry of the
same photo). The model fails closed: if the image size disagrees with the geometry, or a metric, insight or overlay
point is missing, that element is dropped (`model.test.ts`). The hero shows no score, statistics, persona ID or
fictional-person label. The analysis section's footnote says the subject is AI-synthesized and that proportions are a
clue, not a beauty standard. No invented users, testimonials or claims.

## Asset limitations

- Only two approved portraits exist. Both are standardized, evenly lit, chest-up frontal ID-style photos: good for
  measurement, limited as editorial images (no directional light, no styling, no 3/4 view). The composition gets its
  drama from scale, crop, tone-matching and type, not from the photograph itself.
- Person-001's backdrop (neutral `#aaaaab`) is flatter and darker; it would need its own field tone. It was not used in
  this pass, to keep one subject per screen (never mixing one portrait with another's data).
- The subject is male, and some report advice concerns makeup/brows (M033). It is shown verbatim because it is the
  report's real output. A future editorial shoot (same person, directional light, one 3/4 view) would lift the hero
  most.

## Verification

`web/e2e/home-preview.mjs` captures 1440×900 and 390×844 (DPR 2). It checks SVG↔image registration (0 px drift on
both plates), no horizontal overflow, that the camera moves on chapter change, and reduced-motion rendering.
