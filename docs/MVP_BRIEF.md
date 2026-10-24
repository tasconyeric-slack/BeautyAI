# Claude Code Brief — Aesthetic Passport MVP (v1)

> **How to use.** Commit this file as `docs/MVP_BRIEF.md` on the working branch, then start Claude Code
> with the kickoff message in §0. Everything below is written to Claude Code.
>
> **Repo note (S0):** the session that executed this brief was assigned the branch
> `claude/aesthetic-passport-mvp-x94xoi`, which plays the role of `mvp/v1` below. It was fast-forwarded from
> `claude/architecture-review-interfaces-05n3i4`.

---

## 0. Kickoff message (paste this into Claude Code)

```text
You are the lead engineer on Aesthetic Passport. Read docs/MVP_BRIEF.md in full, then CLAUDE.md,
docs/DECISIONS.md, docs/SCHEMA.md, schema/*.json, prompts/*.md, config/*.yaml and src/.
docs/MVP_BRIEF.md overrides docs/PLAN.md wherever they disagree (§2 says exactly how).

Do Slice S0 first (it updates CLAUDE.md so the override sticks), then build S1→S6 in order,
committing after each slice. Do not stop for approval between slices. Stop only for the
blockers listed in §10. When you finish a slice, post a 5-line status (done / evidence / next / risks / cost so far)
and keep going.
```

---

## 1. Mission and the one-sentence product

Ship a polished, working, publicly demoable MVP of **Aesthetic Passport**:

> Upload 2–4 photos and answer three questions → get a structured, evidence-backed personal styling
> report, ranked into a top-5 action list → see the #1 change applied to your own photo.

This is an AI-product portfolio piece. What it must *prove* to a reviewer is not "I can call a vision API",
but: multimodal pipeline → schema-constrained output → deterministic rules layer → image generation with
identity protection → a product UI that makes the provenance visible. The existing repo already encodes
that skeleton. **Keep the skeleton, drop the process overhead, ship the product.**

Bias: when choosing between a cleaner custom system that takes days and a mature existing approach that
works today, take the second. Get every screen reachable end-to-end before deepening any module.

---

## 2. Ground truth about the repo (read before touching anything)

- **`main` is empty** (one empty README). All real work is on branch
  `claude/architecture-review-interfaces-05n3i4` (2 commits). Create `mvp/v1` from that branch; open a PR
  to `main` at the end.
- **Exists and is good — reuse, don't rewrite:**
  - `schema/analysis.schema.json` (model output contract), `schema/passport.schema.json` (product object, v0.1)
  - `src/aesthetic_passport/rules.py` (+ `config/rules.yaml`): evidence integrity (C4), face-shape vs anchor
    consistency (C1–C3), constraint guard (C5), color-confidence caps (C6), ranking with score breakdown,
    style labels from continuous dimensions, preview selection, overall confidence
  - `src/aesthetic_passport/schema_io.py` (validate_analysis, check_output_contract, validate_passport),
    `assemble.py` (validate → derive → assemble → re-validate, CLI)
  - `src/aesthetic_passport/providers/` (`base.py` Provider protocol, `deepseek.py` OpenAI-compatible adapter)
  - `prompts/production_analyzer.md` (analyzer-0.1), `prompts/image_edit.md` (preview-0.1),
    `prompts/evaluator_rubric.md` (offline judge, deferred)
  - `examples/sample_{analysis,context,passport}.json` — a complete fictional passport. **Use it as the
    front-end fixture from hour one.**
  - Tests: 39 total; all pass after `make install` (the 5 provider tests only fail if `openai` is not installed).
- **Does not exist yet:** `qc.py`, `anchors.py`, `analyzer.py`, `pipeline.py`, `render.py`, `preview.py`,
  `api/`, `web/`, any image-edit provider, any MediaPipe model files, any deployment config.

### Precedence: what this brief keeps vs overrides

