# Report / Studio unification

User direction: use the complete report visual language throughout; simplify the product to Report and Studio. This amends V2.1 section 0's four-area navigation without removing capabilities.

## Decision and alternatives
Keep existing Next.js routes, Radix controls and CSS modules. A color-only patch leaves three competing navigation models; a route rewrite risks existing report links and saved looks. Choose shared tokens and two primary areas, retaining details as report tools. No new dependency or external design system is needed.

Report contains conclusions, evidence (face/color/style/detail), recommendations and the action checklist. Studio contains hair/color/makeup/eyewear and saved looks/comparison. Settings, supplementary inputs and export remain utility actions. Completion opens the full report; there is no second profile landing page. All pages use current main's shared brand tokens, warm reading surfaces and restrained green accent; production explicitly uses the same light theme regardless of operating-system dark mode (the existing homepage/report art direction is light). The photographic stage stays neutral; actual swatches and image rendering are unchanged.

## Implementation
- [x] Share two primary-area definitions between desktop and mobile; keep detail routes and next-action bridges.
- [x] Open FullReport at the completed legacy root; keep QC, progress and topic-entry behavior.
- [x] Use report tokens in application, report and Studio; remove Studio dark panel overrides and normalize return-link vocabulary.
- [x] Validate route highlighting, complete/incomplete states, existing Studio behavior, web suite and typecheck. Inspect browser if available; record capture limitations honestly.

## Evidence and constraints
Updated the existing PR #73 branch against origin/main `3b3c992`, after reading the PR review. Retained main's design tokens unchanged, current CSS modules, overlapping page layouts, Studio logic and mobile safe-area handling. Preserved #74's Ridge inference and reference-ranking fixes without backend changes. Removed the duplicate Studio wrapper introduced by the automatic merge; applied only D44 navigation, terminology and token-based light controls.

## Validation on the integrated branch
- Web Vitest: 426 tests passed across 61 files, including completed-root rendering, progress/topic-entry behavior, detail-route ownership, paid controls and existing Studio behavior. Updated Color's link-copy assertions to the approved Studio terminology.
- Module suites (Chinese copy, tint pixel boundaries, share cards, design-system rendering), TypeScript typecheck, production build and `git diff --check` passed.
- `BASE_URL=http://localhost:3028 node scripts/report-studio.smoke.mjs` (from web): one synthetic fixture smoke run at 1280/375 under OS dark preference. Passed report completion, report-to-Studio links, detail ownership, two-destination navigation, light shared-token surfaces, Studio tabs and controls, saved-look persistence/reopening through the action plan, no browser runtime errors and no horizontal overflow.
- Inspected desktop/mobile report and Studio screenshots in the workspace's `work/report-studio-qa`. No model calls, uploaded photographs or production data changes; synthetic illustrations validate layout and function, not photographic realism.
