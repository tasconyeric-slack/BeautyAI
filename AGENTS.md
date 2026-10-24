# Agent instructions for this repository

**`CLAUDE.md` is the canonical repository-wide development policy for all coding agents, including Codex.** Read it before planning or editing code. Its invariants, workflow, commands, and source-of-truth references also apply here.

In particular, follow **“Feature discovery, competitor reverse-engineering, and reuse (default)”** in `CLAUDE.md`:

1. For unfamiliar or substantial features, briefly inspect actively maintained, license-clear GitHub implementations and relevant competitor websites/apps before writing a new implementation.
2. Reverse-engineer proven user journeys, product logic and UX; compare implementation fit, dependencies, architecture compatibility, licenses, maintenance, limitations and cost. Prefer verified, compatible OSS/components when helpful.
3. Never lift proprietary source, branding or assets, or copy unknown-license/incompatible code. Adapt patterns using original work or properly licensed sources, documenting required attribution.
4. Keep research targeted, summarize useful references and the chosen trade-off briefly in the issue/PR, then implement a runnable MVP and verify its critical path. Avoid repeated speculative audits while preserving mandatory safety, privacy, schema and integration checks.

For details or conflicts, defer to `CLAUDE.md` and the governing project specifications it names. Do not maintain a divergent copy of those rules here.

## Code Review Rules

- **Data contract:** Flag consequential violations of the CV / model / rules provenance boundaries, broken schema compatibility, or missing required validation. Refer to `CLAUDE.md` for the safe path.
- **Photo privacy and credentials:** Flag exposure of secrets or personal photographs in Git, logs, analytics, or long-lived storage, and changes that defeat required retention or deletion behavior.
- **User-critical paths:** Flag demonstrable regressions in upload, QC, report assembly, and real-image preview (including silent fallback when the UI promises a real result). Focus on actionable P0/P1 issues; leave stylistic preferences and speculative refactors out of PR review.
