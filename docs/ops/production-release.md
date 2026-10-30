# Production release candidate — preparation only

Updated 2026-10-29 America/New_York. No production mutation, paid resource creation,
restart, migration or deploy was performed. Latest instruction: exclude Render as
destination; prioritize mainland China providers and major clouds, free first,
otherwise about USD 10/month or less. A preference is not purchase/deploy authorization.

## Verified version and access boundaries

- #57 merged: `37cb5b9a8d40de5a34cfeca82212f1ad0eed591e`.
- #58 subsequently merged externally at `2026-10-30T03:01:33Z`:
  `c93d80211d8e208b384ad45e9a5c1b2ff918f83f`. Its reviewed head was
  `7268bfe8797627d9ebacf7daa72af769c253e4d4`. Use the merge SHA, not the old head,
  as the minimum backend candidate. This task did not merge #58.
- This config PR adds no backend/web implementation. #49 stays a reference only.
- Render and Vercel connectors failed with transport errors to
  `https://chatgpt.com/backend-api/ps/mcp` (initial and subsequent attempts).
  No Render/Vercel CLI or corresponding credential environment variable was available.
  Windows browser fallback was blocked by its URL-policy support limitation.
- Consequently the **actual** service ID, region, plan, disk, RUNS_DIR, process count,
  deploy SHA and health are **unverified**; so are the Vercel production deployment ID,
  SHA, domain and build-time `NEXT_PUBLIC_API_BASE`. GitHub deploy history returned no
  entries. Successful Vercel PR checks are not proof of production domain assignment.
- #49/#58 incident evidence records Free/512 MB OOM and ephemeral report loss.
  This is historical evidence, not a refreshed production inventory.
- Frontend owner subsequently delivered PR #60 at
  `3f457bf77f800842e7a5cd4be4324878368b58c4`, based on backend merge `c93d802`.
  Local API/Studio integration passed using approved synthetic media. Its new-report
  analysis/payment were explicitly fake; a real analysis path remains a cloud gate.
  #60's eventual main merge SHA and this PR's merge SHA must be recorded before
  release. Neither PR head is claimed as an existing production deployment.

## Budget decision (three shortlisted options)

Prices checked against official pages on this date; before tax, usage and provider
model calls. No workspace upgrade, new domain purchase or paid backup is assumed.

| Option | Fixed infrastructure cost | Decision |
| --- | --- | --- |
| Tencent Lighthouse x86 trial, preferably 2 CPU / 4 GB / 60 GB disk | $0 compute for one month if product-new-user eligibility and stock pass; official also lists 2 CPU / 2 GB trial | **First free prototype candidate**, preserving architecture. Confirm exact renewal quote before production: one month is not forever free. Prefer 4 GB host headroom. |
| Alibaba ECS x86 trial; fallback economic e 2 CPU / 2 GB / 40 GB, 3 Mbps | Trial: RMB 300 personal credit, 3-month eligibility window, hourly cap RMB 0.833 and regional traffic quotas. Paid official campaign: **RMB 99/year** (= RMB 8.25/month average, annual prepayment) | **Preferred low-cost sustained fallback** if eligible. Credits do not imply three months continuously free: official example exhausts 300 in about 15 days at hourly cap. Confirm campaign region/eligibility/renewal and 2 GB memory peak in prototype. |
| Oracle Always Free Ampere A1, up to 2 OCPU / 12 GB, within 200 GB block volume total | $0 within actual home-region free quotas | **Long-term free candidate**, subject to capacity, account eligibility and idle reclamation. ARM must pass full Docker/CV prototype before selection; no production claim based on RAM alone. |

