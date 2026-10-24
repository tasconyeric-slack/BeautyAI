# Claude Code task — BeautyAI facial assessment V3A

Repo: `tasconyeric-slack/BeautyAI-Assessment-System`  
Base branch: `v2` (or the currently authoritative integration branch, after checking)  
Research attachments: `yanzumeixue_reverse_study_and_beautyai_upgrade.md` and `facial_metric_catalog_v1.csv` / `.json`.

## Goal

Build a working, testable **in-depth facial measurement and explanation system** inside the current BeautyAI V2.1 journey. The competitor's public-facing experience is a functional benchmark, **not a source for proprietary code, images, text, UI assets, private APIs, or unverified model weights**. Implement our own deterministic, inspectable metric definitions and UI.

## Product requirements

1. Keep the current four-area architecture: Profile / Advice / Look Studio / Action. Enhance `/p/[id]/face` rather than introducing a parallel app.
2. Make a user's front photo an interactive analytical canvas. Show landmarks, length segments, angles, facial thirds and contour guides; tapping a metric highlights the exact geometry used to compute it. Use our own design system, not a pixel-exact copy of the competitor's distinctive visual design.
3. Start with approximately **25–40 truly measurable frontal metrics**, focusing on confidence and visual explainability rather than filling all 176 rows. The attached 176-row catalog is a prioritized *candidate pool*, not a claim that every metric can be implemented reliably or exists in the competitor's proprietary system.
4. Provide a public-facing four-domain information hierarchy: facial harmony, head/face architecture, expression-related facial traits, and skin/detail appearance. Do not infer sex, gender identity, ethnicity, health or age; style/presentation is user-selected.
5. Present each conclusion as: **measurement / observation → interpretation → actionable styling recommendation**. Make the relevant metric IDs link to hair, makeup/grooming, glasses, color and photo advice as appropriate.
6. Front photo remains mandatory, profile optional. E-line, nasolabial angle and other profile metrics **must be null until an actual usable side photo exists**. Don't output pseudo-3D depth or mm-level precision from monocular 2D.
7. Keep current free/paid segmentation: foundational facial assessment is free; the detailed technical breakdown may be paid; photographic hairstyle previews remain paid; local tints stay free as currently specified.
8. Do **not** add a fabricated attractiveness score, percentile or demographic ranking. `docs/DECISIONS.md` D24 prohibits production scoring. Create a separate decision only if the product owner later explicitly approves a validated scoring release.

## Architecture and implementation

- Read `CLAUDE.md`, `docs/v2/V2_1_SPEC.md`, `docs/DECISIONS.md` (D24, D28–D33), `src/aesthetic_passport/anchors.py`, `src/aesthetic_passport/cv.py`, `schema/passport.schema.json`, and the existing face page.
- Respect provenance: CV writes measurements; LLM writes analysis only; rules write derived insights; user preferences stay separate.
- Create a small measurement registry (YAML/JSON) with stable IDs, formula, landmarks, required view, value/unit, reliability, evidence and reasons for null values. The registry should be testable and support later extensions without hard-coded UI metric lists.
- Implement geometric helpers and a front-metric module, reusing existing MediaPipe face detection/landmarks and exported geometry. Add a `measurement_profile` (or similarly named CV-owned layer) using an explicit schema version bump, updated fixtures and TypeScript adapters. Leave all current passport data backward compatible where practical.
- Add interactive metric overlays tied directly to the measured coordinates; no independent redraw of fictitious landmark positions.
- If a public reference has a label but no confirmed exact formula (e.g. `IAA与JFA偏差`, `下颌额角`, `同侧鼻翼角`), don't invent one and claim equivalence. Leave it as a research candidate until grounded.
- Add robust missingness/occlusion/pose confidence. Hairline-occluded upper third must be null, not normalized to a false 100%.
- Reuse QC improvements, privacy retention (24h), server-side entitlements, and the existing working photo-edit pipeline. Do not rewrite unrelated services.

## Execution priority

1. Implement a working data path for a core set of metrics and real geometry overlays.
2. Wire the face page with expand/collapse and highlight interactions and evidence-to-advice links.
3. Run **one concise critical-path validation**: backend pytest for deterministic formulas/null conditions, frontend component smoke test, fake-model end-to-end flow, one real MediaPipe sample portrait if available. Do not conduct repeated audits or broad refactors.
4. Push a working branch and open a PR against the authoritative integration branch. Include changed files, demo/test instructions and the URL or screenshot of the working face page if available.

## Definition of done

- At least 25 truly computed front metrics across face proportions, eyes, eyebrows where reliable, lips/jaw and symmetry.
- A photo-based interactive overlay for at least 8 representative metrics.
- Clear handling of occluded upper third and missing side profile.
- End-to-end journey works: upload → analysis → detailed face assessment → advice.
- No fake score/percentile, no proprietary competitor assets, no regression in V2.1 Look Studio or paywall.
- One main path tested. Ship for user trials; prioritize functional iteration over perfection.

Proceed with code implementation. Do not stop at a PRD or plan. Respect repository-specific blockers and credentials policies; otherwise make the necessary engineering decisions autonomously.
