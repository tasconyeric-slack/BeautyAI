# P0: Report lost after hair preview — confirmed Render incident (2026-10-28)

## Verified production facts

- Render service: `aesthetic-passport-api` (`srv-dbcnqgmi0phs73fenou0`) in workspace `Tascon`.
- **Actual service plan is Free** (512 MiB); it is **not** the `starter` plan in the prior `render.yaml`, nor does a Free instance support attached persistent disks.
- Render events: OOM kills at 02:07:13, 02:12:45 and 03:11:22 UTC on 2026-10-28 (memoryLimit 512 MiB).
- Sanitized trace: unlock request returned 200, hairstyle `POST /previews` returned 202, instance OOM-killed ~40 seconds later, then restarted. A separate trace directly showed an existing report returning 200 before OOM and 404 immediately after restart.
- **Cause:** memory-intensive CV + hairstyle image processing on 512 MiB; SQLite (`RUNS_DIR=/data/runs/app.db`) and media are on the Free service's ephemeral filesystem. Restart loses the report and its purchase/invite entitlement record. Updating only the front-end cannot restore them.
- Existing reports lost from ephemeral storage cannot be reconstructed from the new, empty SQLite database. Do not imply otherwise.

## Required owner action on the **existing** Render service (not a new project)

**Not automatically performed by this PR:** plan and disk changes incur charges, and editing a repository Blueprint does not reconcile the already-created service.

1. Open https://dashboard.render.com/web/srv-dbcnqgmi0phs73fenou0.
2. Before changing plans or restarting, preserve any still-reachable reports through the application's authorized export/download paths. Migrating a Free instance may destroy its ephemeral files. Do not log, copy, or share users' photos.
3. Under **Settings > Instance Type**, select at least **Standard / `1c-2g` (2 GiB RAM)**. Do not select Starter / `0.5c-512mb`: it offers the same 512 MiB and only solves the disk eligibility problem.
4. Under **Disk**, attach a persistent disk with **mount path `/data`** (start with 1 GiB, monitor usage). Keep `RUNS_DIR=/data/runs` from Dockerfile. Verify `/data/runs/app.db` is on this volume.
5. Configure **Health Check Path `/api/health`**. Consider disabling `autoDeploy` for this backend during the incident, because the current main-branch auto-deploys occur on changes unrelated to the API. Re-enable deliberately after ensuring the disk is attached.
6. Watch Render events and logs for memory kills, then run **one** test with an approved synthetic portrait: upload -> complete -> unlock via test invite/mock (not real payment) -> request one hairstyle -> wait for success/fallback -> refresh. Check the same report after a controlled deploy/restart, and after a 24-hour media expiry (text still accessible for its retention period).
7. Never keep the production claim of seven-day report access enabled while running on ephemeral SQLite storage. Failed hairstyle generation must not erase completed reports.

## Repository defenses in this PR

- Declare Standard 2 GiB + existing persistent disk in `render.yaml` for future Blueprint deployments.
- Set mask/preview batch concurrency to 1 instead of 3. This reduces overlapping peak memory, but **does not make 512 MiB safe**.
- Reconcile pending preview jobs on process startup: stale work is marked fallback/retryable, keeping paid entitlement unchanged.
- Do not replace a currently loaded report with a misleading "deleted" screen on transient missing-record 404. A fresh load still correctly reports missing data, with a retry action rather than promising restoration.
- A small regression test covers interrupted-job recovery.

## What remains

- This PR does not change the existing Render service tier, attach a disk, migrate historical reports, recover deleted purchases, or certify hairstyle quality.
- A real production-like end-to-end test requires the owner to complete the service plan/disk actions first.
