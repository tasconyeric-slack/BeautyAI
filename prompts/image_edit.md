# Image Edit Prompt Builder — v0.6

`prompt_version: preview-0.6`

The preview never lets a model free-write the edit. It is built deterministically from the
top-ranked recommendation that has a non-null `visual_edit_spec`, or the one the user picked
(`src/aesthetic_passport/preview.py`). v0.2: the model receives no mask (none of the supported
image-edit APIs accept one), so the template names the region instead of "the masked region";
the mask is applied afterwards by the composite (D17).

## Selection

1. Walk `derived.top5` in rank order; pick the first rec whose `visual_edit_spec` is non-null.
2. If none, `preview.status = "skipped"`; the report shows the text recommendation only.

## Look Studio combinations (v0.3, D30)

Hair targets may carry a hair colour: `<tier>_hc<i>` or `current_hc<i>` (`i` indexes
`analysis.color_profile.hair_color_directions`). Hairstyle and colour are **one** edit of the original front photo,
never an edit of an earlier result. `current` keeps the haircut (`target_description` = "the same haircut as now: keep
the current length, layers, fringe, parting, volume and styling exactly as they are"). The colour is appended to the
target description deterministically:

```
{target_description}. Hair color: {name} ({hex}) — recolor all of the hair evenly to this shade, a natural salon-dyed
result with realistic depth and shine; this hair color replaces any color mentioned before.
```

Lip colour, blush and near-face colour are never sent to the model: they are local, deterministic browser layers.

## Compositing (v0.4, Issue #38)

Hair crops include the segmented original hair, including long ends outside the face-landmark box. The Qwen 2.0
request explicitly selects an output size in the crop's aspect ratio, within its documented pixel budget; an
unexpectedly reframed response fails instead of being stretched over the original face.

For hair, the composite uses the **union of original and generated hair plus a narrow integration band**.
Original hair must be included so a short cut can reveal scalp, temples and ears instead of retaining old strands.
Generated hair can cover the face outline, and the band permits natural contact shadows and fine strand edges.
The feature core (eyes, nose and mouth with padding) is always the original. Visible brows are protected, but
generated fringe may occlude them. Other face and background pixels
outside the band stay original. A guided feather follows image edges and ramps smoothly into the protected core.
Stable skin, classified as skin in both images and away from the hair, supplies a median Lab lighting correction
for the entire edited region; it never fits the new hair colour/contrast to the original hair. Hair avoids Poisson
cloning, which can wash out strands or pull the original colour into a requested recolour. Segmentation failure
fails the preview rather than pasting a broad head-shaped patch.

## Registration and the face check (v0.5, Issue #56)

Image-edit models can move, zoom or tilt the head slightly. Composited as-is, the hair band then admits generated
pixels that carry the moved features: a second pair of brows under a fringe, stacked ears, a raised hairline. So,
before compositing, the generated face's rigid landmarks (eye corners, nose, mouth, chin, cheekbones) register the
result onto the original face with a similarity transform; the hair moves with its head. Offsets inside landmark
jitter are not resampled. No face, two faces, a move beyond the limits or a non-rigid change (residual after
alignment) rejects the result. The generated eyes, nose, mouth and visible brows are protected as well as the
original's. Finally the composite must show one face whose eye, brow, nose and mouth groups sit where the original's
do. A rejection is a quality-gate failure: one retry with a new seed, then `fallback`. Limits:
`config/qc.yaml → preview_masks.registration`. The template also asks the model to keep head position and size.

**Live findings (v0.6, Issue #1, 2026-10-25; `qwen-image-2.0` on two synthetic portraits, 34 generations).**
`scripts/live_hair_preview.py` reproduces the acceptance run; `docs/demos/issue-1-live-hair-previews.md` has the
evidence. Each change below fixes something seen in a real result, and has a regression test with a control:

- *Registration.* On a full-frame portrait the model returned the same face 9–15.5 % smaller (scale 1.09–1.155),
  shifted 0.115–0.134 cheek widths and rotated < 0.5° despite "keep head size"; 3 of 4 generations were rejected by the
  original ±0.12 scale limit. The inner face was a rigid copy (residual 0.005–0.008). `max_scale_dev` 0.12 → 0.20, and
  the cheek-contour landmarks (234/454) no longer take part in registration: side hair over the cheek edge moves them
  (residual 0.034) without the face being reshaped.
- *Wall tint.* The Lab lighting offset is measured on skin; applied to the wall a shorter cut reveals it tinted it
  (+7 R / −7 B). It is no longer applied to pixels the generated image segments as background.
- *Doubled ears.* A generated ear is a few pixels off the real one (registration is fitted on the inner face);
  blending the two drew a ghost contour. From brow level down and outside the face oval, original skin that no
  generated hair covers is kept, and generated skin is never pasted over original wall (`keep_original_ears_neck`).
  Dark sideburn tips the segmenter calls "skin" are not kept (closer in luminance to hair than to skin).
- *Floating strands.* Original flyaways the segmenter misses stayed on the wall after the cut changed
  (`stray_strands`): thin lines, in the original only, near the hair, never near the face and never imported from the
  generated image. Near the edge of the area the model's image covers, the crop-boundary fade still lets some show.
- *Forehead ghost.* The old fringe's shadow left the original skin beside it ~50 levels darker than the clean skin the
  model generated, so the seam drew the fringe's outline. Shadowed original face skin contiguous with the mask joins
  it (`shadow_halo`), moving the seam to where the two images agree. Matching the generated skin to the shadowed
  original was tried first and made it worse (a darker band), so it was dropped.
- *Fringe holes.* A fringe covering the outer brow came out with a skin-coloured hole: the segmenter called its thin
  strands "not hair" and the whole brow-landmark hull was frozen. The user's brow is now its dark pixels in the hull,
  and dark generated pixels connected to the generated hair are strands (`protected_brows`).
- *Prompt.* The hair block states the length as a hard limit and asks for a groomed finish. The old wording ("how the
  ends fall around the neck and shoulders", "irregular fine strands… restrained flyaways") produced messy shag cuts
  and ended a chin-length target at the collar. Measured on the `easy` target (hair ends below the chin, cheek
  widths; original +0.31): v0.5 +0.38/+0.41/+0.43, v0.6 +0.33/+0.35/+0.32 over three seeds each; visibly tidier, but
  still collar-level, not a chin bob.

Known limits: the 7:3 side part in a target came out centred in every sample; a crown "root lift" can come out as
clumped curls (seed-dependent); fringe strands that cross the eye or the protected core end flat at its edge; the
old fringe's shadow inside the protected brow zone can leave a faint strip above the brow.

The remaining edit regions retain their existing masks:

| region | mask source (first choice) | dilation |
|---|---|---|
| facial_hair | landmarks: jaw + lower-face polygon below nose | 10 px |
| brows | landmarks: brow contours | 6 px |
| glasses | landmarks: eye-region band | 12 px |
| clothing_top | selfie segmenter `clothes` class, cropped below chin | 10 px |

The chosen models take no mask, so identity protection is applied locally after generation.
Sizes use existing `config/qc.yaml → preview_masks` settings. No model switch is justified without live comparison.

## Template

```
Edit only the {region_en} in this photo of a real person.

Target: {target_description}

{hair_integration}

Keep exactly unchanged: {preserve_joined}, the person's identity and facial features,
head pose, head position and size in the frame, camera angle, background and overall lighting. Photorealistic, natural result that looks like the
same photo taken after a visit to a professional {professional}. No beautification, no skin smoothing,
no change to face shape, eyes, nose, mouth or skin tone. No text, no watermark.
```

`{professional}`: hair/facial_hair → "barber or hairstylist"; brows → "brow artist";
glasses → "optician"; clothing_top → "stylist".
`{region_en}`: hair → "hair"; brows → "eyebrows"; glasses → "eyeglasses"; facial_hair → "facial hair";
clothing_top → "top (shirt, collar and neckline)".

## Hair integration

```
Implement the target as a real haircut: follow its length, perimeter, layers, fringe, part, root volume and
texture. Respect the stated length exactly: the ends must stop where the target says (for example at the chin or
jaw, above the shoulders, or at the collarbone) and must not hang longer than that; remove the old longer hair
completely. Fit it to this person's visible scalp curvature, forehead height and natural hair growth direction.
Keep hair colour unless the target specifies a colour change. Let the new hairline, temples, sideburns and hair
around the ears change where the cut requires; reveal believable skin where old hair is removed. Keep the ears'
anatomy, and let strands naturally pass in front of or behind them. Give a clean, well-groomed salon finish:
fine individual strands with soft root transitions, realistic scalp visibility at the part and very few flyaways.
Match the original light direction, exposure, focus, grain and strand highlights; include subtle contact shadows
on the forehead, temples and ears. Preserve the recognizable face and its skin texture. The result should be one
coherent photograph with the requested haircut clearly visible.
```

This block is inserted only for `region=hair`; the target description is kept verbatim, including deliberate
`current_hc<i>` cut-preservation instructions. No additional model call or inferred facial metric is used.

## Negative prompt

```
different person, changed face shape, changed eyes, changed nose, changed mouth, changed skin tone, beautification, skin smoothing, makeup, extra people, text, watermark, distorted anatomy, wig, helmet hair, plastic hair, painted hair, hard hairline, cutout halo, floating strands, doubled ears, doubled eyes, doubled eyebrows, shifted face, mismatched shadows, blurry hair
```

## Identity check (MVP = human)

After generation, a reviewer marks `pass` / `fail` on: "Would a friend immediately recognize this as
the same person?" Log to `runs/<id>/preview_review.json`. Target on the internal set: ≥ 80% pass.
(Optional W4 upgrade: face-embedding cosine similarity between before/after face crops as a second
signal, reported alongside, not replacing, the human check.)

## Failure policy

Model, segmentation and geometry failures raise a preview error. A negligible edit raises `LowChange`; a missing,
duplicated, displaced or reshaped face raises `MisalignedEdit` (both are quality-gate failures: retried, then
`fallback`).
Existing API/UI failure and retry handling owns the displayed state; an illustration is not a successful photo edit.
The automated change gate measures change, not visual realism. Live identity/style/photorealism acceptance still
requires consented portraits and model access; deterministic tests do not establish a visual pass.
