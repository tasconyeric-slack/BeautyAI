# DS-03 acceptance / ENG-02 execution

Base: origin/main `84248a6` (ENG-01 PR #50 merged). Owner: Codex, branch `codex/report-s2-full`.

## Accepted design

Local `P001_Full_Report_R2`: seven chapters, shared P001/P002 renderer, front/side source photos, editable current hairstyle and separate analysis wording. Desktop 1440 and mobile 390 are presentation references, not a new data contract. Local captures are kept outside Git. Minor visual and copy gaps are resolved in implementation.

## Plan and ledger

1. [x] Inspect ownership, PRs, existing report/slice/measure/plan/Studio and installed Next docs.
2. [x] Accept DS-03 content and visual direction; retain analysis/CV disagreement with explicit provenance.
3. [x] Extend the existing full report in an isolated development entry. Reuse adapters and slice interactions.
4. [x] Compare P001/P002 and state transitions, then connect the existing sample and passport entries.
5. [x] Run typecheck, frontend tests and build; exercise responsive, copy/paste, persistence and expiry paths.
6. [ ] Focused PR to main; CI and Codex review must reference the final head.

## Scope

Local report tokens only. No schema, provider, payment, auth, retention, homepage design, upload or deployment changes. Public examples never instantiate persistence or request previews. No placeholder preview task is treated as active generation. The global writable fixture shortcut was removed and the legacy `/sample` redirect now resolves to `/report/sample` to keep public examples read-only.

## Verification evidence

Validated on 2026-10-28 in the dedicated worktree:

- `npm run typecheck`: passed.
- `npm test`: 51 Vitest files / 379 tests, plus 60 existing module tests; all passed.
- `NEXT_PUBLIC_USE_FIXTURE=1 npm run build`: passed. Fresh production-browser P001/P002 desktop/mobile checks produced no warning/error console logs.
- 1440x900 and 390x844 checked against R2. 320/768/1024 had no horizontal overflow. Mobile chapter order, long Chinese copy, scoped dark colors and visible keyboard focus checked.
- Current hairstyle brief copied through the actual browser UI and pasted into native Notepad. Fixture save was read consistently by the existing plan page, including selected name, steps, maintenance and Studio link.
- Missing geometry/view, limited/unavailable scores, unverified definitions, matching pending/failed tasks and failed result images checked. A live five-second expiry removed all eight media images and all measurement overlays while keeping text and recovery links.
- Public sample had no writable passport routes or review panel. P002 side measurements used its own profile90 photo and matching geometry.

Current-run screenshots and logs are outside Git under `.codex/visualizations/2026/10/28/01a1832f-e770-7a22-87d3-99a2f795b189/r2/` (in the user's profile). `21`-`26` are final production captures; `npm-test.log`, `build.log` and `responsive.json` record execution evidence.

## Integration and reuse

`/dev/report-r2` is the gated isolated QA entry. `/report/sample` and `/p/[id]/report` use the same full-report engine. It keeps the existing adapters, geometry loader, tier controls, hold-to-compare, clipboard helper, choice persistence, plan engine and Studio routes. Region measurement expansion makes remaining measured rows reachable; side rows select their own source view. Analysis wording remains immutable and is labelled separately from CV measurements, rules and the user's current hairstyle choice.

Local report colors map paper/ink/field/moss/stage into a CSS module, with a scoped dark override. Public token promotion remains separate. Layout uses the existing seven chapters, with the R2 mobile sequence. Motion is limited to existing controls and reduced-motion-aware navigation; broader motion work remains S5.

## Remaining gates and limits

CI and Codex review must complete on the PR's final head; submission alone is not approval. Apply `manual-review`: media-expiry presentation affects a privacy boundary, and the public sample redirect changes `next.config.ts`. Repository policy therefore requires a human squash merge after the gates pass.

This is S2 on fixtures and the read-only P001/P002 samples. No live model call, payment, deployment or server retention change was made. Figma's imported-frame componentization was reported by the design handoff and is not re-certified here; the accepted implementation reference is the supplied local R2 artifact.

Next is S3: integrate and verify the existing upload/QC -> analysis -> report -> Studio -> plan journey, resolving real failures through the existing contracts. Upload/QC teaching assets must match `config/qc.yaml`; hair candidates require same-base asset QA before replacement. Homepage expansion is S4 and broader motion/accessibility polish S5.
