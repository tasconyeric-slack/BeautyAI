# Report and Studio unification · 2026-10-30

Owner-approved: preserve Hero; unify report and Studio with its cool photographic direction. No R4.1, recordings, public person IDs or synthetic-person disclaimers. Deployment authorized.

Palette: mist #d7dde0, reading paper #f1f1ee, ink #172125, teal #3f625e, portrait gray #c1c5ca. Existing Noto Serif and Inter/Noto Sans. Large photo-led report cover; personal summary before evidence; selected measurements highlight corresponding real overlays. Light photographic Studio stage with dark focused controls. Compact sticky photo on mobile.

References: supplied QOVES screenshots and https://www.qoves.com/ for portrait scale; https://thefacereport.com/sample-report for summary, evidence, styling and plan. No borrowed assets/code. Reuse React/Radix/CSS Modules rather than new animation dependencies or a separate report engine: no added license, runtime or hosting cost.

- [x] Recompose shared report, sample navigation and expandable measurement detail; preserve seven chapters, values, anchors, free/expired states and PDF.
- [x] Refine real Studio proportions, selections, save and plan handoff; preserve generation/composition/storage behavior.
- [x] Remove requested presentation copy from home/report/PDF; preserve internal provenance and truthful generation states.
- [x] Existing tests, typecheck, production build, lint; desktop/mobile browser interaction and static visual inspection.
- [ ] Focused PR, CI/current-head Codex gate and deployment to configured beauty_test project.


## Validation

- Existing 56 Vitest files / 394 tests and 60 module tests passed; TypeScript, default Turbopack production build, Ruff and diff checks passed.
- 1440x1000 and 390x844 browser journeys: consent, framing/QC, report, Studio tools, saving, reload restoration, action completion, restored looks, fake checkout, fixture generation and read-only public report. No browser page errors or horizontal overflow.
- Inspected public report covers, measured detail and actual Studio layout; corrected mobile heading wrapping and added an accessible mobile save action above bottom navigation.
- Evidence stays outside Git under the current chat visualizations/site-review. Static screenshots only, no recordings or provider calls. Fixture evidence verifies interaction, not new real-provider quality.
