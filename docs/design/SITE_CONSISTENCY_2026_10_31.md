# Site consistency audit — 2026-10-31

Baseline: `origin/main@8a95239`. This audit uses the integrated product, not the older isolated design previews in PRs #55/#56.

## Current conclusion

The primary homepage → upload → report → Studio → plan journey is integrated, but visual and interaction consistency is not complete across the whole site. The shared `--ap-*` system coexists with newer photographic report/journey styles and older narrow reading layouts. Passing a route or fixture journey does not establish aesthetic approval or live-provider quality.

| Surface | Existing implementation | Remaining work |
| --- | --- | --- |
| Homepage, topic entry | R3.1 photographic reading and existing entry tracking | Retain the approved composition; verify motion across device/input preferences when changed |
| Upload, framing, QC | Shared journey surface and reusable teaching assets | Real-photo QC acceptance is separate from fixture UI acceptance |
| Personal report, public sample | Photographic cover, findings, actionable hair selection, export | Keep honest measured/unavailable states and public sample read-only behavior |
| Personal Studio, comparison | One composited portrait, category tabs, explicit generation/save, saved-look restore | Real-image generation and identity/hairstyle quality still require provider acceptance |
| Action plan | Shared journey treatment, saved options, progress, report handoff | Preserve refresh/restore continuity |
| Advice, color, glasses, makeup, outfit | Functional shared primitives, but older narrow layouts and 14/16px rounded panels | Bring reading hierarchy, gutters, surfaces and headings into the report/Studio visual language |
| Face, style, detail | Existing evidence and explanation views | Maintain evidence clarity while aligning layout; respect reduced motion for navigation |
| More, share, unlock, settings | Existing local-preference/share/entitlement boundaries | Align dialog mechanics and keyboard/touch access without changing contracts |
| About, check | Existing informational page / explicitly coming-soon check page | Align secondary-page layout; `/check` is not a completed outfit-check flow |

## Changes in this slice

- Reuse the existing Sheet for settings and adjustment dialogs, with a common focus lifecycle and 44px close target.
- Extend reduced-motion coverage to Tailwind utility animations/transitions and face-view scrolling; stop hold-to-compare when the window or document loses attention.
- Extend the existing production-browser fixture journey with route status/overflow evidence, settings keyboard focus checks, reduced-motion computed styles, and readable expanded disclosure content.

No new UI framework, provider, schema, payment logic or storage/retention mechanism is introduced.

## Next work, in order

1. **Token and reading-page convergence:** resolve the existing blue `--ap-primary: #1f4e5f` and newer moss-green `#3f6259` / `#3f625e` styles, then migrate advice and its detail pages using one shared reading layout. Keep portrait pixels neutral.
2. **Color interaction consolidation:** the color page still embeds a full DrapeStage alongside explanation. V2.1 places interactive draping in Studio; converge on explanation + a parameter-preserving Studio entry, with parity/keyboard checks before removing duplicate controls.
3. **State acceptance:** extend the browser matrix to offline/request failure, failed or undecodable generated images, missing measurement views, expired media, and constrained local storage. Unit fixtures already cover several of these but cannot replace real browser/state acceptance. The existing adjustment-panel apply failure still needs explicit inline feedback and recovery; this slice preserves that behavior.
4. **Release acceptance:** verify the live provider and report/media persistence separately, then obtain the repository-required deployment approval. This audit does not deploy infrastructure or claim live-provider reliability.

## Verification and evidence

The initial unmodified production fixture build passed the existing `web/scripts/s3-journey.mjs` on 1440×1000 and 390×844: upload → crop/QC → same-id report → choose/save hair → Studio categories/save → plan completion/reload/restore → simulated checkout → fixture generation → read-only sample. Both runs had zero browser `pageerror` events.

Final verification on the rebuilt fixture production server also passed:

- `npm run typecheck`, fixture `npm run build`, and `python -m ruff check src tests scripts` passed (lead-agent verification).
- `npm test`: 58 Vitest files / 405 tests plus 60 module tests passed (lead-agent verification).
- The extended production-browser harness passed at both sizes with zero `pageerror` events. Fourteen personal routes per viewport returned HTTP 200 with no horizontal overflow. Settings focus entered the dialog, cycled in both directions and returned on Escape; changing adjustment drafts then dismissing/reopening preserved the original value; all adjustment buttons measured at least 44px high.
- Reduced-motion probes measured spin/pulse animation durations of `0.00001s` (0.01ms), transition duration `0s`, and confirmed readable expanded disclosure content.

Evidence is kept outside Git under the current chat's `site-consistency` visualization directory: `journey.json`, `{desktop,mobile}-routes.json`, `{desktop,mobile}-interaction.json` and viewport screenshots. The motion utility probe checks actual compiled production CSS on disposable DOM elements. The disclosure check uses Studio's native `details`; `components/ui/accordion.tsx` has no current production consumer, so this run makes no claim of exercising that unused component.

The implementation reuses the repository's existing CSS, React Sheet and comparison control. Its behavior follows [W3C C39: prefers-reduced-motion](https://www.w3.org/WAI/WCAG22/Techniques/css/C39) and the [WAI-ARIA modal-dialog keyboard pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). These references define behavior; no external UI library or proprietary design code was copied.

Fixture generation and simulated checkout make no real provider calls or charges. Synthetic portrait input verifies the UI pipeline only, not actual CV quality or photorealistic generation.
