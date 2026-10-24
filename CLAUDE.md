# CLAUDE.md — working rules for this repo

You are building **Aesthetic Passport V2**. The governing documents are **`docs/v2/aesthetic-passport-v2.html`**
(PRD) and **`docs/v2/V2_TASKS.md`** (tasks, interfaces, file ownership), as amended by **`docs/v2/V2_1_SPEC.md`**
(V2.1: journey, four product areas, Look Studio, QC, free/paid — wins where they conflict). `docs/MVP_BRIEF.md` is kept as V1 history
(D19). Also read: `docs/DECISIONS.md` (D19–D36), `docs/SCHEMA.md`, `schema/*.json`, `prompts/*.md`, `config/*.yaml`.

## Invariants (non-negotiable)

1. **Provenance layers.** CV → `input_quality` / `anchors` / `color_measurements`; model → `analysis` only;
   rules → `derived`. The model never writes derived fields; `analysis` is never mutated after validation.
   User feedback and preferences only enter `user_context` / `preference_events` and only affect `derived` (D26).
2. **Schema is the contract.** Any schema change bumps `schema_version` + prompt version, updates `examples/`,
   tests, and adds a DECISIONS entry.
3. **One production analysis model per request.** No live multi-model voting. Any evaluator model is offline only.
4. **Thresholds live in `config/*.yaml`**, not in code.
5. **Scope guard.** The only score is the D36 geometric harmony reference (`AI 面部美学参考分`, `scoring/`,
   `config/scoring.yaml`): deterministic, from CV landmarks, honest limited/unavailable states, never called an
   attractiveness verdict or a population rank. Percentiles (D37, `percentiles/`) give only an approximate position in
   a published, self-selected reference cohort. They require a `scoring_version` registered in
   `config/percentiles.yaml` and show ratio rails only for verified definitions. No medical/surgical/
   dermatology advice, no inference of ethnicity, age, gender identity, health, weight or body shape.
   `presentation` and body frame are user-selected or user-entered.
6. **Validate everything that crosses a boundary.** Model output → `validate_analysis` + `check_output_contract`;
   one repair retry in the same conversation, then fail loudly. Never retry on rules-layer outcomes.
   Assembled passport → `validate_passport`.
7. **Photos are sensitive.** Never committed (`data/`, `runs/`, `models/` are git-ignored). Non-front photos are
   deleted when the job ends, except the measurement photos the face workbench actually measured on (true side
   `profile90`, glasses-free `noglasses`, `smile`; D35), which live with the front photo, its thumbnail and previews
   for 24 h (retention job). The original file chosen in the framing editor never leaves the browser.
   Nothing photo-derived is logged.
   Outfit-check photos are deleted right after processing; `/geometry` polygons and the measurement points of every
   view expire with the front photo (24 h).
8. **Secrets** come from environment variables (`.env`, see `.env.example`). Never hard-code keys.

## Feature discovery, competitor reverse-engineering, and reuse (default)

- **Research before reinventing.** For unfamiliar or substantial features, first do a *focused* scan of
  actively maintained, clearly licensed GitHub projects and leading competitor websites/apps in the same
  category. Study their real user journeys, core workflows, information hierarchy, interactions,
  edge/failure states, and publicly observable or documented implementation approaches.
- **Reverse-engineer proven product behavior.** Aim to reproduce and adapt the best validated product
  logic, useful features, and UX patterns rather than inventing inferior alternatives. Treat inferred
  competitor internals as hypotheses, not facts. Implement our own design/code or reuse legitimately
  licensed components; never copy proprietary code, distinctive assets/branding, unclear-license code,
  or code incompatible with this repo's architecture.
- **Compare implementation options pragmatically.** Evaluate functional fit, dependencies, integration
  with the existing Python/FastAPI/Next.js stack, license obligations, project activity/maintenance,
  known bugs or limitations, and operational cost. Prefer compatible, mature libraries and patterns
  over building from scratch. If none fits, build the smallest sound original implementation.
- **Keep evidence lightweight.** Record the most relevant reference links, selected approach, and
  material licensing/compatibility trade-offs briefly in the issue or PR. This is working input for
  development, not an invitation to write a lengthy competitor report or repeat audits.
- **Ship and learn.** Time-box discovery; once an adequate path is clear, build a usable, demonstrable
  MVP, check the critical user journey, and iterate based on real results. This does not override the
  invariants, privacy/security requirements, or necessary boundary/schema checks above.

## How to work

