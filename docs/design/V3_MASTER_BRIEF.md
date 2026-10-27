# BeautyAI V3 — Master Execution Brief
Version: 2026-10-26 M0 · Owner: GPT · Tracker: https://github.com/tasconyeric-slack/BeautyAI/issues/37

## 0. Authority and scope

This brief is the **product/visual execution baseline** for BeautyAI V3. V3 is a face-analysis-backed **personal appearance understanding and decision platform**, not a standalone beauty score widget, eyewear demo or generated marketing-only page. The six-step customer value chain is **Discover → Measure → Understand → Choose → Preview → Act**. The home page communicates value; the dedicated product routes must perform the work.

V3 supersedes older homepage art-direction **only for proposed future UI and IA**, not the running code or backend rules. The canonical technical guardrails in CLAUDE.md, AGENTS.md, web/AGENTS.md, model privacy/provenance/schema contracts and existing Issue ownership remain in force. Do not edit current production homepage while prototyping.

Product/reference source: approved 2026-10-26 BeautyAI V3 vision; repo docs/design/REFERENCE.md (real QOVES commercial-site captures), docs/design/SOURCES.md, docs/design/INVENTORY.md, docs/design/home-final-art-direction.md, and web/lib/assets/portraits.ts. These older documents are evidence, not authority to revert V3 back to three sections or adopt stale routes.

## 1. Verified repo baseline (2026-10-26)

