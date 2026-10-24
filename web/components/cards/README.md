# K6 sharing cards

`ProfileCard`, `StylistCard`, `BeforeAfterCard`, `IllustratedAvatar` and `exportPng` are exported from `index.ts`. They take plain presentation props and do not import a passport schema or require K4.

Cards have intrinsic dimensions of 1080 × 1440; the 9:16 comparison is 1080 × 1920. Scale a parent for the on-screen preview and pass the actual `[data-card]` element to `exportPng`. `style.plane` uses the rules/K4 coordinates: `x = visual_weight` in [1, 5], `y = angular_rounded` in [-2, 2].

Avatar and palette modes ignore `portraitSrc` entirely. `isProfileModeAvailable` lets the share page disable portrait mode when its media has expired, and rendering portrait without a nonempty source throws. The calling share page must collect separate consent for every portrait export. `StylistCard.hideFace` defaults to true and omits the entire preview image, using a parameter illustration instead; no blurred or CSS-hidden photo remains. Showing the original preview requires `hideFace={false}`. A hair-only photo crop would need an explicit, separately sanitized source upstream.

Every template includes the visible AI label, product signature, and a shortlink/placeholder. Shortlinks and referral parameters are supplied by the share API/adapter. Treat these as mounted export canvases; there is no route or global CSS change here.

## PNG metadata

`exportPng(node, { ContentProducer, ProduceID, ... })` returns a PNG `Blob`, with `Label: "1"`. The caller must supply the real service name/code and a unique ID per generated card. First-write propagation fields default to the producer and production ID. An explicit different propagator requires its own propagation ID. Reserved fields default to empty strings and do not claim a signature.

The `tEXt` keyword is `AIGC`. Its text is JSON with the normative `{"AIGC":{...}}` wrapper and all seven fields: `Label`, `ContentProducer`, `ProduceID`, `ReservedCode1`, `ContentPropagator`, `PropagateID`, `ReservedCode2`. Non-Latin text uses JSON escapes to keep PNG `tEXt` bytes valid Latin-1. Writing preserves image chunks and unrelated metadata, replaces stale AIGC text chunks, and computes CRC-32.

Sources:

- [GB 45438—2025, official national-standard record](https://std.samr.gov.cn/gb/search/gbDetailedCNF?id=301E0388CB75788DE06397BE0A0AE1B4), normative Annex E, especially E(b) and note 1. [Official TC260 text](https://www.tc260.org.cn/upload/2025-03-15/1742009439794081593.pdf). Field names follow the normative annex, not the inconsistent informative Annex F example.
- [TC260 image-file metadata practice guide](https://www.tc260.org.cn/resources/upload/file/2026/4/9/1775706318096_03%20%E3%80%8A%E7%BD%91%E7%BB%9C%E5%AE%89%E5%85%A8%E6%A0%87%E5%87%86%E5%AE%9E%E8%B7%B5%E6%8C%87%E5%8D%97%E2%80%94%E2%80%94%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD%E7%94%9F%E6%88%90%E5%90%88%E6%88%90%E5%86%85%E5%AE%B9%E6%A0%87%E8%AF%86%E6%96%B9%E6%B3%95%20%E6%96%87%E4%BB%B6%E5%85%83%E6%95%B0%E6%8D%AE%E9%9A%90%E5%BC%8F%E6%A0%87%E8%AF%86%20%E5%9B%BE%E7%89%87%E6%96%87%E4%BB%B6%E3%80%8B.pdf), Annex B.2, supports the PNG `tEXt` representation.

## Integration and validation

T05/integrator must add runtime dependency **`html-to-image@1.11.13`** to `web/package.json` and update the lockfile. This task intentionally owns no shared manifest files. Local validation used an ignored installation under `cards/node_modules`; a fresh checkout cannot resolve the exporter until T05 adds that dependency. K7/integrator can consolidate the local card labels into the shared copy catalog.

From `web/`:

```sh
node components/cards/run-tests.cjs
npm run typecheck
npm run build
node components/cards/generate-previews.mjs
```

The test runner uses the existing TypeScript dependency and Node's test module. Preview generation additionally needs `esbuild@0.25.12` and the existing Playwright dependency, plus Chromium (`CHROMIUM_PATH`, default `/usr/bin/chromium`). `npm test` is not yet available on the base branch; T05 owns its setup.

The browser harness checks six actual PNG exports: all three ProfileCard modes, StylistCard, and both BeforeAfterCard ratios. It checks dimensions, every PNG chunk CRC, independently parses AIGC JSON, checks photo-free DOM and no external requests, and checks content/footer separation. It saves the three synthetic ProfileCard PNGs and `previews/validation.json`. The portrait sample is also a program-drawn SVG, never a real photograph. For a fontless environment, install Noto CJK or provide the product fonts upstream before export.
