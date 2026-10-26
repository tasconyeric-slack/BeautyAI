# Issue 36 — final homepage direction

Implementation continues Draft PR #32 on `claude/pensive-curie-ojf37l`, from the approved Issue #35 commit `871c69d`. The supplied Issue #36 brief governs; no alternate homepage branch, subject replacement or exploratory gallery.

## What changed

- The signature control contains 正脸 / 侧脸 and its existing pause/resume/replay affordance. Source-photo/metric-count copy is removed. Desktop buttons now have the same 44px target height as mobile. The approved headline, choreography, photos, view controls, keyboard/live announcements and reduced-motion behavior are retained.
- Analysis is a cool-stone editorial study: larger portrait context, restrained feature-directed camera, measured annotations, prominent selected reading and a clear observation → interpretation → advice sequence. The same report-backed rule advice leads; longer model consultation detail is available in a native disclosure. The color palette retains its report's lighting caveat. No reference ranges, beauty scores or invented metrics were added.
- Styling is the facing consultation spread: notes on the left and Person-001 portrait on the right on desktop; photo then tabs on mobile. The selected measurement, interpretation and actionable recommendation have distinct type roles. Active tabs use a quieter green rule and transition; all original arrows/Home/End semantics remain.
- Shared section indices, thin rules, serif headings, cool ink and portrait treatment connect the sections. The light field opens from the Hero's gray and softens toward the decision section. The mobile analysis portrait stays at 32svh (180–280px) with a 48px caption, leaving reading space at 320×568.
- Public Chinese copy describes the analysis and decisions. Repeated internal labels are removed. AI sample disclosure is visible beside mobile Hero controls and near subsequent example imagery; methodology/privacy links remain accessible. The pending hair preview remains disclosed.

## Asset integrity

See [display catalog and usage boundaries](demo-display-assets.md). All 12 approved WebPs are copied byte-for-byte, RGB, 960×1200, 1,194,700 bytes total. No new portraits are fetched on the homepage. Measurement JPEGs, passports, provenance and geometry are unchanged. No eyewear rematte is published.

## References and trade-off

The repository's approved [QOVES observations](REFERENCE.md) and [MIT implementation scan](SOURCES.md), plus supplied desktop/mobile reference sheets, informed portrait-led proof, mobile recomposition and progressive disclosure. Existing React/SVG/CSS provide the needed behavior. No new dependency, external artwork/font, borrowed proprietary code, scroll interception or extra animation framework.

## Evidence and verification

One substantive visual implementation pass and one targeted correction pass. The latter restores the approved 48px tablet Hero gutter and makes the mobile AI sample note visible. A fresh read-only code reviewer found no actionable P0/P1/P2 in this issue's diff. Final owner aesthetic approval remains pending.

[Final desktop/mobile and boundary captures](../screenshots/home-production/final/README.md). Existing [Issue #35 motion clips](../screenshots/home-production/signature/README.md) are preserved byte-for-byte. Screenshot harness: `web/e2e/home-final.mjs` against `next start` after the production build; all images decode before full-page capture. Static screenshots fast-forward finite CSS animations to avoid off-screen compositor artifacts; normal-motion autoplay/view switching is exercised before capture, and reduced motion is checked separately.

No product/schema/model changes, deployment, automatic merge or ready-for-review action are included.