**Keep (invariants — still non-negotiable):**
1. Provenance layers: CV → `input_quality` / `anchors` / `color_measurements`; model → `analysis` only;
   rules → `derived`. The model never writes derived fields; `analysis` is never mutated after validation.
2. Schema is the contract. Any schema change bumps `schema_version` + prompt version, updates `examples/`,
   tests, and adds a DECISIONS entry. (This brief authorises exactly one bump, to v0.2 — §5.)
3. One production analysis model per request. No live multi-model voting.
4. Thresholds in `config/*.yaml`, not code.
5. Scope guard: no attractiveness score, no medical/surgical/dermatology advice, no inference of ethnicity,
   age, gender identity, health or weight. `presentation` is user-selected.
6. Validate everything that crosses a boundary; one repair retry on schema/contract failure, then fail loudly.
7. Photos are sensitive: never committed; deleted on TTL (§6.8).

**Override (process from `docs/PLAN.md`):**
- The W1–W4 week plan and every ⏸ checkpoint are replaced by the slices in §8. Do not pause for human review
  inside a slice; verify things yourself (you can open images with the Read tool — use that to check
  landmark overlays and masks).
- The 5-person acceptance test (W1-T6), the 10-report read-through (W1-T8), the Qwen-vs-GLM bake-off (W2-T3),
  the judge model and eval page (W4) are **deferred to post-MVP** (§11). Log their absence; don't build them now.
- D3/D5 are **revised, not abandoned** (see D15 below): CV may now sample regional Lab colors, but only as an
  *input signal* to the model and rules; the product still never claims a calibrated color diagnosis.

---

## 3. Verified external facts (checked 2026-10-21 — re-verify ids against live docs before coding)

**DeepSeek (production analysis):**
- `deepseek-flash` supports image input; `deepseek-v4-pro` does **not**. Legacy names
  `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp` are retired aliases served by Flash.
- Images: `image_url` content blocks with base64 data URLs, **user messages only** (images in system/assistant
  messages → HTTP 400). JPEG/PNG/WebP. Each image costs at most ~1024 tokens; images are resized to roughly
  1300×1300 pixel count server-side, so the repo's 1568 px downscale is fine.
- **Thinking mode is ON by default (effort high)** and `temperature` is ignored while thinking. The current
  adapter never sets it. Control via `extra_body={"thinking": {"type": "disabled"}}` (or `"enabled"` +
  `reasoning_effort`). JSON mode + thinking is not documented → **default to thinking disabled** for the
  analysis call; add `thinking: disabled|enabled` to `config/models.yaml`, and in S2 run the same 3 photo sets
  both ways and record first-pass validity, latency and cost in `ITERATION_LOG.md`. Keep whichever wins.
- Pricing (USD / 1M tokens, peak): input cache-hit 0.006, cache-miss 0.30, output 1.20. Off-peak is half.
  Fill `config/models.yaml → pricing.deepseek-flash` with the **peak** numbers (conservative). Expected cost
  per report ≈ $0.01–0.02 including one retry. The long system prompt + schema will hit the cache across users.

**Image editing (Recommended Look):**
- Primary: Alibaba Model Studio (DashScope, international region) `qwen-image-edit-plus` (≈$0.03/image;
  hosted Qwen-Image-Edit-2509, which advertises identity consistency; 1–3 input images). Alternatives on the
  same API: `qwen-image-edit`, `qwen-image-edit-max`. Confirm endpoint, request shape, mask support and
  output size in the official Model Studio docs before writing the adapter.
- Optional second adapter: Google `gemini-nano-banana-2.1` (stable; conversational image editing). Build it
  only if Qwen fails the identity bar in S5.
- Identity protection does **not** depend on the model behaving: see the composite step in §6.6.

**Reference repos (all exist; licenses checked):**

