# QOVES reference observations

Observed in **real headless Chromium**, 2026-10-25, at [qoves.com](https://www.qoves.com/). Desktop **1440 × 1000**, mobile **390 × 844**, DPR 1. Full viewport captures are linked below; [capture metadata](reference/captures.json) records source and state. These are public marketing-page observations, not access to QOVES’s paid report or authenticated app.

## Section map — reading order

| Sequence | Current QOVES sections | Useful input for BeautyAI |
|---|---|---|
| 1 · Promise | Portrait hero → press strip → transformation preview | One image, one promise, two actions; reuse BeautyAI’s own sample. |
| 2 · Rationale | Research-category tabs → old/new approach → expert quote | Clear section changes; exclude status/dating claims and borrowed endorsements. |
| 3 · Product proof | Facial analysis → personalization factors → what you learn → four-step plan | Portrait plus compact evidence previews; only show fields BeautyAI actually has. |
| 4 · Decision | Transformation comparisons → plan/action steps → visualization | Connect finding to practical action; use BeautyAI’s hold-original interaction. |
| 5 · Breadth/trust | Progress charts → proof points → assessment catalog → personal identity → community → experts → technology → face story → case gallery | Select useful hierarchy; no invented tracking, assessment counts, testimonials, or expert support. |
| 6 · Conversion/support | CTA → how-it-works → pricing/value → support → categorized FAQ → insecurity/appearance discussion → footer | Calm disclosure and easy next action; preserve BeautyAI’s own one-time entitlement and privacy model. |

The page has 27 H2 sections in the captured DOM. This map groups them for reference; it is **not** a proposed BeautyAI homepage. Navigation’s “How it works” targets the earlier plan section (`#how-it-works`), while a later section also has that heading.

## Layout and typography

| Observed | Desktop | Mobile |
|---|---|---|
| Hero | Full-bleed portrait; copy occupies roughly the left 40%; face dominates the right. Copy starts around x=68 px. | Portrait fills the width; copy sits low over a dark fade; two adjacent CTA pills. Hero ends around y=784 px at this viewport. |
| Navigation | Overlay at top; after scrolling, floating rounded bar inset about 40 px, about 64 px high. | Logo, CTA, menu icon; scrolled bar inset about 16 px. Menu opens a full-screen light panel. |
| Display | Computed hero **56/64 px**, tracking −1.12 px; main section headings usually **48/56 px**, tracking −0.72 px. | Computed hero **32/36 px**, tracking −0.48 px. |
| Supporting type | Body **16/24 px**, nav **14/20 px**; small uppercase/mono labels. | Body stays readable; layouts stack, category tabs scroll horizontally. |
| Reading rhythm | Large portrait sections interspersed with white sections and roughly 120 px spacer bands. | Recomposition, not a scaled desktop: imagery and controls have distinct stacking. |

Computed font family: **PP Neue Montreal** with sans fallbacks; white/charcoal type and muted blue-gray fields (one measured plan background: `#9aaeb5`). This identifies the reference, not permission to use the font. Use BeautyAI’s existing fonts.

## States actually exercised

| Action | Observed result / capture |
|---|---|
| Scroll from hero to analysis | Navigation becomes a floating pill. [Hero](reference/qoves-desktop-hero.jpg), [analysis](reference/qoves-desktop-analysis.jpg), [plan](reference/qoves-desktop-plan.jpg). |
| Click “How it works” in nav | URL becomes `/#how-it-works`; scrolls to the earlier four-step plan. |
| Click “Dating” research category | Four evidence entries and citations replace the initial finance entries. Pattern only; no BeautyAI claim adoption. |
| Open “See detailed transformation” | Large overlay with region tabs and finding → takeaway crop pairs. Close button dismisses it; Escape did not dismiss it in this session. [Closed](reference/qoves-desktop-transformations.jpg), [open](reference/qoves-desktop-transformation-open.jpg). Retain BeautyAI Sheet’s own keyboard/focus behavior. |
| Choose “Privacy & Data”, open first question | Selected category changes the questions; plus becomes minus and an answer expands. [Desktop initial](reference/qoves-desktop-faq.jpg), [desktop expanded](reference/qoves-desktop-faq-privacy.jpg), [mobile expanded](reference/qoves-mobile-faq.jpg). |
| Open/close mobile menu | Full-screen navigation with large links and grouped secondary links. [Hero](reference/qoves-mobile-hero.jpg), [open menu](reference/qoves-mobile-menu.jpg), [analysis](reference/qoves-mobile-analysis.jpg). |

Primary CTAs point to `/welcome/checkout`; login points to `app.qoves.com`. Checkout, payment, authenticated features, comparison dragging, and video playback were not exercised. Cookie notice was dismissed for unobstructed section captures. No proprietary source bundle, image asset, or font was harvested.
