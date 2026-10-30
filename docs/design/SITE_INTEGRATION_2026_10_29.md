# R3.1 approved assets and live Studio integration

Frontend started from main `37cb5b9a8d40de5a34cfeca82212f1ad0eed591e`. Backend validation uses a private local copy of PR #58 at `7268bfe8797627d9ebacf7daa72af769c253e4d4`; no backend changes are included here. During integration, #58 was merged externally at 2026-10-29 23:01:33 America/New_York as `c93d80211d8e208b384ad45e9a5c1b2ff918f83f`; this task did not execute a merge.

## Permanent demo binding

The owner approved the synthetic-person exports in `02_生成结果/manifest.json` on 2026-10-29. Only P001 safe/easy exports are published in `web/public/demo/generated/p001/`. Their public manifest records target, original test report ID, model, prompt, limitation and SHA-256 for each exported image. The before images have identical hashes. These JPEG exports are 1088 × 1456; no temporary API URLs are used for the homepage.

Both homepage comparison and Studio demonstration now use that original/safe/easy group. The easy caption retains the approved limitation: the result ends slightly below the jaw target. The associated report link points to the old public P001 snapshot. AD3611 artwork is no longer used in these components. Hero/P002 reading/report, six unmodified portraits, scrolling, visible-only automatic demonstrations, user takeover and reduced-motion behavior remain in the existing implementation. Report JSON and geometry have not been modified or attached to the edited photos.

## Approach

Reuse the existing R3.1 component and native `public/` assets instead of introducing another preview engine or fetching expiring media. This adds no dependency, service or deployment cost. Next.js local public asset guidance: https://nextjs.org/docs/app/getting-started/images. Existing generated-picture disclosure and personal upload handoff remain visible; the public example does not save personal looks.

## Local integration

Candidate: `http://localhost:3020`, built with `NEXT_PUBLIC_USE_FIXTURE=0` and `NEXT_PUBLIC_API_BASE=http://127.0.0.1:8018`. Backend health reports real CV, Qwen image editing, fake analysis and fake payment for newly uploaded test reports. Existing P001/P002 reports preserve their original analyses. This is a development candidate, not a production deployment.

The original service was unavailable at startup. A task-owned archived copy of the exact #58 SHA and copied test store were started without stopping or editing the other task's workspace. Original expiry dates were preserved: P001 safe 2026-10-30 13:36:50, easy 14:03:49 and P002 safe 14:06:02 (America/New_York). These local report links are temporary; permanent homepage assets are independent of them.

Verified against HTTP backend, with no browser fixture:

- Home → consent → authorized synthetic front upload → framing confirmation → real QC accepted → staged waiting → report (`ap_78ba45cd5701`, fake analysis explicitly disclosed).
- Existing real Qwen safe image in personal Studio → save → refresh → saved settings → action plan.
- One additional Qwen easy request from personal Studio (`ap_268c0a67a571`): observed pending → succeeded; original comparison, save, refresh recovery, action-plan saved count and A/B comparison. No additional aesthetic review or bulk generation.
- Mobile 390 and desktop 1440 tours, successful images and comparison. Mobile comparison has no horizontal overflow and homepage pointer interaction stops its automatic comparison.
- Injected image-network failure → honest loading error → reload restores real result. Injected fallback response → retry action, no success claim. Failure injections do not modify stored reports or invoke another provider call.

External task-package evidence: `integration-review/` contains screenshots and `tour-1440.webm` / `tour-390.webm`, linked by its local index. Media stays outside this PR. Expired reports should retain their honest expiry state; no retention dates were extended.

## Validation

Typecheck, full existing Web tests, production build and `ruff check src tests` pass. Homepage regression checks the approved asset paths and report handoff; a provenance check verifies the two exports share their source and all published hashes match. No API, storage, configuration, workflow or deployment file changes.