| Repo | License | How to use it |
|---|---|---|
| `Oby-Borges/haircut-vision-advisor` | **MIT** | Adapt freely, with attribution in `THIRD_PARTY.md`: `measurements.py` (landmark ratios), `face_shape.py` (transparent weighted heuristic over aspect/forehead/jaw ratios), `assets/hairstyles.json` (~25 styles with face-shape fit, length, fade, maintenance, mm parameters). Its `preview.py` is a drawn silhouette overlay — not what we want. |
| `QuLi-ops/ai-hairstyle-try-on` | **MIT** | Small; skim `detect_face_shape.py` for a second opinion on thresholds. |
| `F-Korpik/face_color_analysis` | **No license (all rights reserved)** | **Reference only — do not copy code.** Reimplement the idea: regional median colors (skin, brow, iris, lip) → CIE Lab → warmth / depth / chroma / skin-brow contrast → seasonal decision tree. Note its README says MediaPipe but the repo ships a dlib 68-point model; we use MediaPipe. |
| `henry-hai/AI-Hairstyle-Recommender` | **Restrictive** (no hosted service) | Do not copy code. Architecture idea only. |
| Others named in the old brief (HairMatch-AI, etc.) | unchecked | Skim only if a specific gap appears. |

**UI libraries (prefer these over custom):** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui;
`react-dropzone` (upload); `react-compare-slider` (before/after); `json-schema-to-typescript` (types from
`schema/passport.schema.json`); `lucide-react` (icons). Server: FastAPI, MediaPipe Tasks (FaceLandmarker +
ImageSegmenter `selfie_multiclass_256x256`), OpenCV, Pillow + `pillow-heif` (iPhone HEIC uploads).

---

## 4. Product spec (PM + design decisions — implement as specified)

### 4.1 Users and the portfolio reality
- End user: someone who wants concrete, executable styling direction (hair first), on a phone.
- **Portfolio reviewer: will almost never upload their own face.** Therefore a polished **sample passport**
  (`/sample`, linked from the landing hero) is P0, not polish. It renders `examples/sample_passport.json` plus a
  before/after pair. Until a consenting real person's photos exist, use the fixture and a neutral placeholder
  illustration — never a stranger's photo, never a celebrity.

### 4.2 Flow and routes (zh-CN UI; code and comments in English)
| Route | Purpose |
|---|---|
| `/` | Hero: one line of value prop, primary CTA **「生成我的形象护照」**, secondary **「查看示例报告」** → `/sample`. Below: 3-step "how it works", what you get (4 thumbnails of report sections), privacy promise (photos auto-deleted). |
| `/analyze` | 3-step wizard. **Step 1 — Photos:** slots `front` (required), `profile45` (required, ~45° turn), `smile` (optional), `hair` (optional: usual hairstyle from side/back). Each slot shows a tiny pictogram of the pose. On drop: client-side EXIF-transpose + downscale to 1600 px long side + JPEG, then `POST /api/qc`; show ✓ / warn / retake message inline (messages from `config/qc.yaml`). **Step 2 — Goals:** `presentation` (3 chips), `optimize_focus` (pick ≤3), `desired_impression` (pick ≤3). **Step 3 — Constraints (collapsed by default, safe defaults):** dye / perm off, glasses change on, budget medium, daily minutes 10, dress code none, free text. Consent checkbox + submit. |
| `/passport/[id]` | One route for both states. While running: real stage list driven by job status polling (2 s): 检查照片 → 测量面部结构 → 读取色彩与对比 → 生成分析 → 排序建议 → 生成护照. Refresh-safe. When done: the report (§4.3). The preview card loads asynchronously after the report; it never blocks it. |
| `/sample` | Same report component on fixture data, with a slim "示例数据" banner. |

### 4.3 Report layout (answer first; this order is deliberate)
1. **Passport header card** — the share-worthy hero. Front-photo thumbnail (until TTL), then 4 "passport fields":
   结构 (face shape top-1, "介于 A 与 B 之间" when ambiguous) · 气质 (style label + 2 strongest dimensions) ·
   色彩 (temperature/depth/contrast labels) · 方向 (`profile_summary.best_direction`). Overall confidence as 5 dots.
