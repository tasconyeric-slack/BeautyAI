# S2 isolated report interaction slice

> Execute inline using superpowers:executing-plans. The user authorized implementation of the supplied ENG00 handoff; repository instructions prohibit delegation and pauses between slices.

**Goal:** Connect summary → M001/M017/M025 → selected hairstyle → copy / existing actions, at `/dev/report-r1`.

**Spec:** Supplied `P001_Report_Slice_R1_Review/ENG00_HANDOFF.md` and R1.1 brief; approved Figma file `afzB1elPOahppw4hG1UeDN`, desktop `5:2`, and the local R1.1 HTML. Repository AGENTS.md and V2.1 contracts govern.

**Architecture:** A server environment gate and a client preview host feed existing PassportResponse and registered geometry into scoped report components. Reuse adapters, MeasureStage, HoldButton, CompareView, CopyButton, Button, Radix RadioGroup and useChoices. No provider, schema, rules or production-route changes.

**Approach:** Existing primitives (MIT Radix, current React/Next/Tailwind) fit the required keyboard selection and need no dependency. Copying the fixed-width HTML would duplicate state and break responsive layout; adding an animation library is unnecessary. References: https://www.radix-ui.com/primitives/docs/components/radio-group and `docs/design/TOOLING.md`. Use scoped BA paper #F3F1EC, analysis #D7DDE0, mist #EDF0EF, ink #111417, moss #3F625E, with dark equivalents and the existing Noto Serif/Sans and JetBrains font variables.

## Constraints and review focus

- Only development or Vercel preview may reach the route. No production navigation entry.
- P001/P002 samples are read-only and disclose fictional people and absent generated previews.
- Measurement values, photo, geometry and explanation switch together. Missing / locked metrics have no invented values or lines.
- Selected tier owns parameters, steps, text copied and selected-hair action. Excluded options cannot be selected. General analysis is separate; potentially conflicting lengths must be confirmed before cutting.
- Expiry removes every photograph, preview and overlay at the deadline; text remains and recovery links to `/start`.
- Test stale selection after excluded options / response changes, missing geometry / photo, unsupported ratio definitions, partial scores, clipboard rejection, and pending tasks without results.

## Tasks

- [x] 1. Add behavior tests for switching metrics and hairstyle, exact clipboard content, read-only samples, existing choice/plan persistence, expiry and missing/error states. Run red against a minimal component stub.
- [x] 2. Add `web/app/dev/report-r1/page.tsx`, `web/components/report-slice/preview.tsx`, `report-slice.tsx`, `measurements.tsx`, `hair-section.tsx`, `model.ts`, `report-slice.module.css`, and `web/lib/copy/report-slice.ts`. Reuse the application interfaces; all new UI styles and copy stay scoped.
- [x] 3. Verify component tests green, then critical browser paths including actual clipboard, pointer/key release/cancel/blur, P002 and action-plan navigation. Inspect 1440×900 / 390×844 and widths 320/768/1024, dark and reduced motion. Save evidence outside Git because screenshots contain photo-derived content.
- [ ] 4. Run frontend typecheck, full tests and build; verify production 404. Record results in `docs/design/REPORT_S2.md`; commit and open a focused PR to main. Leave review/CI gates explicit and do not deploy.

## Execution ledger

- Baseline: latest origin/main `6e8171c`; dedicated managed worktree `report-s2-slice`, branch `codex/report-s2-slice`. PR44/43/49 ownership checked; no overlapping files planned.
- Ruling: execute the supplied approved direction without a new design approval round, as the user explicitly requested implementation and AGENTS.md disallows pauses between slices.
- Initial tests went red against the component stub. The implementation and Escape/leave fix made the critical path green; follow-up unavailable/error checks bring this slice to 23 tests.
- Final local verification: types, 365 Vitest tests + 60 module checks, default build and production HTTP 404 passed. Process-local Windows proxy configuration resolved font-fetch failures. Browser evidence and exact clipboard paste were saved outside Git; full acceptance is in `docs/design/REPORT_S2.md`.
