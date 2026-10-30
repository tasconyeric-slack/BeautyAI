# Report value journey · 2026-10-30

Approved follow-up to #61: focus on report reading, Studio controls, action plan and PDF. Keep Hero and photographic palette. No R4.1, recordings or live model/image calls; no DashScope usage. Existing fixtures/assets provide the prototype and acceptance data.

Use the existing React/CSS Modules/Radix controls and react-pdf renderer. No new dependencies or schema/model changes. Compared a new report engine against presentation-level reuse: reuse retains entitlement, provenance, real overlays, saved selections and photo expiry with lower regression and deployment cost.

References: supplied QOVES imagery, https://www.qoves.com/ and https://thefacereport.com/sample-report for a summary-first reading path, large matched photos and visual evidence. No copied code/assets.

- [x] Put a compact PDF action directly after visible score/rank, before report body. Keep private photo export opt-in and expiry enforced.
- [x] Order report as summary, style strengths, measured details, choices, palette, plan, brief limitations. Replace repeated prose with tables/charts, remove scoring formula/method blocks and repeated methods links. Keep source attribution in a small footer.
- [x] Give Studio recommended palettes first, expandable complete tools, clear save/plan handoff.
- [x] Reduce plan form density; show saved styles and primary actions before secondary filters.
- [x] Align PDF colors, reading sequence and tables; retain actual values, free/expired/demo states and required credits.
- [ ] Run affected tests/full web suite, typecheck, build, lint, one browser critical-path pass and selected PDF static renders. PR/CI/Codex gate and existing-site deployment.


## Acceptance

395 Vitest cases covered (394 passed on the full run; the moved-score page assertion was updated and all four PDF tests passed on rerun), all 60 module tests passed. Typecheck, default production build, Ruff and diff check passed. The low-worker suite avoids the pre-existing canvas CPU timeout seen when the build and many test workers compete.

1440/390 fixture journey passed upload/framing/QC, report, Studio tabs, saving, refresh recovery, action completion/restoration, fake checkout and fixture preview. Public report export was downloaded in the browser, text checked, and cover/measurement pages rendered with Poppler and visually inspected. Final public sample is 14 pages with matched existing photos; no case IDs or scoring formula/method blocks. No recordings, generated assets, live model requests or DashScope spend. Evidence stays in the chat's external value-review folder.
