# Report / Studio unification

User direction: use the complete report visual language throughout; simplify the product to Report and Studio. This amends V2.1 section 0's four-area navigation without removing capabilities.

## Decision and alternatives
Keep existing Next.js routes, Radix controls and CSS modules. A color-only patch leaves three competing navigation models; a route rewrite risks existing report links and saved looks. Choose shared tokens and two primary areas, retaining details as report tools. No new dependency or external design system is needed.

Report contains conclusions, evidence (face/color/style/detail), recommendations and the action checklist. Studio contains hair/color/makeup/eyewear and saved looks/comparison. Settings, supplementary inputs and export remain utility actions. Completion opens the full report; there is no second profile landing page. All pages use the report's pale gray/blue reading surfaces and forest accent; production explicitly uses the same light theme regardless of operating-system dark mode (the existing homepage/report art direction is light). The photographic stage stays neutral; actual swatches and image rendering are unchanged.

## Implementation
- [x] Share two primary-area definitions between desktop and mobile; keep detail routes and next-action bridges.
- [x] Open FullReport at the completed legacy root; keep QC, progress and topic-entry behavior.
- [x] Use report tokens in application, report and Studio; remove Studio dark panel overrides and normalize return-link vocabulary.
- [x] Validate route highlighting, complete/incomplete states, existing Studio behavior, web suite and typecheck. Inspect browser if available; record capture limitations honestly.

## Evidence and constraints
Inspected origin/main d538ff2, open PRs #44/#49/#55/#56, V2.1 and existing shared components. Separate worktree avoids those branches. Live existing Studio accessibility tree confirms six desktop entries and duplicated report/plan links. Its current report has a server-missing banner; do not reload, upload photos or trigger generation. In-app browser timed out and native screenshot capture failed, so source inspection is not claimed as a screenshot audit. No backend, schema, scoring, entitlements, retention, provider calls or deployment changes.

## Validation
- Web Vitest: 417 tests passed, including completed-root rendering, in-progress/topic-entry behavior, and desktop/mobile parent selection across all detail routes.
- Module suites (Chinese copy, tint pixel boundaries, share cards, design-system rendering) passed; TypeScript and production build passed. Python ruff clean (no Python changes).
- `node web/scripts/report-studio.smoke.mjs` (run from web with BASE_URL): tested synthetic fx fixture at 1280/375, under OS dark preference; same two destinations, correct active parent, light reading background, pale Studio controls, functional makeup tab, no horizontal overflow. No model calls or uploaded photos. Screenshots in ignored runs/report-studio-qa; inspected report, Studio desktop/mobile and face detail.
- Live screenshot capture unavailable; current online Studio accessibility state was inspected without refreshing the user's existing report. Local fixture screenshots validate layout/function, not actual photographic realism or online deployment.
