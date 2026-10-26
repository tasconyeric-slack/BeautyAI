# Issue 36 — final homepage visual review

Actual Chromium captures of `NEXT_PUBLIC_USE_FIXTURE=1 npm run build` → `next start`. One substantive visual pass and one targeted correction pass; final owner visual approval is pending.

| Evidence | Desktop 1440×900 | Mobile 390×844 |
|---|---|---|
| Complete homepage | [Full desktop](homepage-1440x900.png) | [Full mobile](homepage-390x844.png) |
| Hero and final view control | [Desktop](hero-1440.png) | [Mobile](hero-390.png) |
| Analysis | [Desktop](analysis-1440.png) | [Mobile](analysis-390.png) |
| Styling decisions | [Desktop](decisions-1440.png) | [Mobile](decisions-390.png) |
| Hero → analysis | [Desktop boundary](hero-analysis-1440.png) | [Mobile boundary](hero-analysis-390.png) |
| Analysis → styling | [Desktop boundary](analysis-decisions-1440.png) | [Mobile boundary](analysis-decisions-390.png) |

Additional complete captures: [320×568 compact](homepage-320x568.png), [1024×768 tablet](homepage-1024x768.png), [800×1000 tablet](homepage-800x1000.png).

[Browser QA data](qa.json) covers 1440×900, 1024×768, 800×1000, 390×844, 320×568 and breakpoint neighbors 760/761, 1100/1101. No horizontal overflow, clipped section headings/controls or browser exceptions. Photo/SVG registration drift is 0px on all checked plates. View controls, keyboard/touch chapter and tab changes, annotations, reduced motion, both sample reports, upload, methodology/privacy and topic navigation pass. `/dev/home` remains a production 404.

Reproduce from `web/` after build/start:

```sh
CHROMIUM=/usr/bin/chromium OUT=../docs/screenshots/home-production/final node e2e/home-final.mjs
```

The harness exercises normal motion before capture and separately checks reduced motion. Static screenshots fast-forward finite CSS animations (Playwright `animations: 'disabled'`) to avoid missing off-screen composited text; lazy images decode first, and transient keyboard focus is cleared. Images are production screenshots, without added UI, compositing or image retouching.

The [approved Issue #35 motion clips](../signature/README.md) remain unchanged. Final Hero stills reflect only control/copy polish and a readable mobile AI-sample note. [Asset QA](asset-qa.json): all twelve supplied RGB 960×1200 display crops are byte-identical to the archive. Original measurement assets and report/geometry fixtures remain unchanged; no eyewear prototype is published.

Validation: `npm test` (342 Vitest + 60 module tests), `npm run typecheck`, production build. A fresh read-only code review found no actionable P0/P1/P2 in the Issue #36 diff. GitHub CI status is recorded in PR #32.