2. **推荐造型 Recommended Look** — before/after slider, captioned with the rec it visualises and a link to it.
   Pending → skeleton; failed/skipped → text card with the target description. Button "预览其他建议" lists
   other recs with a `visual_edit_spec` (cap 3 previews per passport).
3. **优先改进 Top 5** — ranked cards: action (bold), category chip, impact/effort/confidence mini-meters,
   expandable 怎么做 (`how_to`, with a copy button) and 为什么 (`why` + evidence chips → hover shows the
   observation text + photo id). A "为什么排第一" popover renders `score_breakdown`.
4. **优势 / 拖后腿** — two columns from `works` / `doesnt_work` (gentle wording; severity as subtle dot).
5. **发型 Hair** — `hair_direction`: keep / change / avoid lists, a small parameter table (length, top volume,
   side volume, part, fringe, texture), 1–3 named styles each with a copyable **理发师话术** (barber script).
6. **色彩 Color** — swatch grids: 适合 / 中性基础 / 慎用 families (hex), the 4 axes as labelled scales
   (temperature, depth, chroma, contrast) with confidence, the measured samples (small chips labelled 测量),
   and `seasonal_leaning` only when rules allow it (§6.5). Always show the lighting caveat.
7. **眼镜与修饰 Glasses & grooming** — `glasses_direction` (shape, width, weight, color, material, avoid);
   facial-hair / brow / makeup notes routed by `presentation`.
8. **照片呈现 Photo presence** — `photo_direction` (best angle, camera height, expression, light, framing, avoid).
9. **视觉档案 How we know** — the 5 continuous dimensions as bipolar bars, face-shape candidates with
   probabilities, measured anchors and the CV face-shape heuristic side by side, consistency flags in plain
   Chinese. Legend for provenance chips.
10. **局限与说明** — `limitations`, confidence notes, "not a diagnosis / no beauty score" statement, privacy note.

**Provenance chips everywhere a value appears:** 测量 (CV), 模型 (model), 规则 (rules). This is the single
most important design element for the portfolio — it makes the architecture visible to a non-engineer.

### 4.4 Visual design system ("editorial passport", not beauty-app)
- Mood: calm, document-like, precise. Paper-white background, ink text, hairline rules, one accent.
  **No** pink gradients, sparkles, emoji, glassmorphism, stock-model photos, or "AI magic" copy.
- Tokens (CSS variables, light + dark): `--paper #F7F5F0`, `--ink #1A1A1A`, `--muted #6B6B6B`,
  `--rule #E3DED3`, `--accent #1F4E5F` (deep teal ink), `--warn #9A5B13`. Dark: invert paper/ink, keep accent
  lifted to pass contrast.
- Type: Noto Serif SC for headings, Noto Sans SC + Inter for body, tabular numerals (JetBrains Mono or Inter
  tnum) for any measured number. Generous line-height for Chinese (1.75).
- Components: shadcn/ui Card, Tabs, Accordion, Popover, Tooltip, Badge, Progress, Toast. Confidence = 5 dots.
  Bipolar dimension = centred track with a marker and the two pole labels.
- Mobile-first (most uploads happen on phones); the report must read well at 375 px. Print stylesheet for the
  report (cheap PDF via the browser).
- If a `frontend-design` skill is available in your environment, load it before S1 UI work.

---

## 5. Data contract — schema v0.2 (the only authorised bump)

Rule for every field: name the report section that renders it. If you cannot, do not add it.

**`analysis.schema.json` (model output)**
- `photo_ids` enum → `["front", "profile45", "smile", "hair"]`.
- Add `profile_summary` {`one_liner` ≤60 chars, `best_direction` ≤60 chars, `evidence`} → §4.3-1.
- Add `hair_direction` {`keep[]`, `change[]`, `avoid[]` (each ≤4 items, ≤40 chars); `length` enum;
  `top_volume` enum [low, moderate, high]; `side_volume` enum [tight, controlled, full]; `part` enum
  [none, center, soft_off_center, side, deep_side]; `fringe` enum; `texture_approach` ≤40 chars;
  `named_styles[1..3]` {`name_zh`, `barber_script` ≤120 chars}; `evidence`} → §4.3-5.
