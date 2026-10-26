# Display portrait catalog

Source: user-supplied `BeautyAI-demo-assets-QA-and-web.zip`, README, manifest and Chinese QA report, inspected 2026-10-26. The twelve supplied RGB WebPs are copied byte-for-byte to `web/public/demo/portraits/`; each is 960 × 1200 (4:5). Descriptive metadata lives in `web/lib/assets/portraits.ts`.

All people are fictional AI-generated examples. These are **display-only crops**, not measurement masters or verified identity-consistent biometric pairs. Every image is typed with `purpose: "display-only"` and `registeredGeometry: false`. Person-001 faces right in profile; 002–006 face left. Never flip a photograph to fit geometry.

001/002 have separate existing pipeline-backed sample reports. The catalog links to those reports but has no registered geometry; never construct a measurement `Plate` from a display crop. Their measurement masters remain byte-identical at `/sample/demo/person-001/{front,profile90}.jpg` and `/sample/demo/person-002/{front,profile90}.jpg`, with the existing provenance/geometry. The homepage continues to use those masters: 002 for discovery/analysis, 001 for styling advice.

003–006 are discriminated as `visual-only` with `reportHref: null`. They may illustrate a future photo-selection or editorial use, but cannot carry invented reports, scores, measurements or testimonials. Do not infer age or sensitive attributes from them.

No extra portrait is needed for this homepage's three-part narrative. Importing the metadata does not fetch the images; no gallery, extra eager image or full fixture import was added. Future display consumers should use the declared dimensions and lazy loading, and retain an adjacent AI-sample disclosure.

Eyewear remattes are **not copied to public/** or the production catalog. They remain prototype-only; product-image rights, SKU/size, occlusion and fitting have not been established. This package does not supply a production try-on.

Older archive instructions recommending a different Hero subject, six-person gallery or PR #68 are superseded by the user's Issue #36 brief. The approved Issue #35 signature and subjects are preserved.