- **Branch strategy:** `main` is the canonical integration branch. Always branch from the latest `origin/main` and target `main` with a PR; `v2` is historical. Follow the current issue/spec and relevant existing task order; do not rebuild old integration branches or pause for approval between implementation slices.
- **Agent handoff:** Claude Code implements and opens PRs. GitHub CI runs automatically; Codex may independently review through its account-level GitHub integration. Read PR comments and CI logs directly rather than asking the user to relay them. Fix actionable critical failures, then push to the same PR. Do not require a separate human copy-paste review step.
- **Merge policy:** Ordinary non-draft PRs may auto-squash-merge into `main` only after both the latest PR CI passes and Codex Code Review completes on the current head SHA with no unresolved findings, via `.github/workflows/auto-merge.yml`. If CI/review is missing, running, stale, malformed, or has unresolved findings, leave the PR open. Codex's machine-readable review summary is the gate, not GitHub's APPROVED state. New commits require a fresh Codex review. Do not automatically merge workflow, automation, deployment, secrets/permissions, identity/auth, payment, or known privacy/data-retention/storage critical-path changes. The workflow enforces known sensitive paths; for other changes materially affecting production safety, privacy, identity/auth, payment, or user-data integrity, developers must apply `manual-review` before expecting merge automation. `no-automerge` also opts a PR out. Sensitive PRs require a human **Squash and merge** even when CI and Codex pass. Keep the user out of routine copy-paste review loops; fix actionable findings on the same PR and let CI plus Codex re-evaluate.
- Verify changed behavior through its critical user path; inspect landmark overlays/masks when affected.
- **Stop and ask only for** (V2_TASKS §0 / MVP_BRIEF §10): a missing credential (after finishing everything that works with
  fakes; ask once, naming the variables), provider calls blocked by the environment, no test photos in `data/`
  at S2, a change that would breach an invariant above, any single action expected to spend > $5 in API calls,
  and deployment.
- Run `make test` after every change to `src/`, `schema/` or `config/`. Keep tests green. `make lint` clean.
- Everything must work with **no API keys**: `ANALYSIS_PROVIDER=fake`, `IMAGE_EDIT_PROVIDER=fake`, `PAYMENT_PROVIDER=fake`.
  The web app runs fully on fixtures with `NEXT_PUBLIC_USE_FIXTURE=1`.
- Every model API attempt is logged to `runs/<id>/calls.jsonl`; Passport `meta` only holds aggregates.
- Prefer small, readable modules over frameworks. Python ≥ 3.11, type hints, `ruff` clean. TypeScript strict.
- Log every prompt/rules/schema change that affects outputs in `docs/ITERATION_LOG.md`.
- Adapted MIT code keeps its license header and is listed in `THIRD_PARTY.md`.

## Commands

```bash
make install      # Python deps (core + pipeline + api + dev)
make models       # download MediaPipe model files into models/ (git-ignored)
make test         # pytest
make lint         # ruff
make sample       # rebuild the female + male fixture passports (examples/ → web/lib/fixtures/)
make types        # regenerate web/lib/passport.ts from schema/passport.schema.json
make passport PHOTOS=data/p01 CONTEXT=examples/sample_context.json   # CLI pipeline run
make dev          # API (:8000) + web (:3000)
cd web && npm test                      # vitest (components, adapters, tint, cards, copy)
cd web && NEXT_PUBLIC_USE_FIXTURE=1 npm run dev   # whole product on fixtures, no API
# Provider switches: ANALYSIS_PROVIDER · IMAGE_EDIT_PROVIDER · PAYMENT_PROVIDER (fake | real) — see .env.example
```

## Repo map

```
config/     rules.yaml · qc.yaml · models.yaml · face_metrics.yaml · scoring.yaml · hairstyles.json (adapted MIT catalog)
schema/     analysis.schema.json · passport.schema.json
prompts/    production_analyzer.md · image_edit.md · evaluator_rubric.md (offline, deferred)
src/aesthetic_passport/
            schema_io.py  rules.py  assemble.py  imaging.py  cv.py  qc.py  anchors.py  face_shape.py
            color_sample.py  analyzer.py  pipeline.py  masks.py  preview.py
            face_metrics/ (V3A registry-driven measurements, D34) · insights.py (measurement → advice, rules layer)
            scoring/ (AI 面部美学参考分, 35/25/25/15 on the front landmarks, D36)
            providers/ (analysis: base · deepseek · fake;  image/: base · qwen · fake)
            api/ (FastAPI app, SQLite job store, retention, rate limits)
web/        Next.js App Router front end (report renders from the passport JSON)
tests/      pytest suite (keep green)
examples/   sample_analysis.json · sample_context.json · sample_passport.json (fictional person)
docs/       MVP_BRIEF.md · DECISIONS.md · SCHEMA.md · ITERATION_LOG.md · PLAN.md (superseded) · EVAL.md
```