- Add `glasses_direction` (nullable) {`frame_shapes[1..3]`, `frame_width` enum [narrower, matched, wider],
  `frame_weight` enum [thin, medium, bold], `colors[1..3]` (name + hex), `material` enum [metal, acetate,
  mixed, rimless], `avoid[]`, `evidence`} → §4.3-7.
- Add `photo_direction` {`best_angle`, `camera_height`, `expression`, `lighting`, `framing` (each ≤40 chars),
  `avoid[]`, `evidence`} → §4.3-8.
- `color_profile`: add `chroma` enum [muted, soft, medium, clear, bright] + `chroma_confidence`;
  `neutral_families` (same shape as favor_families); `seasonal_leaning` {`primary` enum of the 4 seasons,
  `secondary` nullable, `note` ≤60 chars}. Keep the existing caps on temperature confidence.
- Prompt → `analyzer-0.2`: describe the new blocks, add the measured color samples and the CV face-shape
  heuristic to the USER template as *signals to weigh, not truth*, and keep every existing hard rule.

**`passport.schema.json` (product object)**
- `schema_version` → `"0.2"`; `input_quality.photos[].photo_id` enum aligned with the four roles.
- `user_context.desired_impression` enum: add `youthful`, `professional`.
- `anchors`: add `face_shape_heuristic` {`top`, `runner_up`, `ambiguous`, `scores{}`} (CV layer).
- New nullable top-level `color_measurements` (CV layer): per region (`skin`, `brow`, `iris`, `lip`, `hair`)
  median Lab + hex, plus `warmth_b`, `depth_L`, `chroma_C`, `skin_brow_contrast_dL`, `reliability`
  [high, medium, low]. → §4.3-6 measured chips and §4.3-9.
- `derived`: add `display_labels.seasonal_leaning` (null when gated off), new flags C11/C12 (§6.5).
- Regenerate `examples/` (keep the fictional person), extend tests, add D13–D18 to DECISIONS, log in
  ITERATION_LOG. Generate `web/lib/passport.ts` from the passport schema (`make types`).

---

## 6. Module specs

### 6.1 `qc.py` — forgiving gate (MediaPipe FaceLandmarker + OpenCV)
- Output exactly `input_quality` per schema. Checks: face count (0 / >1), face box size, Laplacian variance on
  512 px face crop, face luma mean, clipped highlights, pose (yaw/pitch/roll from the facial transformation
  matrix) per role thresholds in `config/qc.yaml`, role match (profile45 needs |yaw| 30–55°), lighting
  consistency (spread of mean a*/b* across usable photos).
- Gate: `passed = front != reject AND profile45 != reject`. `warn` photos are still analysed with the warning
  passed to the model. Failed front stops the run before any model call.
- Also exposed per-photo for live UI checks (`POST /api/qc`, < 1.5 s target).
- Tests: generate bad variants programmatically from any face photo in `data/test_faces/` (gitignored) —
  blur, darken, overexpose, shrink, tile two faces, rotate — plus a no-face image. Skip face-dependent tests
  when that folder is empty.

### 6.2 `anchors.py` + face-shape heuristic
- Compute the ratios already defined in `config/qc.yaml` on the front photo in **pixel** space.
  Reconcile landmark indices with haircut-vision-advisor (it uses forehead 103/332, the repo config 54/284):
  write `scripts/debug_landmarks.py` to draw every configured index on a photo, **open the image yourself**,
  pick the indices that actually sit where the names say, record the choice in `config/qc.yaml`.
