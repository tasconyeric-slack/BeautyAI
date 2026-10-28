# S2 report interaction slice

The ENG-00 handoff and R1.1 design are implemented at `/dev/report-r1`. This is an isolated review route: development and Vercel preview builds allow it; production returns 404. Production report navigation is unchanged.

Run `cd web` and `NEXT_PUBLIC_USE_FIXTURE=1 npm run dev`, then open the route. The review panel switches P001/P002, the actionable fictional passport, unavailable states and local light/dark colors. All state demonstrations clone existing responses and stay within this host.

## Behavior and reuse

- Summary reads the existing score and rank adapters. Partial/unavailable scores show no full number. Overall rank and each ratio's verified definition stay independent. A shortened direction heading retains the complete original direction in calculation details.
- M001/M017/M025 reuse `measureView`, `metricRole`, `metricOverlay`, `display`, `missingText` and `MeasureStage`. Values, explanations and native geometry switch together. No coordinates are copied from design files. Unavailable or locked values have no invented overlay; missing photos link to `/start`.
- A single selected, eligible hair tier supplies the name, parameters, maintenance, barber script, copied brief and Studio target. Radix RadioGroup handles keyboard/focus and excludes unavailable choices. Generic ranked recommendations remain explicitly separate from the current script because their length statements can conflict.
- Samples stay read-only, instantiate no choices hook, and never promise a generation queue. The actionable fictional passport uses existing `useChoices`, `chooseHair` and recommendation `setPlan` IDs; its existing plan page reads both saved records.
- `CopyButton` and `CompareView` are reused. A comparison requires the selected tier's successful task and both image URLs; image errors remove the unusable comparison. Pending/failed messages describe only the matching task. No model calls occur in this slice.
- The media deadline removes every image and overlay without polling, while text remains. Visibility/focus rechecks cover returning to an inactive tab. Missing and expired photos have distinct messages. No photos, screenshots or new media persistence are added to Git.
- The only shared component change adds pointer-leave and Escape cancellation to `useHold`. Release, cancellation, lost capture, blur and keyboard release continue to restore overlays.

## Design boundary

BA colors and dark counterparts live in the slice CSS module and map to existing DS aliases. Existing Noto Serif/Sans and JetBrains variables are reused. Desktop orders summary → measurement → advice; mobile presents advice before measurement evidence. New controls have at least 44px touch targets. Reduced-motion styles disable inherited transitions and animations within the slice.

The existing application primitives fit the interaction without another dependency. Fixed-width HTML would duplicate state and coordinates; an animation library adds no value to this slice. Sources: [Radix RadioGroup](https://www.radix-ui.com/primitives/docs/components/radio-group), [approved Figma desktop](https://www.figma.com/design/afzB1elPOahppw4hG1UeDN?node-id=5-2), and [repository tooling](TOOLING.md).

P001 currently measures M001 **1.21**, M017 **29%**, M025 **1.08**. The older design value 1.02 is not substituted into the report. Immutable analysis and derived contracts are unchanged.

## Acceptance — 2026-10-28

| Check | Evidence |
|---|---|
| Frontend types | `npm run typecheck` passed |
| Full tests | `npm test`: 49 Vitest files / 365 tests, plus 60 module checks passed |
| Slice contracts | 18 behavior tests plus 5 environment-gate tests; includes exact copied content, rejection, stale excluded selection, missing geometry/photo, limited/unavailable score, independent rank/ratio, failed image and task states |
| Production build | Default `npm run build` passed, including TypeScript and prerendering |
| Production gate | Built server with production environment: `/dev/report-r1` returned HTTP 404 |
| Browser summary and measurements | P001 and P002 render their own source data; M001 → M017 → M025 switches value, label, explanation and overlay |
| Browser copy | Clicked Copy for both safe/easy, pasted into a temporary local textarea and inspected full output. Easy contains its straight-hair steps and parameters, without safe's collarbone or C-curl instructions. Temporary probe removed |
| Browser actions | Fictional passport: selected easy → saved → existing `/p/ap_sample_0001/plan`; original recommendation shows saved and “我选定的” shows easy / 层次长发·侧分刘海 |
| Keyboard and cancellation | Browser native arrow keys select eligible tiers; disabled tier skipped. Tests assert holding hides the overlay and Escape / leave / release / cancel / window blur restore it |
| Responsive | 1440×900 and 390×844 visually inspected; 320/768/1024/1440 DOM widths show no horizontal overflow; mobile advice precedes measurement; inspected controls ≥44px |
| State review | Browser checked missing geometry, needs-photo, limited/unavailable scores, pending/failed tasks, expired media and automatic five-second expiry (2 images → 0; overlays → 0; numbers and `/start` recovery retained) |
| Dark / motion | Scoped dark colors visually inspected on mobile advice and desktop measurement. Reduced-motion CSS inspected; OS preference was not changed |

On this Windows host, Next's font fetch initially bypassed the system proxy and failed. The successful default build used the already-configured Windows proxy as process-local `HTTP_PROXY`/`HTTPS_PROXY`; no app, font, dependency or TLS changes were needed.

Browser evidence is kept outside Git in the Codex visualization artifact folder for this chat (`report-s2/`): desktop summary/P002/measurement, mobile summary/action/dark, expired state and actual clipboard paste. Screenshots are shared locally with the review, not uploaded to a third-party image host.

No backend, schema, config, prompt, provider or production route was changed. No deployment was performed. CI and Codex review must evaluate the current PR head before the repository's merge gate can pass.