- Canonical repo tasconyeric-slack/BeautyAI, default integration branch main. PR #32 was merged 2026-10-26; no homepage rewrite is needed to begin.
- Actual production root: web/app/page.tsx → web/components/home/homepage.tsx. Current three sections: Hero (P002 front/registered profile signature), Analysis (P002 measured geometry + advice), Choices (P001 measured/derived decisions). Keep working until owner-approved V3 replacement.
- web/components/landing/** still exists, but is **not** the default homepage's implementation; do not send the V3 homepage agent there by mistake. Existing /dev/home is a development-only rendering of the current homepage, not an isolated V3 experiment. New V3 can use a separately gated /dev/v3 route or equivalent isolated preview.
- Other already-present product families: web/components/{face,profile,report,studio,looks,passport,upload,plan,ds,ui}/**, web/app/{start,report/sample,p,check}/**, web/lib/fixtures/demo_cases/**. Reuse these; verify particular URLs and exports in code before linking.
- Front-end stack: Next.js 16.4.2 App Router, React 19.3.1, Tailwind 4.3.3; Radix, Lucide and Playwright already installed. Follow web/AGENTS.md and version-specific framework docs in node_modules.
- Shared visual source: web/components/ds/tokens.css, web/app/globals.css. Existing --ap-* tokens are the starting point, not a requirement to preserve outdated page composition. Installed Chinese and Latin fonts are specified in web/app/layout.tsx. Do not import QOVES's restricted typography.
- Brand/reference capture: real QOVES homepage observed at desktop 1440×1000 and mobile 390×844, see docs/design/REFERENCE.md and docs/design/reference/. Observe patterns; source images, fonts, marks and proprietary code are **not** deployable BeautyAI assets.

## 2. Information architecture

Top-level product destinations to preserve/clarify through existing routes before adding new ones:
1. Home — value, proof and conversion.
2. Analysis — structure, region, multi-view and evidence.
3. Aesthetic Assessment — learned human-rating prediction and named reference comparison **only when authorized and valid**; geometric harmony stays separate.
4. Style Studio — interactive looks and real/generated preview with honest failures.
5. Aesthetic Passport — full measured report, advice and action plan.
6. Start — image upload and QC steps.
Supporting: method/privacy, FAQ, accounts and future services; not all require top-level navbar links. Prefer existing routes/components; avoid duplicate report or Studio systems.

## 3. Home: 4 narrative acts and 12 modules

Statuses: **Reuse** means a related working component exists, not that the future V3 module already exists. **Design first** means mock/interaction only until actual asset or backend proof passes. Each section needs a distinct narrative job, not a forced full-viewport card.

| ID | Act | Module / user question | Existing source to inspect | First release / owner |
|---|---|---|---|---|
| 01 | Discovery | Hero — What can BeautyAI do for me? | home/{hero,signature,homepage}.tsx; tokens | M1 flagship composition, effective /start and sample CTAs; Claude Design concept → Codex |
| 02 | Discovery | Transformation — Does a style choice make a difference? | ds/CompareView and looks comparison; editorial asset plan | M1 one *verified* compelling P001 before/after, optional P002; Claude art direction + GPT images + Codex |
| 03 | Discovery | Every Face Is Different — Is it individualized? | web/lib/assets/portraits.ts | M3 asymmetrical editorial portraits P003–006 without fake personal data; GPT/Codex |
| 04 | Understanding | Facial Intelligence — What does a feature mean? | home/{analysis,overlay,model}; components/face/** | M1 registered P001/P002 measurement / feature focus / explanation; Codex, Claude for genuinely difficult visuals |
| 05 | Understanding | Aesthetic Assessment — How should scores and ranking be understood? | components/profile/**, report/**; issues #13/#33/#34 | M3 UI contract, learned-vs-geometry separation and truthful unavailable states; Codex |
| 06 | Understanding | Feature Deep Dive — Which specific features matter? | components/face/** and selected report regions | M3 close crops + specific report-backed explanations; Codex |
| 07 | Personalization | Recommendations — What is suitable and why? | home/choices; advice/**; plan/** | M2 measurement → interpretation → practical suggestion, actual P001/P002 report values; Codex |
| 08 | Personalization | Style Studio — Can I try it? | components/studio/**, looks/**; issue #1 | M3 link/preview actual functioning studio, error/progress/save/compare states; Codex; Claude only if required |
| 09 | Personalization | Action Plan — What do I do next? | components/plan/** and report actions | M3 prioritized haircut/eyewear/grooming advice grounded in real sample; GPT/Codex; DeepSeek copy trial |
| 10 | Delivery | Aesthetic Passport — What do I receive? | components/report/**; /report/sample?v=p001 | M2 one actual full publicly accessible sample report, not six fictional reports; Codex |
| 11 | Delivery | How It Works — How do I begin? | web/app/start and upload/**, QC | M3 concise real sequence, link to existing upload, small DeepSeek component trial; Codex integrates |
| 12 | Delivery | Confidence & CTA — Can I trust it and start? | privacy copy, /about, existing home footer | M3 clear method/privacy/FAQ, supported promises only; GPT/Codex |

Visual execution **Batch A**: 01, 02, 04, then 07 and 10 as one useful journey. **Batch B**: 03, 05, 06, 08, 09. **Batch C**: 11, 12. B/C's easy structural work may proceed in parallel, but final visual integration follows the approved design system.

## 4. M1 high-fidelity vertical slice: contract

Required contiguous user story: **P001-or-P002 editorial Hero → one meaningful style comparison → one true registered face measurement with interpretable takeaway**. The camera/data and the story must agree. P001 is the V3 flagship **candidate**; current P002 Hero is not replaced automatically. Current front/profile behavior and reduced-motion affordances remain until a new treatment is demonstrably better.

Primary reference: current https://www.qoves.com/ (product narrative, visual density, portrait-led editorial rhythm, precise measurement treatment); existing local verified captures in docs/design/reference are sufficient initial reference. Do not resume speculative Chipsa-clone work.

Design output: one chosen direction only; desktop 1440×900 and mobile 390×844, Chinese line wrapping tested, primary/secondary CTA, portrait crop, feature interaction focus and disclosure, scroll continuity, key unavailable state, reduced-motion behavior. Components must be reusable within the rest of V3, but avoid designing the whole site before proving one slice.

Working preview: create /dev/v3 gated to development (or private alternative) on new branch; never change web/app/page.tsx for initial review. Reuse existing tokens/fonts and measured overlays; avoid new animation runtime until clearly justified. After initial run, perform one screenshot comparison and one targeted adjustment; genuine critical defects remain blocking.

## 5. Data truth and visual asset contract

- P001/P002 pipeline-backed sample reports: actual registered photo/metric geometry is sourced from web/lib/fixtures/demo_cases/** plus web/public/sample/demo/person-001,person-002/{front,profile90}.jpg. Existing observed sample geometric scores are **geometric harmony** scores, not an empirically supported learned beauty score or population percentile.
- Twelve approved 960×1200 display-only WebPs (six front/profile pairs) are in web/public/demo/portraits/** and typed in web/lib/assets/portraits.ts. They have registeredGeometry:false and unverified biometric pair identity. NEVER apply landmark coordinates/metrics from registered masters to these WebPs; never horizontally flip sensitive geometry views.
- P003–006 may show diversity of *visual examples*, but are visual-only; no invented profile, ranking, age/ethnicity inference, customer testimonial or analytic result.
- Generated editorial photography and paired hairstyle experiments are **new asset categories**, not evidence of completed real-person AI generation. Label studio simulations and example edits appropriately. Base/after must visibly be the same identity and alignment; tell the truth when not ready.
- Glasses commercial photo rights, fitting and occlusion have not been established in current assets; keep experimental eyewear remattes out of production until the gate passes. See docs/design/V3_ASSET_PLAN.md.
- Real learned attractiveness: #13 model rights and inference; #33 model-matched cohort CDF; #34 interface/report integration. Production score/rank must fail closed when licensing, QC, model/cohort compatibility or actual cohort evidence is missing. Never map current geometry score or competitor histogram to learned score.
- Protect personal photos and credentials per CLAUDE.md; do not put photo bytes or secrets in public PRs or logs.

## 6. Visual system and responsive rules

Person-first, editorial, modern scientific aesthetic; restrained precision and natural photography. Large image and dense explanation sections alternate; avoid twelve identical rounded SaaS cards, decorative orphaned numbers and repeated ornamental eyebrow text.

Use existing BeautyAI tokens as starting palette; main ink/soft cool paper/deep teal remain likely compatible but may be refined as one shared system. Images must not receive skin-tone-distorting overlays. Chinese type should be read and composed independently from Latin captions. Existing type families and asset rights take precedence over QOVES's computed PP Neue Montreal.

Mobile is **co-equal**, not shrunk desktop: hero image priority, shorter copy, thumb-sized controls, feature tabs/disclosures, useful crop/zoom, touch and keyboard fallback, preserved /start path. Natural scroll; no mandatory hijacked scroll.

Measure high-level similarity to reference via real screenshot geometry, visual rhythm, type, photography, and believable data presentation; release requires distinctly original BeautyAI imagery/copy/brand, not a source clone.

## 7. Parallel lanes / agents / ownership

| Lane | Lead | File/artifact ownership | Start condition / dependency |
|---|---|---|---|
| V3-01 brief (#37) | GPT, Codex optional | docs/design/V3_MASTER_BRIEF.md and V3_ASSET_PLAN.md | Start immediately; docs-only PR |
| V3-02 visual (#38) | Claude Design: source visual design; Codex: working integration | design artifacts and only isolated V3 route/components; no overlap with current home until signoff | Start as soon as #37 reference/data baseline exists; usable source portraits |
| V3-03 assets (#39) | GPT image/design; Codex later for catalog | new licensed/approved editorial/paired images + manifest; no measurement masters | Runs alongside #37 |
| hairstyle #1 | Codex | providers/image/**, preview.py, masks.py, previews API | Independent; avoid V3 UI files |
| side QC #12 | Codex | face_metrics/**, qc.py, evaluation script/tests | Independent of UI and scoring |
| learned model #13 | Claude Code | attractiveness/** and narrow experiments/config | Independent of V3; scarce Claude time has priority here |
| reference rank #33 | Codex | attractiveness_rank/** and reference registry/tests | Pure module now; real rank depends on lawful #13 model/cohort |
| learned UI #34 | Codex | Passport schema, pipeline/assemble, profile/report UI | After #13/#33 contracts stabilize |
| DeepSeek trial | DeepSeek in its own execution environment; GPT evaluator | copy proposal, manifest read-only assessment, standalone component artifact | Independent; no direct main commits without Codex evaluation |

Codex can handle ordinary integration, responsiveness, tests and build while Claude works only on visually difficult scenes. No double-writing by Claude and Codex; pass concrete desktop/mobile mock, token decisions and interaction states to Codex. The three planned DeepSeek pilot tasks are T1 module 05/09/12 truthful Chinese UX copy; T2 six-person asset-manifest audit; T3 small isolated How It Works component. Promote workload only if at least 2/3 trials pass with ≤1 targeted correction and no critical invented data/security violations.

## 8. Delivery sequence and acceptance

M0 — this document + V3_ASSET_PLAN.md committed as docs-only PR and #37–#39 tracked. Main production unaffected. M0 is enough to start design and asset production; no ceremonial approval gate for independent tasks.

M1 — narrow high-fidelity visual slice + proven photo assets + real desktop/mobile runnable preview. Objective review against reference and actual copy, one correction pass; do not replace public home prematurely.

M2 — core 01/02/04/07/10 home journey wired to real /start and sample /report; still no fake scoring/preview. Visual accepted before production integration.

M3 — remaining twelve-home-module system + honest live capability states, independent report/studio/upload surfaces preserved.

M4 — real user funnel and product-use feedback; iterate on actual confusion, not another abstract site redesign.

Minimum gate per code task: changed-area tests; web typecheck/build where relevant; one browser critical-path + desktop/mobile captures for UI; privacy/schema/legal gates only where materially affected. PR to main, current required CI/review rules, no automatic merge of safety-critical or unapproved homepage work.

## 9. No-go decisions

No renewed QOVES pixel-copy campaign; no open-ended six-screen Claude exploration; no giant all-section rebuild; no portrait-data crossbinding; no visual-only synthetic demographic claims; no invented beauty-percentile or "instant AI preview"; no unlicensed retail eyewear; no rewrite of mature existing report, Studio, scoring or MediaPipe pipelines just for landing-page design.