- Port the MIT face-shape heuristic into `face_shape.py` (weights to `config/rules.yaml`), map its 6 labels to
  the schema's 8, emit `anchors.face_shape_heuristic`. Never clamp; out-of-range ratios → anchors null + warning.

### 6.3 `color_sample.py` — measured color signals (own implementation)
- Regions from landmarks + selfie segmenter: both cheeks (avoid nose, shadows, specular highlights via
  L-percentile trimming), brows, iris, lips, hair (segmenter class 1). Median in CIE Lab (OpenCV 0–255 → convert
  to standard L 0–100, a/b signed).
- Light normalisation: gray-world on the background/clothing ring is too fragile; instead report
  `reliability` from lighting consistency + clipped fraction + face luma. No calibration in v1.
- Output `color_measurements`. This is a signal for the model and the rules, never displayed as a verdict.

### 6.4 `analyzer.py` + `pipeline.py`
- `analyzer.py`: fill the analyzer-0.2 USER template (manifest, anchors, face-shape heuristic, color
  measurements, QC warnings, user context), call `providers.from_config("analysis")`, then
  `validate_analysis` + `check_output_contract`; on failure one repair turn in the same conversation; log every
  attempt to `runs/<id>/calls.jsonl`.
- Add `ANALYSIS_PROVIDER=fake` → `FakeProvider` that returns `examples/sample_analysis.json` (with a 3 s sleep).
  The whole product, tests and the `/sample` path must work with **no API keys**.
- `pipeline.py`: photos dir + context → QC → anchors → color → analyzer → `assemble` → passport JSON in
  `runs/<id>/passport.json`. CLI `make passport PHOTOS=data/p01 CONTEXT=examples/sample_context.json`.
  Each stage updates the job's `stage` field (drives the progress UI).
- Add `deepseek.py` support for the `thinking` config key (§3). Fill pricing.

### 6.5 Rules additions (`rules.py`, config-driven)
- **C11** CV heuristic top-1 face shape not in the model's top-2 → warn flag; overall confidence penalty.
- **C12** model `temperature` direction contradicts measured `warmth_b` beyond a config margin, or
  `color_measurements.reliability == low` → cap temperature/chroma confidence (reuse C6 caps).
- **Seasonal gating:** `derived.display_labels.seasonal_leaning` = model's leaning only if temperature and
  chroma confidences (after caps) ≥ `seasonal_min_conf` (config, start 0.5) and C12 not raised; else null.
  The UI then shows axes only. Copy: 「色彩方向参考：偏向 夏季型（与冬季型接近）」 — never "你是夏季型".
- Hairstyle catalog fit (cheap, high value): load the adapted `hairstyles.json`; for `named_styles`, attach the
  closest catalog entry (by face-shape fit + length) as a secondary "参考款式" with its mm parameters. Pure rules,
  no extra model call.

### 6.6 `preview.py` — Recommended Look with identity protection
1. Select per `prompts/image_edit.md` (first top-5 rec with a `visual_edit_spec`), or the rec the user asked for.
2. Mask: `selfie_multiclass_256x256` → hair (class 1) for `hair`; landmark polygons for brows / glasses band /
   lower face; clothes class cropped below chin for `clothing_top`. Dilate per the table in `image_edit.md`;
   for hair, extend upward/outward so added volume has room.
3. Protected region = face-skin class ∪ landmark face-oval interior (eyes, brows unless region is brows,
   nose, mouth). Subtract it from the edit mask.
4. Deterministic prompt from the template (same input → identical prompt; unit-test this).
5. Call `ImageEditProvider` (new `providers/image/` package: `base.py`, `qwen.py`, optional `gemini.py`;
   config under `production.image_edit`). Pad to the model's accepted aspect, then un-pad.
6. **Composite (the identity guarantee):** resize result to the original, recompute the hair mask on the
   result, take the union with the original hair mask, subtract the protected region, feather 8–15 px, alpha-
   blend edited over original. Face pixels are therefore always the user's real pixels.
