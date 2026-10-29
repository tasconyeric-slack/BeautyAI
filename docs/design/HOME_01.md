# HOME-01 — after the approved Hero

Scope: the owner's 2026-10-28 instruction authorizes homepage integration after S3 / PR #52. Keep Hero and signature untouched. Extend the existing Next/React architecture; no dependency, model, schema, payment or storage change.

PR #44 audit: its draft uses the same `home/model`, `MetricLines`, `useSize` and Hero as production. Its Intelligence duplicates Analysis with a two-person switch; Transformation duplicates the report-backed hair direction with ranked/excluded options. Reuse the shared implementation and production Analysis/Choices instead of importing a parallel homepage. Preserve original portraits, per-photo overlays and unavailable-preview disclosure. Matched after-images remain #39's asset gate.

Design: retain the portrait-led cool Hero/measurement spread, transition to S3 paper #f2f1eb / ink #171b19 / moss #3f6259 for the product handoff. Use existing Noto Serif display / sans body fonts. Wide report contents, compact Studio capability spread, then an actual three-step upload journey and reusable PhotoGuide. Mobile stacks in reading order. No scroll-triggered reveal or new animation runtime.

Implementation plan (inline execution; no delegation):
- [x] Add report chapter links from `report-model` and shared copy; all links target the public R2 sample.
- [x] Add a Studio handoff using existing palette/Stage components and report-backed colors, with explicit preview limits and a real /start CTA. Public samples remain read-only.
- [x] Embed S3 PhotoGuide; add method/privacy FAQ and final /start CTA.
- [x] Keep Hero intact; respect reduced motion across embedded content, keyboard focus and responsive layouts.
- [x] Run web tests/typecheck/fixture production build, browser home → report / start → QC → report → Studio → plan acceptance, desktop/mobile/reduced motion captures. Open a focused PR and inspect CI/review.

Alternatives: importing all five #44 files would duplicate production components; replacing the homepage with a new twelve-section system would exceed this task. Existing report / Studio / QC UI and installed primitives have no added license or deployment cost. Reference: https://github.com/tasconyeric-slack/BeautyAI/pull/44 and https://github.com/tasconyeric-slack/BeautyAI/pull/52.

Production deployment: the owner has conditionally authorized it. Only release a reviewed, CI-green integrated head through the configured production project; an open/unreviewed PR is not a release candidate.


## Acceptance (2026-10-28)

- 55 Vitest files / 396 tests and 60 module tests passed; TypeScript and fixture production build passed. Ruff clean (`python -m ruff check src tests scripts`; make unavailable on this Windows host). No src/schema/config changes.
- Production browser HOME acceptance passed at 1440x1000, 1024x768, 390x844 and 320x568 (reduced motion): no clipped controls, horizontal overflow or page errors; all seven chapter targets exist, PhotoGuide keyboard operation and FAQ work, final CTA opens consent. Reduced motion disables embedded guide animation and keeps Hero front-facing until user action.
- Existing S3 acceptance passed at desktop/mobile: upload/crop/QC fixture → R2 → Studio tabs → save → plan completion → reload/restore → fake checkout → fixture generation → read-only public sample. No live provider/payment claims.
- Inspected desktop Studio, mobile report and QC screenshots. Hero/signature, overlays and processing/retention code unchanged.
- Evidence outside Git: `%TEMP%/beautyai-home01/` and `%TEMP%/beautyai-home01-s3/`. Reproduce via `web/scripts/home-01.mjs` and existing `web/scripts/s3-journey.mjs`.
