# Production homepage visual review

Captured from the optimized production build in Chromium, not the development route. All subjects are the already approved synthetic sample portraits. On short phones the Hero intentionally extends beyond the first viewport to keep the headline, face and CTA separated.

| Viewport | Hero viewport / complete composition | Analysis after selecting hair | Complete third section |
|---|---|---|---|
| 1440 × 900 | [Viewport](hero-1440x900.png) · [Complete](hero-complete-1440x900.png) | [Analysis](analysis-1440x900.png) | [Decisions](choices-complete-1440x900.png) |
| 320 × 568 | [Viewport](hero-320x568.png) · [Complete](hero-complete-320x568.png) | [Analysis](analysis-320x568.png) | [Decisions](choices-complete-320x568.png) |
| 375 × 667 | [Viewport](hero-375x667.png) · [Complete](hero-complete-375x667.png) | [Analysis](analysis-375x667.png) | [Decisions](choices-complete-375x667.png) |
| 390 × 844 | [Viewport](hero-390x844.png) · [Complete](hero-complete-390x844.png) | [Analysis](analysis-390x844.png) | [Decisions](choices-complete-390x844.png) |
| 430 × 932 | [Viewport](hero-430x932.png) · [Complete](hero-complete-430x932.png) | [Analysis](analysis-430x932.png) | [Decisions](choices-complete-430x932.png) |

Mobile touch switching, hidden annotations, reduced motion, `/start`, both sample reports and `/t/hair` were exercised. `/dev/home` remains a production 404. The SVG/photo boxes register with **0 px drift** at all five sizes; no horizontal overflow or browser exceptions occurred. [Mobile geometry/QA measurements](visual-qa.json).

Additional desktop states: [Brows](decision-brows-desktop.png) · [Eyewear](decision-eyewear-desktop.png). [Final built-page registration/annotation/bundle smoke check](final-smoke.json) confirms no full fixtures in the initially loaded client scripts.