7. Write `preview` per schema; store after-image under `runs/<id>/preview_<rec>.jpg`; `identity_check =
   "unchecked"` (human/auto check is post-MVP). Any error, refusal or timeout → `status = failed`, text fallback.
8. Save debug artifacts (mask overlay, protected region overlay) under `runs/<id>/debug/` and **open them
   yourself** when testing on real photos.

### 6.7 API (`src/aesthetic_passport/api/`, FastAPI)
- `POST /api/qc` (single photo + role) → photo QC result.
- `POST /api/passport` (multipart photos + context JSON + optional invite code) → `{id}`; runs the pipeline in
  a background task; status in SQLite (`runs/app.db`: id, status, stage, error, created_at, passport JSON).
- `GET /api/passport/{id}` → `{status, stage, passport|null, error|null}`.
- `POST /api/passport/{id}/preview?rec=r3` → starts/returns a preview job (cap 3 per passport).
- `GET /api/media/{id}/{name}` → serves thumbnail / before / after images until TTL.
- Guardrails: optional `INVITE_CODES`, `DAILY_PASSPORT_LIMIT`, per-IP rate limit, 15 MB upload cap, HEIC
  support, CORS for the web origin. No auth, no accounts, no payments.

### 6.8 Privacy & retention (state it in the UI and the README)
- Non-front photos are deleted when the analysis job ends. The front photo is needed for previews, so it,
  its thumbnail and preview images live **24 h**, then a cleanup routine (on startup + hourly) deletes them.
  The passport JSON (no images) is kept. Nothing photo-derived is logged.

### 6.9 Web (`web/`)
- Build every report section against `examples/sample_passport.json` first (S1), then switch to the API.
- Types generated from the schema; one `<Report passport>` component used by `/passport/[id]` and `/sample`.
- `NEXT_PUBLIC_API_BASE` env; graceful error states (QC fail, analysis fail, rate-limited, expired media).

---

## 7. Decisions to record in `docs/DECISIONS.md` (S0)

- **D13** MVP brief supersedes PLAN.md process; invariants kept (list them).
- **D14** Photo roles: front + profile45 required; smile + hair optional (lower drop-off than 3 required).
- **D15** Color: CV regional Lab sampling allowed as an input signal (revises D3/D5); confidence caps kept;
  seasonal leaning displayed only when gated rules pass; never phrased as a diagnosis.
- **D16** Thinking mode disabled by default for the analysis call; A/B recorded in S2.
- **D17** Image edit: Qwen `qwen-image-edit-plus` first; identity guaranteed by mask composite, not by the model.
  (Resolves D11 provisionally; revisit if the human identity check fails.)
- **D18** Report order answer-first: header → recommended look → top 5 → details → how we know.

---

## 8. Build order — vertical slices (commit after each; keep `make test` green)

