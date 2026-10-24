Import `drape`, `lipTint`, `blush`, `tone` and the `FaceGeometry` type from `@/lib/tint` in browser code. Pass sRGB, 8-bit `ImageData`; paint the returned image with `putImageData`, and retain the original for comparison/reset. The module has no canvas, network, model, or package dependencies.

Geometry contains normalized 0..1 polygons; `width` and `height` describe the reference image. Coordinates scale to the supplied image's dimensions. `jaw` is the closed face outline. `neck` is the intended cloth overlay below the jaw; drape clips out any overlap with the face. Empty or zero-area polygons are ignored. Invalid geometry/colors/buffers throw; finite intensities clamp to 0..1.

Makeup moves Lab chroma toward the selected hex color, with a small uniform lightness offset that preserves local texture. Tone is intentionally subtle and also excludes brows and the whole lip. Blush offers `horizontal`, `diagonal`, and `apple` radial gradients. Drape paints the PRD's solid cloth swatch. Masks sample pixel centers and feather inward with a Gaussian edge profile; they cannot bleed outside the target polygons. Both eyes and the inner lip/teeth are hard exclusions for every transform. All alpha bytes and fully transparent pixels stay unchanged.

Run the synthetic tests with Node 22+ and the existing web TypeScript dependency:

```sh
node web/lib/tint/run-tests.mjs
cd web && npm run typecheck && npm run build
```

The scoped runner compiles into a temporary directory, runs Node's built-in tests, and removes its build output. It needs no shared test configuration. The suite prints indicative warmed 1080×1350 `lipTint` timings; the <60 ms reference is reported rather than used as a hardware-dependent CI gate. T05 can wire this runner into the shared `npm test` command when that script is added.

Phase 2 adds `eyeshadow(src, geometry, {hex, style, intensity, blend})` and
`eyeliner(src, geometry, {hex, style, intensity, thickness})`. Shadow styles are
`wash` and `outer`; liner styles are `tightline` and `wing`. All numeric controls
range from 0 to 1. The eight grouped shadow shades and four coordinated complete
looks live in `eye-palette.ts` and `makeup-presets.ts`. The no-makeup preset clears
all cosmetic layers while keeping hair and drape selections.

Eye layers derive a roll-aligned upper contour from the existing ordered eye
rings. Shadow uses a feathered region below the measured brow; liner attaches to
the skin side of the upper lid and optionally extends a short tapered wing.
Both preserve eye-interior, mouth, brow and alpha pixels, and retain dark native
lashes. Shadow uses the existing Lab tint renderer, preserving local luminance
variation. These are local appearance simulations, not predictions of a product.

`prepareEyes` rejects missing/degenerate contours, small/closed/asymmetric eyes,
insufficient brow clearance, low eye contrast and obvious dark obstruction. A
bilateral look is paused if either eye is unreliable. These conservative checks
cannot detect every pair of glasses or occlusion; the Studio includes a saved,
undoable obstruction switch that pauses both eye layers. Disabled tools explain
the limitation. No landmark, image or pixel data is added to saved Looks: only
cosmetic options and the obstruction switch extend the existing selection type.
Old Looks restore with both eye effects off. Phase 1 renderers are unchanged.

Focused checks (from `web/`):

```sh
npx vitest run components/studio
# In another terminal: NEXT_PUBLIC_USE_FIXTURE=1 npm run dev
CHROMIUM_PATH=/usr/bin/chromium node components/studio/eye-makeup.smoke.mjs
```

The browser smoke test uses the actual Studio route and a fresh fixture session,
substituting **synthetic diagnostic art** at the image-loading boundary. It checks
canvas changes, presets, sliders, individual reset, undo, original comparison,
reset all, save/reload/load, obstruction, and absence of POST/generation requests.
Synthetic pixels verify function and attachment, **not photographic realism**.
An authorized frontal portrait still needs product-owner visual acceptance for
the new eye effects; Phase 1 already passed that acceptance independently.
