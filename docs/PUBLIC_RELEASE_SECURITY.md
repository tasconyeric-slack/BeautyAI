# Public-repository release gate

This is a one-time security checklist, **not** a request to publish the existing repository.
**Keep the original repository private until the owner explicitly approves publication.**

## Current preliminary findings (2026-10-24)

- The tracked `.env.example` uses empty credential fields; application and deployment configuration read provider keys from environment variables.
- The `main` Git commit metadata includes author email addresses from personal email providers. The old commit history must **not** be assumed anonymous.
- The existing repository contains PNG documentation screenshots and illustrative demo media. A filename or fixture label does **not** prove that an image contains no private portrait or metadata.
- `.gitignore` now blocks common environment/credential files and unreviewed new photos, but ignore rules **do not protect already tracked files or old commits**.
- Open feature PRs and older development branches may contain code and comments not covered by a scan of `main` alone.

## Required before making anything public

1. **Prefer a new public repository with a single, audited source snapshot**, keeping this repository, its historical commits, PRs, issues, Actions history and artifacts private. Avoid blindly mirroring Git history.
2. Inspect all files in the export, especially screenshots, SVGs, sample passports, test data, archives, image metadata and generated build outputs. Only keep fictional, licensed or explicitly authorized media.
3. Run a local full-history secret scan of the source repository (for example Gitleaks against `--all` refs), plus a scan of every tracked file in the clean export. Review findings without printing credentials in issues, CI or PR comments.
4. Review old PR descriptions/comments and Actions logs/artifacts **if considering changing this original repository's visibility**: GitHub makes Actions logs public when the original repository is made public.
5. Verify that no real API keys, tokens, invitation/unlock codes, credentials, personal email addresses, user photos, provider request/response logs, production database files or end-user reports appear in the export. Rotate/revoke exposed credentials before publication; deleting a file alone does not invalidate a key.
6. Verify every `NEXT_PUBLIC_*` value is safe to disclose. Keep real provider keys and salts only in Render/Vercel's server-side secret configuration; never ship them in frontend code or fixtures.
7. Confirm licenses and provenance of committed assets, test portraits, fonts, model artifacts, reference data and external code.
8. Review public-fork CI permissions and auto-merge: external fork PRs must not gain privileged secrets or merge automatically. The current auto-merge workflow rejects fork PRs and explicitly gates workflow/security/deployment file changes.
9. After the public snapshot passes one critical-path CI run, repoint integrations intentionally; do not expose the original repository or delete existing PR work as a shortcut.

**Release status: NOT CLEARED.** The snapshot, all images, every historical blob and old run artifact have not yet been independently verified.