| Slice | Build | Definition of done |
|---|---|---|
| **S0 Orient** | Branch `mvp/v1`; `make install`, `make test`; update `CLAUDE.md` (point to this brief, replace "stop at every ⏸" with §10 stop rules, keep the 8 invariants), mark PLAN.md as superseded where relevant; add D13–D18; fill DeepSeek pricing + `thinking` key; add `THIRD_PARTY.md`. | Tests green; docs consistent; a 10-line plan posted. |
| **S1 Walking skeleton** | FastAPI with all endpoints backed by `FakeProvider` and a stub QC; job runner + SQLite; Next.js app with `/`, `/analyze`, `/passport/[id]` (polling + stages), `/sample`; every report section rendered from the fixture with the design system. `make dev` runs both. | In a browser: upload 2 photos → stages animate → full passport renders; `/sample` looks finished at 375 px and desktop. Screenshot both (Playwright) into `docs/screenshots/`. |
| **S2 Real analysis** | `analyzer.py`, `pipeline.py`, DeepSeek with thinking flag, calls.jsonl, `make passport`. Run on `data/` photo sets; A/B thinking. | A real photo set produces a valid passport via CLI and via the UI. First-pass validity, retries, p50 latency, cost per report written to ITERATION_LOG. |
| **S3 CV layer** | `qc.py`, `anchors.py`, `face_shape.py`, `debug_landmarks.py`; live QC in the upload slots with retake messages. | Synthetic bad photos rejected with the right reason; good photos pass; landmark overlay verified by you; anchors + heuristic appear in the passport. |
| **S4 Schema v0.2 modules** | Schema bump (§5), analyzer-0.2, `color_sample.py`, rules C11/C12 + seasonal gating + catalog fit; report sections 5–9 wired to real data with swatches. | Tests extended and green; `make sample` regenerates v0.2 fixtures; a real passport renders all 10 sections without empty or contradictory blocks. |
| **S5 Recommended Look** | Masks, protected region, Qwen adapter, composite, async preview + "预览其他建议", failure fallback. | On a real photo, before/after slider shows a plausible hair change; diffing the protected region between before and after shows ~zero change; forcing an API error shows the text fallback without breaking the page. |
| **S6 Ship-ready** | Design polish pass, empty/error states, copy review (tone rules from the analyzer prompt apply to UI copy too), retention job, rate limits, README (what it is, architecture diagram showing the three provenance layers, screenshots, privacy, run locally), `Dockerfile` for the API (downloads MediaPipe `.task` files at build), `render.yaml` or `fly.toml`, Vercel config. | Fresh clone → `make dev` works from README alone; full flow works at 375 px; deploy configs present. **Do not deploy** — stop and ask (needs accounts and keys). |

---

## 9. Lightweight acceptance (MVP)

Run on the photo sets in `data/` (and with `FakeProvider` in CI):
- QC: synthetic bad set rejected for the right reason; real good sets pass.
- Schema: first-pass validity ≥ 4/5 real runs; zero unvalidated passports reach the UI.
- Stability (cheap check): same person, two photo sets → top-3 categories overlap ≥ 2; no section contradicts
  another (e.g. hair says "add height" while photo says "elongated, avoid height").
- Safety: grep outputs for score/beauty-ranking language and medical terms — zero hits.
- Preview: hair change visible; protected region unchanged; failure path clean.
- Engineering: p50 analysis latency recorded; cost per passport recorded (target < $0.10 incl. one preview).
Write results to `docs/ITERATION_LOG.md`; no separate report.

---

## 10. When to stop and ask (the only reasons)

1. A required credential is missing (`DEEPSEEK_API_KEY`, `DASHSCOPE_API_KEY`) — but first finish everything
   that works with `FakeProvider`, then ask once with the exact variable names.
2. Your environment blocks outbound calls to the provider — say so, keep building against fakes.
3. No test photos in `data/` when you reach S2 — ask; meanwhile continue on S3 synthetic tests and UI.
4. A change would breach a §2 invariant or the scope guard.
5. Any single action expected to spend > $5 in API calls.
6. Deployment (S6 end).
Everything else: choose the sensible default, note it in the slice status, continue.

---

## 11. Explicitly out of scope now (post-MVP backlog, in this order)

Eval runner + `/eval` page from `docs/EVAL.md` (strong portfolio value — first thing after MVP) ·
offline judge model · automatic identity check (face-embedding similarity) · share card PNG ·
second image model bake-off · English locale · beard/brow/makeup previews · body/outfit modules ·
history/compare · accounts/payments/SEO · custom-trained models · self-hosted diffusion.

---

## 12. Engineering conventions

Python 3.11, type hints, `ruff` clean; small modules over frameworks. TypeScript strict. Conventional
commits, one per slice minimum. Never commit photos, `runs/`, `.env`, or MediaPipe model binaries. Every prompt
or rules change that alters outputs → one line in `ITERATION_LOG.md` (this log becomes the case-study write-up).
When you adapt code from an MIT repo, keep its license header and list it in `THIRD_PARTY.md`.
