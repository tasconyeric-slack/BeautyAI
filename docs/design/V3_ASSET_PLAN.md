# BeautyAI V3 — Visual Asset Plan and QA Gates
2026-10-26 · Owner GPT · Tracker https://github.com/tasconyeric-slack/BeautyAI/issues/39 · companion docs/design/V3_MASTER_BRIEF.md

## 1. Current catalog: confirmed vs proposed

**Confirmed:** exactly twelve user-approved 960×1200 display-only RGB WebP portraits covering person-001..006 in web/public/demo/portraits/, typed in web/lib/assets/portraits.ts (frontal and profile). All are fictional AI-generated examples. No display-crop landmark registration. This is useful for photography, diversity of composition and selection examples, not measurement overlays.

**Confirmed:** P001 and P002 have different published pipeline-backed sample reports with **separate measurement-master photos** at web/public/sample/demo/person-00{1,2}/{front,profile90}.jpg and fixtures in web/lib/fixtures/demo_cases/. They are the ONLY two public, measurable fictional samples today.

**Not yet approved/available as production deliverables:** new premium editorial photography, identity-consistent before/after hairstyles, realistic eyewear-fit comparisons, P003–006 measured passports, and true-user AI hairstyle generation success. Proposed visual slots below are **requirements**, not completed images.

**Rights gate:** current eyewear remattes were not imported into public web assets; product/brand rights, faithful occlusion and fitting are not verified. Keep them experimental. No new retail-product imagery in public page without a concrete image-use license.

## 2. Six-person roles

| Person | Role in eventual V3 | Existing usable visual | Priority new asset | Exclusions |
|---|---|---|---|---|
| P001 | Flagship: Hero option, hairstyle, advice, real sample Passport | Display front/profile; separately registered real sample photos/report | premium editorial master for mobile/desktop, **2 distinct paired hairstyles** on same photo, optional eye/hair close crop | No geometry on display crops; editorial edit ≠ measured source |
| P002 | Men's face/profile proof, glasses choice, alternate Hero | Display front/profile; registered measured sample; existing production Hero signature | eyewear frame-shape experiment using rights-clear frames and exact same base face; future hair option | No claim of production-real try-on until verified |
| P003 | Round/broad face editorial diversity and QC guidance | Display front/profile only | future crop, optional hairstyle pairing | No measured number/report |
| P004 | Wavy hair, volume/color coordination | Display front/profile only | future same-person hair or near-face color options | No automated complexion claims from uncalibrated photo |
| P005 | Beard/men's shape and grooming | Display front/profile only | future beard/hair editorial variation | No invented measurement/report |
| P006 | Mature gray-hair styling, different appearance needs | Display front/profile only | future layered/volume hairstyle experiment | No invented report/age inference from generated photograph |

P001 is flagship **candidate**; do not swap P002 production Hero until P001 photographs and typography crop are objectively better in /dev/v3. Do not automatically display all six as uniform tiles; use editorial collage, locally framed close-ups, and meaningful different jobs.

## 3. Priority production queue

P0-A — **Hero-ready P001 editorial portrait**: one realistic photographic source with sufficiently readable person and clear copy-side negative space; desktop landscape and mobile portrait crops can derive from the same image if quality allows. Approved fictional identity must be stable against P001 master. Avoid a passport-photo-looking composition; do not use this editorial image as a geometry master.

P0-B — **P001 hair before/after pair, two choices**: choose one baseline and generate two genuinely different yet suitable hairstyles. Keep pose, eye/nose/mouth/jaw, viewpoint, lighting, clothing and background stable. The hair change must be visible without face warp, double eyes/brows, shifted ears, silhouette seams or artificial smoothing. This is an **illustrative proposed styling** unless genuinely created by the production hairstyle pipeline; do not mislabel it as live product output.

P0-C — **P002 two eyewear frame shapes**: first verify that the chosen frame images are original/appropriately licensed or generated original products; test face scale, bridge, temples, pupil and occlusion. If product-fitting is inaccurate, deliver only a clearly labeled prototype concept or replace with editorial non-product shape guidance; avoid public before/after.

P1 — P004 wavy-hair/color styling, P006 gray-hair variation, close crops for the feature analysis. P2 — P003/P005 richer styling. Generate P1/P2 only when the corresponding website slot is committed, not en masse.

## 4. Asset metadata contract (simple catalog; add when assets exist)

For each new approved image, record:
- asset_id / person_id / category (base-display | registered-measurement | editorial | styled-illustration | verified-product-preview | detail-crop)
- repo path and source file; width/height/aspect; image SHA or checksum
- original/AI-generated/edited source, permissions or license evidence; fictional-person disclosure
- pair_id/base_image_id; same-person QA status and whether camera/alignment is matched
- registeredGeometry (false unless exact source photo + provenance + dimension verification)
- semantic slot (Hero desktop/mobile, comparison, local feature, report)
- model/production pipeline source, if truly used; never relabel offline synthetic image as actual-user generated output
- approval (candidate / approved / rejected), limitation and reviewer note

Catalog display images should be lazy outside Hero. Preserve a single intentional high-priority Hero media element. web/lib/assets/portraits.ts is current metadata-only catalog; Codex should extend it only after assets pass QA; no image bytes pushed to Git before approvals.

## 5. Quality gate (one visual round + at most one targeted correction)

1. **Portrait credibility:** natural face/skin/hair, not a beauty-filter commercial model, no duplicate features or anatomy artifacts.
2. **Identity fidelity:** same original fictional subject across any before/after. If in doubt, compare directly at equal scale and reject false pairs.
3. **Communication:** each image proves a distinct user benefit; do not generate a pretty picture without useful design placement.
4. **Composition:** both 1440×900 and 390×844 valid copy/crop placements, eye line and safe text zone; no important face crop, no unreadable overlay.
5. **Honesty and rights:** proper source/permissions, sample/edit disclosure, no real-data numbers on mismatched portrait, no unlicensed eyewear.
6. **Technical:** source/optimized path, dimension/mime verified, weight reasonable; maintain accessible alt text, do not load entire catalog on initial paint.

If any required source master is inaccessible in the executing session, use the existing repo display photo to define crop/spec and mark generation blocked; do not hallucinate a face identity or submit unverified before/after.

## 6. Execution handoff

**GPT image/design owner now:** select P001/P002 suitable base images, generate only P0-A and P0-B; review at full-size versus source, update asset manifest and record approved/rejected. Prototype eyewear P0-C only after rights and fitting basis clear.

**Codex later:** optimize and register approved images in production catalog, implement V3 asset slots using local references, test responsive crops/LCP, leave all actual registered measurements unchanged.

**Claude Design:** receives *approved* asset paths and the editorial slots. It must not quietly fabricate additional score/preview states to fill its layout.

**DeepSeek trial T2:** read-only transform this catalog into an image matrix and flag contradictory usage/permission statuses. No bytes moved, assets relabeled or new geometry registered; GPT evaluates truthfulness.

## 7. Deliverable gate for #39

First tranche complete with a technically valid named P001 editorial candidate, at least one well-aligned P001 before/after styling set (ideally two options), crop review and explicit provenance manifest, OR explicit evidence of the specific missing source/quality blocker. A failed preview is not treated as accepted. Never gate unrelated V3 docs or front-end structure on completion of every planned picture.