Official sources:
[Tencent official trial](https://cloud.tencent.cn/act/pro/free),
[Alibaba ECS trial rules](https://help.aliyun.com/zh/ecs/user-guide/ecs-free-trial),
[Alibaba official 99 campaign](https://cn.aliyun.com/activity/ecs/99program),
[Oracle Always Free quotas](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).
The Alibaba campaign was available in the official search index; direct page retrieval
timed out. Its checkout price and eligibility remain unverified; no promotional
community article is treated as a binding quote. Oracle's current free quota is
2 OCPU / 12 GB, not old 4 OCPU / 24 GB tutorials.

First reuse an already-owned, always-on x86 Linux host with >=4 GB RAM and sufficient
durable disk, if available: $0 incremental compute. Such a host is not currently
confirmed. A developer laptop/tunnel is not an unattended production substitute.
User confirmed existing Alibaba/Tencent accounts, no previous VM trial, an available
domain and no mainland filing yet. Other major-cloud accounts can be created by
the user if needed. This supports testing domestic-cloud eligibility first; it does
not prove a trial can be claimed or authorize claiming it. No free host has yet
been verified inside those accounts. Recommend Tencent 4 GB trial first, then Alibaba
99/year as the sustained paid fallback; do not consume both trials automatically.
Keep Vercel's existing tier; confirm its commercial-use eligibility and current bill
before assuming $0. Real DeepSeek/Qwen usage remains separately metered: $10 is
not a guarantee of the total bill at arbitrary traffic.

These VM options need OS patches, firewall, TLS, monitoring and safe database backups.
Use an x86 VM first for minimum integration; the current PyPI MediaPipe 1.2.0 index
also lists a Linux aarch64 wheel, so ARM is not categorically unsupported. A wheel
listing does not prove the existing pipeline runs there. No backend rewrite is planned.

AWS new-account Free Plan is up to six months with $100 initial and up to $100 earned
credits, not a perpetual free VM ([official FAQ](https://aws.amazon.com/free/free-tier-faqs/)).
Azure's free catalog distinguishes 12-month and always-free services; no sufficient
always-free Docker host was verified ([catalog](https://azure.microsoft.com/en-us/pricing/free-services/)).
Cloudflare Workers' 128 MB runtime is not a drop-in host for this native CV + SQLite
Docker application ([limits](https://developers.cloudflare.com/workers/platform/limits/)).
Its free edge services may complement a VM, but replacing the backend would exceed
this task. No AWS/Azure credit is assumed available in this user's account.

Mainland launch gate: Alibaba states its pay-as-you-go trial does not qualify as a
domestic-site filing resource; Tencent's trial page gives minimum purchased-duration
requirements. Confirm the chosen domain and actual provider filing prerequisites
before calling a mainland public website ready. A Hong Kong trial may simplify that
resource prerequisite but is not a mainland region. Do not silently change region.
Test Vercel access from the intended mainland audience and provider/API reachability;
coordinate any frontend host change with the frontend owner rather than duplicating it.

## Retention gate

The old Render destination proposal is withdrawn. Its disk snapshots retain seven days. A `/data` media copy
may therefore survive beyond 24 hours even after the app purges it. The published
docs do not establish an option to disable snapshots. **Do not apply the Render
disk plan; Render is excluded by the user's instruction.**
No exception to 24h retention is requested or assumed. For the VPS candidate, do
not enable host/disk snapshots or media backups; verify provider backup settings.
Keep original `media_expires_at`, strict read-time expiry, startup/hourly purge,
and report JSON TTL. Never copy photos to this PR, progress package or chat.
No swap containing photo data and no core dumps should be enabled on that host.

## Exact release record required before execution

Fill this in the private progress file, not with secrets: source service ID/region,
source deploy SHA and old immutable deployment ID, actual RUNS_DIR/database path,
disk usage and peak memory, desired backend merge SHA, frontend merge SHA,
Vercel production deployment ID/domain and old rollback ID, public API origin,
WEB_ORIGINS/SHARE_BASE_URL, timestamp and release operator. Final SHAs must include
both this reviewed configuration and the frontend owner's merged work.
If either platform already deployed the desired SHA, inspect it; don't trigger
another deploy. A public health response alone does not prove deployed Git SHA.

`render.yaml` remains unchanged; no new Render plan or Blueprint sync is proposed.
Docker now explicitly uses one worker, regardless of WEB_CONCURRENCY. On a VPS,
`docs/ops/compose.yaml` reuses this image with a bind mount and loopback-only API.
Neither config should be applied until the release gates pass.

## Execution sequence after one explicit authorization

1. Operator restores read-only platform access and completes the release record.
   Owner approves the exact host, region, all-in recurring quote <= about $10,
   maintenance window and production changes (including a $0 trial). Human reviews/squash-merges this
   manual-review PR; no agent merge. Read the frontend owner's `03_联调进展.md`.
2. If using a new VPS, owner authorizes its creation. Operator provisions x86 Linux,
   firewall (SSH restricted to operator, HTTPS public), security updates and existing
   reverse proxy with valid TLS. No database/API port is publicly exposed. No
   provider snapshots/media backups. No production secrets in Git or command output.
   Prepare `/etc/beautyai/api.env` mode 600 on the server with existing provider,
   payment and IP_HASH_SALT secrets unchanged, explicit WEB_ORIGINS and SHARE_BASE_URL;
   copy by secure secret channel. Never print that file. Compose enforces
   APP_ENV=production, mocks disabled and preview debugging off. The isolated no-key
   rehearsal must use a separate override with development/fake providers and no
   public ingress; never deploy that override for real users.
3. Build the approved SHA before touching the source. On that host, from the checkout:

   ```sh
   test "$(git rev-parse HEAD)" = "$RELEASE_SHA"
   docker compose -f docs/ops/compose.yaml config --quiet
   docker compose -f docs/ops/compose.yaml build api
   # Determine the actual image user; initialize a NEW empty host directory with its UID/GID.
   docker run --rm --entrypoint id "beautyai-api:$RELEASE_SHA"
   ```

   Never chown an existing data tree blindly. Verify the mounted directory is writable
   by the image user in an isolated, empty test directory. Complete a synthetic
   no-key run on the destination before transferring any personal data.
4. At the authorized window, prevent writes at the existing ingress and drain active
   jobs. **Do not upgrade/restart/attach a disk before preservation**: those actions
   can destroy ephemeral source data. Free Render may lack shell/SSH export; if no
   supported consistent export exists, stop. Do not improvise by upgrading first.
   Already lost data cannot be recovered by this PR. Keep the old service running.
5. With all writers drained, take a SQLite-native backup, not a live copy of app.db
   without its WAL. In the source shell, with operator-set paths to a fresh private
   staging directory outside any delivery package:

   ```python
   import os, sqlite3
   from contextlib import closing
   from pathlib import Path
   source = Path(os.environ['SOURCE_RUNS']).resolve(strict=True)
   stage = Path(os.environ['PRIVATE_STAGE'])
   stage.mkdir(mode=0o700, parents=False, exist_ok=False)
   with closing(sqlite3.connect((source / 'app.db').as_uri() + '?mode=ro', uri=True)) as src:
       with closing(sqlite3.connect(stage / 'app.db')) as dst:
           src.backup(dst)
           assert dst.execute('pragma integrity_check').fetchone() == ('ok',)
   ```

   Preserve report/payment/preferences/share rows and timestamps unchanged. Transfer
   the database and **only still-live, nondeleted matching media directories**, using
   SSH/SFTP directly between operator-approved hosts. No uploads/debug/expired media,
   no unencrypted tarballs on laptops, no overwrite of an existing destination DB.
   Carry operational call logs if required, without displaying contents. Compare
   DB table counts/integrity and file hashes privately; do not publish IDs or hashes.
   Staging copies must be removed by each photo's ORIGINAL deadline, including on
   failure; if this cannot be guaranteed, migrate only database records and obtain
   a separate product decision about unavailable old photos. Do not reset expiry.
6. Restore into a NEW destination runs directory, run existing TTL purge before
   opening ingress, then start only one API instance. Check `/api/health`, mount,
   effective database path, worker count, TLS and CORS. Do not use a Render build,
   pre-deploy or one-off job to restore its disk: it is only mounted at runtime.
7. Frontend operator sets `NEXT_PUBLIC_API_BASE` at BUILD time to verified HTTPS API
   origin and ensures fixture mode is off. Reuse a correct existing deployment;
   otherwise create one approved production build, smoke-test then assign the domain.
   Changing the env value alone does not replace a compiled NEXT_PUBLIC value.
8. One approved synthetic portrait: upload/QC -> report -> real preview or truthful
   recoverable rejection -> reopen. Perform one supported destination API restart;
   same report/payment state must survive and pending previews become retryable.
   Verify expired media/geometry returns unavailable while retained report JSON
   remains readable. Inspect peak RSS and disk headroom. No mass real-provider runs.

Allow 30–60 minutes for the first migration/validation window (planning allowance,
not a measured outage). Render disk deployments themselves have a brief outage;
VPS cutover outage is dominated by write drain, transfer and smoke test. Abort if
data cannot be exported consistently, provider keys fail in the destination region,
TLS/CORS fails, OOM recurs or TTL changes. Do not declare a successful release then.

## Rollback without destroying data

Before cutover: leave old production unchanged, keep destination ingress closed,
remove staged media by original deadlines; no public impact. Do not delete resources
or charge for a replacement without authorization.

After cutover: block new writes at ingress first. If no new writes occurred, the
frontend operator can restore the recorded previous Vercel deployment/API origin.
If writes/payment updates occurred, do NOT route back to an older SQLite snapshot.
Keep the authoritative destination disk, use a reviewed compatible previous image
against that disk, or reconcile writes offline before routing back. Confirm original
expiry and unchanged salts/secrets. A rollback must not resurrect deleted photos.
Render rollback may reuse old environment variables; verify RUNS_DIR and single-worker
settings explicitly. It does not roll back disk contents. Never use whole-disk
snapshot restoration as an automatic SQLite rollback. No downgrade to 512 MB.

## Verification status

Local configuration schema/lint and SQLite-native backup/restore rehearsal are
recorded in the task progress file. No Docker daemon is installed on this host;
image build, Compose runtime, VPS/proxy setup, live provider access and production
restart/retention remain unverified gates. Preparation is reviewable, not a release.
