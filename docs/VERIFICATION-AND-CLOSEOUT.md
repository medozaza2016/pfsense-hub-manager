# Verification and documentation closeout

**Closeout date:** November 22, 2026 (America/New_York)  
**Active branch:** `main`  
**Branch status:** The multi-site onboarding and Linux deployment work is merged into `main`. The System Monitoring & Recovery frontend preview was subsequently merged through PR #10.  
**Purpose:** Record the actual local, container, clean-install, and browser verification performed for this increment. This record supersedes older pending-verification statements in planning documents where those statements cover the checks recorded below.

## 1. Outcome

The current feature branch has passed the documented clean Linux installation and the tested Hub access workflow on the prepared Debian 13 Proxmox LXC baseline. The Hub application and its restricted Linux Host Agent are installed by one Linux installer. The API-to-agent Unix socket and bearer-authenticated retrieval handshake succeeded, and GUI-managed Hub access was enabled automatically only after the installer health and handshake checks passed.

The user also completed the Hub Settings Tailscale deployment from the browser. The UI reported **Endpoint verified**, with configuration revision 2 and applied revision 2. The verified MagicDNS HTTPS endpoint loaded from the browser. The save-button progress animation was subsequently tested in the browser and confirmed working by the user.

This is a successful installation and Hub access acceptance result for the tested Linux/Tailscale path. It is not a production-readiness sign-off for all product capabilities.

## 2. Windows local validation

**Source revision used for the Windows command run:** `a2dc653863a9da1da4200d98626bfc828059c0f2`  
**Environment:** Windows 11, Git Bash / UCRT64, Node.js and npm.

| Command | Result | Recorded detail |
|---|---|---|
| `npm ci` | Passed | 196 packages installed; npm reported 0 vulnerabilities. npm displayed install-script approval warnings for esbuild packages, but installation continued and subsequent build succeeded. |
| `npm test` | Passed with skips | 16 test files passed, 1 skipped; 177 tests passed, 4 skipped, 181 total. |
| `npm run typecheck` | Passed | API and web TypeScript checks completed. |
| `npm run build` | Passed | API TypeScript build and web TypeScript/Vite production build completed. |

The four skipped tests are the Unix-domain-socket client tests in `apps/api/src/deployment-agent-client.test.ts`, which are explicitly skipped on Windows (`process.platform === "win32"`). They are not counted as passed.

The Vite build emitted a non-fatal warning that the `use client` module directive from React Router's development module was ignored by the bundler. The production build completed successfully.

## 3. Windows PowerShell setup boundary

The repository contains `scripts/setup-encryption-key.ps1`, but does **not** contain a complete `install-windows.ps1`. The existing script generates and protects the Windows application encryption key and displays the one-time recovery copy; it does not prepare the full environment or start Docker Compose.

The documented Windows Docker Desktop setup is:

```powershell
if (Test-Path .env) { throw "Preserve and inspect the existing .env before setup." }
Copy-Item .env.example .env
New-Item -ItemType Directory -Force .\secrets\runtime, .\certs, .\run\host-agent | Out-Null
if (-not (Test-Path .\secrets\pfsense_api_key)) {
  New-Item -ItemType File .\secrets\pfsense_api_key | Out-Null
}
notepad .env
.\scripts\setup-encryption-key.ps1
docker compose config
docker compose up -d --build
docker compose ps
```

Set a strong unique alphanumeric `POSTGRES_PASSWORD` in `.env`, leave legacy firewall bootstrap values blank for a zero-site Hub, and keep the deployment-agent token/socket empty with `HUB_ACCESS_DEPLOYMENT_ENABLED=false`. This is the Windows local-development procedure, not an automated production installer. The Windows npm tests/typechecks/build are separate validation commands, listed in Section 2 above.

## 4. Linux Host Agent and existing-host checks

On the existing working Debian 13 LXC, after updating to `a2dc653`, the following checks completed:

- `bash -n scripts/install-linux.sh`: passed.
- `bash -n host-agent/install-linux.sh`: passed.
- `python3 -m unittest discover -s host-agent -p 'test_*.py' -v`: **23 tests passed**.
- `docker compose config --quiet`: passed.
- Docker Compose showed the API, web, and PostgreSQL containers healthy.

The Node.js/npm development commands were not run on the production LXC. Node.js and npm are intentionally not host prerequisites; the application builds inside Docker.

## 5. Clean Debian 13 installation

**Prepared baseline:** Debian GNU/Linux 13 (Trixie) Proxmox LXC template with administrator access, systemd, Docker Engine, Docker Compose v5, Git, OpenSSL, Python 3.13, iproute2, and Tailscale already installed.

**Install source revision reported by the installer:** `d89af6a`.

The operator cloned `feature/multi-site-onboarding` to `/opt/pfsense-hub` as root and ran:

```bash
sudo bash /opt/pfsense-hub/scripts/install-linux.sh
```

All six installer phases completed:

1. Compose configuration validation passed.
2. The standard Linux Host Agent installer ran automatically and enabled the systemd service.
3. The agent service and Unix socket became ready.
4. The web, API, and PostgreSQL images/containers were built and started. All three services reached healthy status.
5. The installer verified the API process supplementary group, group-writable Unix socket, and bearer-authenticated Host Agent request. The expected stale-deployment response for a deliberately unknown deployment ID confirmed the authenticated retrieval path.
6. The installer atomically enabled `HUB_ACCESS_DEPLOYMENT_ENABLED=true`, recreated the API container, and verified it healthy.

The final installer output reported:

- `pfsense-hub-api-1`: healthy.
- `pfsense-hub-db-1`: healthy.
- `pfsense-hub-web-1`: healthy.
- Host Agent: active and enabled under systemd.
- GUI-managed Hub access: enabled.
- Tailscale CLI: detected.

The operator confirmed that the application encryption recovery key was saved. The value printed in the captured terminal transcript must be treated as exposed and must not be reused. This disposable test installation is not a source of key material for any retained environment. A fresh installation generates a new random key; normal restart, rebuild, or update does not rotate an existing key.

## 6. Hub access and browser verification

The operator opened the Hub through an SSH local tunnel, selected Tailscale in **Administration → Hub Settings**, and saved the host's MagicDNS hostname on HTTPS port 443.

The browser displayed:

- **Endpoint verified**
- Configuration revision **2**
- Applied revision **2**
- Recent deployment revision 2, state `succeeded`
- A last-verified HTTPS MagicDNS origin

The browser was able to open the verified endpoint. The save action was subsequently refined: while an access deployment is active, the button displays a spinner and phase-specific progress text, the endpoint fields and method tabs are disabled, and the button remains busy until a terminal deployment state is returned. The user confirmed the updated progress interaction works after rebuilding the web service.

The Linux agent provisions only the fixed private Tailscale Serve route to the local Hub web service. It does not install or authenticate Tailscale, enable tailnet HTTPS, configure ACLs or DNS, or create Funnel. The Hub installer does not change an already prepared host's Tailscale identity.

## 7. Scope that remains incomplete

The following are not covered by the successful installation/access test and must not be represented as complete:

- A second real firewall, including the deferred pfSense CE site, has not been connected and validated.
- The first Plus firewall's historical eight-endpoint diagnostic test used a temporary TLS verification bypass. That bypass is historical: on November 23, 2026 the manager client collected all eight operations over a validating TLS connection using a device-scoped CA bundle and a pinned server name, so a separate trusted-certificate validation is no longer outstanding. See section 15.2.
- The exact installed pfSense REST API package version is not recorded.
- Background polling scheduling, bounded concurrency, retry/backoff, and poll-history retention are implemented and unit-tested (DEC-043). The scheduler is enabled in the local Docker Compose deployment, where consecutive scheduled cycles were observed on November 23, 2026; other installations keep it disabled (`PFSENSE_POLLING_ENABLED=false`) until an operator activates it. See section 16.
- Firewall configuration-changing operations are not implemented or authorized. The integration remains a fixed read-only GET allowlist.
- The remaining preview pages do not all display live firewall telemetry.
- Windows Docker Desktop has no production-equivalent systemd Host Agent. Automatic host access deployment is Linux-only.
- LAN and Custom modes require an operator-managed hostname/IP and trusted HTTPS reverse proxy. Hub Manager does not provision certificates, DNS, or that reverse proxy.
- Database backup/restore, retention policy, and disaster-recovery restore drills remain incomplete.
- Application encryption-key rotation is not implemented. Never replace the key while encrypted credentials or TLS trust material exist.
- Full migration testing from a preserved existing-data copy, multi-device isolation with two real firewalls, and production security review remain outstanding.

## 8. Local verification commands

Run these on the Windows development workstation from the repository root:

```powershell
npm ci
npm test
npm run typecheck
npm run build
```

Run the Linux Host Agent tests on a Linux development/test host:

```bash
python3 -m unittest discover -s host-agent -p 'test_*.py' -v
```

The production Linux CT does not need Node.js or npm installed. Its first-install acceptance is the documented clean-Linux procedure plus the installer checks and browser verification above.

No hosted CI workflow is used for this project by the current workflow decision. These are local, operator-run checks. Do not describe a skipped test as passed.

## 9. Delivery boundary

This closeout records a successful feature-branch implementation and verification. It does not authorize a merge into `main`, a branch deletion, a production release, firewall write operations, or a change to the deferred second-firewall transport decision. Those require separate user direction.


## 10. System Monitoring & Recovery frontend merge status

**Pull request:** [#10, Add System Monitoring & Recovery UI preview](https://github.com/medozaza2016/pfsense-hub-manager/pull/10)  
**Merge target:** `main`  
**Merge method:** Squash  
**Merge commit:** `9a55bfc4c7e5e165b16881f752232168558fcae6`

The merged frontend adds the Administration navigation entry and `/settings/system-recovery` route, with a dedicated page containing host-resource placeholders, Web/API/PostgreSQL service health placeholders, disabled service and stack controls, service-log and Compose-validation placeholders, and host-side recovery guidance. The code-server service is explicitly excluded. The UI states that live monitoring and operations are not connected.

**Not verified by this merge:** No browser visual test, new typecheck, automated test run, production build, deployment, or live Host Agent operation was performed for PR #10 in the available evidence. The user's subsequent Application Settings screenshot showed the existing two-card page but did not show the System Monitoring & Recovery navigation item. Therefore, do not assume that the browser was running the merged web image. Confirm the local repository is updated to `main`, rebuild/recreate the web service, and inspect the new page before treating visual acceptance as complete.

The page is a frontend-only milestone. Host metrics, service status, bounded logs, Compose validation, service/stack operations, role enforcement, audit events, and recovery tests remain future implementation work under DEC-026 and DEC-027. See [System Monitoring & Recovery requirements and implementation plan](SYSTEM-MONITORING-RECOVERY.md).

**Superseded by section 12**, which records the implemented backend, agent, and browser verification. Section 10 remains the historical record of the PR #10 merge.

## 11. Linux source validation and dependency lockfile fix, November 22, 2026

**Environment:** Ubuntu Docker host, Node.js 22.23.3, npm 10.9.9, Docker 29.10.0. This is the first recorded Linux source validation run; the Windows figures in sections 2 and 8 remain the historical record of that separate run and were not re-measured.

**Failure observed:** `npm ci` followed by `npm test` aborted before executing any test file with `Error: Cannot find module @rollup/rollup-linux-x64-gnu`. The committed `package-lock.json` contained no `@rollup/*` package entries and only `@esbuild/win32-x64`, because it had been generated on Windows and npm records optional binary dependencies for the resolving platform only (npm/cli#4828).

**Fix:** the lockfile was regenerated in a scratch copy of the workspace manifests with explicit platform overrides and then adopted:

```bash
npm install --package-lock-only --os=linux --os=win32 --cpu=x64 --libc=glibc --libc=musl
```

`--os`, `--cpu`, and `--libc` are npm 11 options; the regeneration used npm 11 while the repository continues to be validated with the installed npm 10.9.9. It added 76 platform-specific entries (all Rollup and esbuild optional binaries, including `@rollup/rollup-linux-x64-gnu` and `@rollup/rollup-linux-x64-musl`) and removed none. Four packages changed at patch level within their existing ranges: `rollup` 4.68.7 → 4.68.8, `@rollup/rollup-win32-x64-msvc` 4.68.7 → 4.68.8, `fast-json-stringify` 7.3.7 → 7.3.10, and `caniuse-lite` 1.0.30001826 → 1.0.30001827. No runtime dependency was added or removed.

**Results on Linux:**

| Command | Result | Recorded detail |
|---|---|---|
| `npm ci` | Passed | 196 packages installed, 199 audited, 0 vulnerabilities; `@rollup/rollup-linux-x64-gnu` and `@esbuild/linux-x64` present in `node_modules` |
| `npm test` | Passed | 17 test files, 217 tests passed, none skipped |
| `npm run typecheck` | Passed | API and web TypeScript checks completed |
| `npm run build` | Passed | API TypeScript build and web TypeScript/Vite production build completed |
| `docker build --no-cache -f apps/web/Dockerfile .` | Passed | Alpine image built with `npm ci` alone; 41 modules transformed, no manual Rollup binary injection |

The previous ad-hoc workarounds were removed: `apps/web/Dockerfile` no longer runs `npm pack` to fetch `@rollup/rollup-linux-x64-musl`, and the unreferenced `scripts/repair-rollup-linux.mjs` helper was deleted. See DEC-037.

## 12. System Monitoring & Recovery live verification, November 23, 2026

**Environment:** Ubuntu Docker host, commit `eb008f5`, unprivileged development Host Agent (`scripts/dev-host-agent.sh`), local `.env` with `HUB_HOST_MONITORING_ENABLED=true`, `HUB_HOST_OPERATIONS_ENABLED=true`, and `HUB_HOST_OPERATION_TIMEOUT_MS=180000`. The API container was recreated and its environment verified.

**Results:**

| Check | Result |
|---|---|
| `docker compose up -d --build api web` | Rebuilt and restarted; `api`, `db`, and `web` all healthy, bound to `127.0.0.1:3001` and `127.0.0.1:8080` |
| Served web bundle | Contains the implemented System Monitoring & Recovery page (`index-B58j0DIx.js`) |
| Agent protocol v2 `system.status` | `state: "ok"` with live host metrics and `web`/`api`/`db` container state and health |
| Agent protocol v2 `system.logs` | `state: "ok"`, 5 lines, `truncated: false` |
| Agent protocol v2 `compose.validate` | `state: "valid"` |
| `system.operationResult` with unknown id | `OPERATION_NOT_FOUND` |
| `system.operation` with `action: "delete"` | `OPERATION_ACTION_UNSUPPORTED` |
| Migration 015 | `host_operations` applied with `host_operations_single_active` partial unique index and action/target/state constraints |
| Unauthenticated `GET /api/v1/system/status`, `GET /api/v1/system/operations` | `401` for both |
| Browser session | `/api/v1/system/status` polled every 10 s returning `200`; `POST /api/v1/system/compose/validate` returned `200` |
| Live stack operation from the browser | `restart` on target `stack`, request id `req-f`, actor `ahmed`, `requested` `2026-11-23T05:06:48Z` → `verified_at` `05:06:49Z` → `succeeded` `05:06:50Z`; agent journal matched with `verified: true`; all containers returned to healthy |

**Note on ordering:** the operator-initiated stack restart overlapped the image rebuild for this verification. Both completed successfully; the stack came back healthy with the new API environment.

**Still outstanding:** the stack-stop recovery rehearsal (stop the stack and recover it from a host shell without the GUI), an observed single-service `start`/`stop`/`restart` in the browser, visual acceptance against the approved mockup for this page, and any deployment to a production host or systemd-managed agent. No firewall configuration was changed and no pfSense endpoint was contacted.


## 13. Mobile navigation change and monitoring/recovery feature lock, November 23, 2026

**Environment:** Ubuntu Docker host, local `.env` with `HUB_HOST_MONITORING_ENABLED=true`, `HUB_HOST_OPERATIONS_ENABLED=true`, and `HUB_HOST_OPERATION_TIMEOUT_MS=180000`, unprivileged development Host Agent (`scripts/dev-host-agent.sh`).

**Change:** the Hub-context mobile bottom bar previously carried a fifth tab labelled *Settings* whose label matched no page, so tapping it only moved the highlight. It is replaced by a **System monitoring** tab targeting `/settings/system-recovery`. Tab targets are now declared per tab in an explicit typed list in `apps/web/src/App.tsx` instead of being resolved from a label prefix, and the selected tab is derived from the current page with `aria-current="page"`. `apps/web/src/style.css` wraps two-word labels inside the 62 px bar. See DEC-040. Hub Settings, User Management, Audit Logs, and Application Settings remain in the slide-in navigation menu. *(Superseded on the Application Settings point by section 14: that page was retired by DEC-041.)*

**Verification:**

| Check | Command or method | Result |
|---|---|---|
| Web production build | `npm run build --workspace @pfsense-hub/web` | Exit 0; `index-D6OhSOSM.js`, `index-TPCP_qPg.css` |
| Source typecheck | `npm run typecheck` | Exit 0 for API and web |
| Container rebuild | `docker compose up -d --build web` | Rebuilt; `api`, `db`, and `web` healthy |
| Served entry document | `curl` of `index.html` from the running web container | References the new bundle and stylesheet hashes |
| Served bundle contents | search of the built bundle | Contains the tab tuple `["System monitoring","monitor","system-recovery"]`, confirming the tab is wired to the route rather than to a label prefix |
| Served stylesheet | search of the built CSS | Contains the `.mobile-bottom-nav button span` wrapping rule inside the 760 px media block |

**Commit:** `20cc109`, "Replace the mobile Settings tab with System monitoring".

**Feature lock:** the implemented System Monitoring & Recovery scope is closed as recorded in [System Monitoring & Recovery](SYSTEM-MONITORING-RECOVERY.md) section 10. Still open and explicitly not passed: an observed single-service operation from the browser, the stack-stop recovery rehearsal from a host shell, visual acceptance of the page against the approved mockup, and any run against a systemd-managed production agent.

**Open record-keeping item:** confirm that the stack restart recorded in section 12 (request id `req-f`, actor `ahmed`) was operator-initiated during that verification. If it was not, it must be investigated as an unauthorized host operation rather than closed as a test artifact.

**Operator note:** the browser must be hard-refreshed (Ctrl/Cmd+Shift+R) to load the new bundle hash. A cached bundle will still show the old *Settings* tab.

## 14. Application Settings retirement, November 23, 2026

**Decision:** [DEC-041](DECISIONS.md#dec-041-retire-the-hub-wide-application-settings-page). **Design record:** [Application Settings page redesign](APPLICATION-SETTINGS-REDESIGN.md#outcome-november-23-2026).

**Environment:** Ubuntu Docker host, Compose project `pfsense-hub` (`db`, `api`, `web`), web published on `127.0.0.1:8080`.

**Change:** the Hub-wide Application Settings page was removed from the frontend. `apps/web/src/App.tsx` lost the Administration navigation entry, the `app-settings` `Page` member, the render branch, the `pageTitle` constant, the `/settings/application` route-map entry, the placeholder `General`/`Preferences` card component, its `toggleStates` state, and the `Dispatch`/`SetStateAction` type imports that only that component used. `apps/web/src/style.css` lost the `.app-settings-*` and `.app-setting-row` rule block. `/settings/application` now redirects to `/settings/hub` with a history replacement, so a stale bookmark opens Hub Settings rather than falling through to the Hub overview. The same placeholder block was also removed from Site Settings, where it had presented Hub-wide values (application name, display timezone, a global confirmation switch) under a *Site preferences* heading. A follow-up commit then deleted the now-unused generic `.settings-grid` and `.settings-row` helpers from `apps/web/src/style.css`, including the `.settings-grid` fragments inside the grouped auth-form selectors and the mobile grid override; no live component referenced them. No API route, migration, authorization rule, scheduler, notification provider, or audit event was added.

**Verification:**

| Check | Command or method | Result |
|---|---|---|
| Source typecheck | `npm run typecheck` | Exit 0 for API and web |
| API test suite | `npm test` | Exit 0; 22 files, 275 tests passed |
| Web production build | `npm run build --workspace @pfsense-hub/web` | Exit 0; `index-CNcMdfiw.js`, `index-JAy8gOY-.css`; the follow-up cleanup rebuild produced `index-ee0p_jPM.js` and `index-Dde5v36r.css` |
| Web container rebuild | `docker compose up -d --build web` | Recreated; `web` healthy, `api` and `db` healthy |
| Served entry document | `curl http://127.0.0.1:8080/` | Referenced the local build at the time; after the follow-up rebuild it references `index-ee0p_jPM.js` and `index-Dde5v36r.css`, matching the local build |
| Served bundle labels | `curl` of the served JS, searched for `Application Settings`, `Automatic polling`, `Email notifications`, `app-settings`, `app-setting-row` | 0 occurrences of each, re-checked after the follow-up rebuild with the same result |
| Legacy route guard | `curl` of the served JS, searched for `settings/application` | 1 occurrence, the redirect guard |
| Legacy path response | `curl -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/settings/application` | 200 from the SPA fallback; the client-side redirect resolves it to `/settings/hub` |
| Served stylesheet | `curl` of the served CSS, searched for `app-settings` and `app-setting-row` | 0 occurrences; `.switch` rules remain |
| Follow-up stylesheet cleanup | `grep` of `apps/web/src/style.css` and `apps/web/src/App.tsx` for `settings-grid` and `settings-row`, then a rebuild and re-served CSS | 0 occurrences in source and 0 in the served CSS; `.auth-card` and `.switch` rules intact |

**Not verified by this change:** the redirect and the absence of the Administration entry were first confirmed from the served bundle and HTTP responses rather than by clicking through the interface. The operator then loaded the rebuilt Hub Settings page in a browser on November 23, 2026: the Administration group shows Hub Settings, User Management, Audit Logs, and System Monitoring & Recovery with no Application Settings entry, and no preference switches remain on the page. The legacy path was still exercised from the served bundle and its HTTP response rather than by clicking `/settings/application` in the browser. The browser must be hard-refreshed (Ctrl/Cmd+Shift+R) to load the new bundle hash. The items left open in sections 12 and 13 still stand: an observed single-service `start`/`stop`/`restart` in the browser, the stack-stop recovery rehearsal from a host shell, narrow-viewport visual acceptance, and any run against a systemd-managed production agent.

**Commit:** this change is recorded in repository history as the Application Settings retirement commit. Its hash is not written into this section, because editing this file afterwards would change that hash.


## 15. Site telemetry increment, November 23, 2026

**Scope:** Wire Overview, Monitoring, Interfaces, Gateways, Services, and Compatibility to the existing eight approved read-only endpoints; persist compatibility metadata; derive capability state from recorded polls; add no firewall permission, upstream route, or write capability (DEC-042).

**Source checks (Linux, repository root):**

| Check | Result |
|---|---|
| `npm test` | 25 files, **314 passed**, 0 failed (previous baseline: 275) |
| `npm run typecheck` | API and web passed |
| `npm run build` | API build and web production build passed (final web bundle `index-RBcacaty.js`, `index-DyUEt6w2.css`) |
| `docker compose up -d --build api` | API image rebuilt and container healthy |
| Migration `016_device_compatibility.sql` | Applied; `schema_migrations` reports `016_device_compatibility` and the five new `managed_devices` columns exist |
| `GET /health/ready` | `200` |
| Unauthenticated `GET /api/v1/devices/:id/snapshot` | `401 AUTHENTICATION_REQUIRED` |
| Unauthenticated `GET /api/v1/devices/:id/capabilities` | `401 AUTHENTICATION_REQUIRED` |

New automated coverage: `observations.test.ts` (16), `observation-cache.test.ts` (7), `observation-routes.test.ts` (7), plus extended `provider.test.ts` (12) and `device-repository.test.ts` (4 new cases). They assert that sensitive upstream fields never reach the snapshot, malformed payloads fail closed per operation, capability state distinguishes refusal from transport failure, capability is never claimed without history, disabled/demo/unknown devices are refused before any upstream call, and concurrent/cached reads collapse to one collection.

**Not verified, not claimed:** a real CE-device comparison and page-by-page visual acceptance against the approved mockup, because the mockup image is not present in this checkout. `api_package_version` and CPU architecture remain unreported by design.

### 15.1 Live acceptance and the defect it found

After the API image was rebuilt, an authenticated session loaded the site list and the Overview page against the registered firewall. The live behavior:

- `GET /api/v1/devices` initially returned `500` with `column "device_id" does not exist`. `listCompatibility()` and `getCompatibility()` projected `device_id` from `managed_devices`, but that table's key is `id`; only `poll_runs` and the credential tables use `device_id`. Mocked repository tests could not detect it because no test executed the SQL against a real schema.
- Fix: both queries project `id AS device_id`. The statements were executed directly against the live database (`psql`) before rebuilding the image, together with the `poll_runs` capability query, the `poll_runs` insert shape, and the alert auto-resolve statement.
- After the rebuild: `GET /api/v1/devices` → `200`; `GET /api/v1/devices/:id/snapshot` → `200` in ~5.5–8 s (sequential operations, cache hit afterwards); all eight `poll_runs` rows `success` for three consecutive collections; `alerts` empty; inventory reports `release` `26.07.2-RELEASE`, `platform` `Netgate 2100`, `apiPackageVersion` `null`, `compatibility` `verified`.
- Regression guard: the repository tests now assert that the compatibility projection is `id AS device_id` from `managed_devices`.

**Lesson recorded:** a mocked `Pool` proves mapping logic, not SQL validity. Any new statement against `managed_devices`, `poll_runs`, `device_credentials`, `device_tls_trust`, or `alerts` is now checked against the live schema before the image is rebuilt.

### 15.2 Trusted TLS connection closed as a documented item

The roadmap and PRD carried an open item to "verify a trusted TLS connection to the first Plus firewall without a certificate-validation bypass", inherited from the November 19 manual test that used `curl -k`. That item is now satisfied by manager evidence rather than by a new manual test:

| Check | Evidence |
|---|---|
| Trust mode in use | `device_tls_trust` holds one encrypted CA bundle for the registered device, so the client factory selects `custom-ca` and never the legacy global CA file |
| Certificate identity | The profile pins `tls_servername`; `apps/api/src/pfsense/client.ts` sets `checkServerIdentity` against that exact name, so an IP-addressed URL still verifies the firewall's DNS identity |
| Verification cannot be disabled | `rejectUnauthorized: true` is unconditional in the client constructor; no option or environment value turns it off |
| Live proof | The November 23 authenticated snapshot returned `200` with all eight operations `success` over that connection, and the inventory recorded `compatibility` `verified` |

**What this does not close:** the exact REST API package version (no approved endpoint exposes it), CPU architecture reporting, the CE comparison, visual acceptance, or the failure, cache-hit, and pruning paths under live background polling (activated November 23, 2026; DEC-043, section 16). The November 19 `curl -k` diagnostic is retained in [Integration Status](INTEGRATION-STATUS.md) as history only and is no longer cited as outstanding work.

## 16. Background polling scheduler, November 23, 2026

**Scope:** a scheduler that decides when the existing eight-operation collection runs, plus bounded retention of the history that collection produces. Recorded as DEC-043; parameters approved in [Background Polling Design](BACKGROUND-POLLING-DESIGN.md) section 2.

| Area | Implementation |
|---|---|
| Trigger and cadence | `apps/api/src/pfsense/poll-scheduler.ts`: one timer per API process, sleeps to the earliest due device, bounded by one interval; overlap skipped, not queued |
| Isolation | Per-device `try`/`catch`; a throw or timeout marks only that device and schedules its backoff |
| Same collection path | `provider.collect(deviceId, pollObserver(deviceId))`, then the shared `recordPollHealth`, `pfsense_device_up`, and cache write-through. No new route, upstream call, or firewall permission |
| Backoff | `[30s, 60s, 120s, 300s]` cap, floored at the configured interval, reset on a fully successful collection |
| Retention | `apps/api/src/pfsense/poll-retention.ts`: `poll_runs` only, `LIMIT 5,000` per statement, startup and every 24 h, audited as `polling.history_pruned` when rows were removed |
| Cache | `ObservationCache.store()` seeded for one interval on success, the existing 2 s window on failure, an in-flight request wins |
| Enablement | `PFSENSE_POLLING_ENABLED=false` default; `server.ts` constructs nothing when false, and `shutdown()` stops the scheduler |

**Checks observed on this increment:**

| Check | Result |
|---|---|
| API tests | `27 test files / 335 tests passed` (21 new: scheduler 14, retention 4, cache write-through 3) |
| API and web typecheck | exit 0 |
| Production build | exit 0; unchanged web output `index-RBcacaty.js`, `index-DyUEt6w2.css` |
| Deployed flag-off path | Rebuilt `api` container: `PFSENSE_POLLING_ENABLED=false` in its environment, healthy, serving `GET /api/v1/devices/:id/snapshot` `200`, and no `Background firewall polling started` log line |
| Security boundary | Unchanged: no new route or method, no caller-supplied destination, no write operation, no firewall permission change |

**Live activation, November 23, 2026:** `PFSENSE_POLLING_ENABLED=true` was set for the local Docker Compose deployment and the `api` service was recreated. A first attempt with `PFSENSE_POLLING_ENABLED=yes` was refused at startup (`Invalid application configuration: PFSENSE_POLLING_ENABLED: Invalid option: expected one of "true"|"false"`); the flag fails closed instead of reading an unrecognised value as `false`, which is the behavior the config tests already pin, so the value was corrected rather than the parser loosened.

| Observed | Result |
|---|---|
| Scheduler start | `Background firewall polling started` with `intervalMs: 60000`, `concurrency: 2`, `jitterMs: 15000`, `retentionDays: 30` |
| Scheduled collection without a page request | Eight consecutive cycles of all eight operations, every one `success`, first cycle `23:21:31`–`23:21:36` and latest observed `23:31:32`; spacing 70–79 s at a 60 s interval plus 0–15 s jitter and collection time |
| Duplicate or overlapping polls | None: exactly one `poll_runs` row per operation per cycle |
| Service log after activation | 50 `info` lines, zero `warn`/`error` lines |
| Alerts | 0 created, 0 open |
| Retention | Startup prune ran and removed 0 rows (all history younger than 30 days), so no `polling.history_pruned` event was written — correct behavior, but the delete-and-audit path is still unexercised |

**Not verified:** a repeated poll failure producing one deduplicated alert that auto-resolves on recovery; a page load inside the interval reporting `cacheHit: true`; and a retention prune that removes and audits real rows. The cadence itself is verified. Describe background polling as running and observed on cadence, not as proven under failure and retention conditions.

## 17. Runtime polling settings in Hub Settings, November 23, 2026

**Scope:** the four background-polling integers — interval, concurrency, jitter, and `poll_runs` retention — became editable at **Administration → Hub Settings → Polling cadence**. Recorded as DEC-044; contract and rationale in [Runtime Settings in Hub Settings](RUNTIME-SETTINGS-PROPOSAL.md).

| Area | Implementation |
|---|---|
| Storage | `017_hub_polling_settings.sql` creates the singleton row with `CHECK` bounds, `jitter_ms < interval_ms`, and `updated_by` FK. `018_seed_hub_polling_settings.sql` seeds `60000 / 2 / 15000 / 30` with `updated_by` NULL. `019_hub_polling_settings_saved_at.sql` adds the `saved_at` save marker and backfills it from `updated_at` for any row that already carries attribution. New migrations rather than edits to `017`, because the API checksum-verifies applied migrations at boot |
| Source of truth | The row only. The four `PFSENSE_POLLING_*` cadence variables were removed from `config.ts`, `.env.example`, `compose.yaml`, the `.env` that `scripts/install-linux.sh` generates, and this deployment's `.env`. There is no environment default or fallback |
| Repair | A missing row, or one outside the bounds, is rewritten to the install values when it is read, so the API and the panel always describe the cadence that is running |
| Reported source | `GET` returns `source: "install"` while `saved_at` is NULL and `source: "hub"` once an administrator saves, with `updatedAt` and `updatedBy`. The marker is stored separately from attribution, so a saved cadence cannot revert to `"install"` because the saving account was retired |
| API | `GET`/`PUT /api/v1/hub-settings/polling`, administrator-only in the route and in the server's admin-only hook; `strict` integer schema reusing the scheduler bounds |
| Runtime | Save constructs the replacement scheduler, stops the old one, starts the new one; a rejected value leaves the running cadence untouched; a failed write restores it |
| Audit | `hub.settings.update`, `targetType: "hub_polling_settings"`, previous and updated integers, `applied`, `pollingEnabled` |
| Unchanged | No new upstream route, firewall endpoint, or permission; `PFSENSE_POLLING_ENABLED` stays environment-only; the single-scheduler rule and read-only boundary are untouched |
| Not moved | Secrets, host fail-closed gates, infrastructure variables, per-device identity/TLS/credentials, `PFSENSE_API_TIMEOUT_MS`, cache lifetimes, and the legacy bootstrap keys (DEC-044 lists each and why) |

**Checks observed on this increment:**

| Check | Result |
|---|---|
| API tests | `28 test files / 350 tests passed` (15 in `hub-polling-settings.test.ts` at the time; 17 after the `019` follow-up recorded below) |
| API and web typecheck | exit 0 |
| Production build | exit 0 (`dist/assets/index-C2vEzwEc.css`, `dist/assets/index-BckBOM3d.js`) |
| Rebuild | `docker compose up -d --build api web`: `api` healthy, `web` started |
| Migration | `schema_migrations` lists `018_seed_hub_polling_settings` and `019_hub_polling_settings_saved_at`; `hub_polling_settings` holds `1 | 60000 | 2 | 15000 | 30` with `updated_by` and `saved_at` both NULL |
| Install values drive the scheduler | Start log: `intervalMs: 60000, concurrency: 2, jitterMs: 15000, retentionDays: 30` |
| Row drives the scheduler | Row updated to `30000 / 3 / 5000 / 7`, `api` restarted; start log reported exactly those values |
| Restore | Row set back to the install values, `api` restarted; start log reported `60000 / 2 / 15000 / 30` |
| No cadence in the environment | `printenv` inside the `api` container lists `PFSENSE_POLLING_ENABLED` only; the four cadence variables are absent |
| Served bundle | `index-BckBOM3d.js` served by `web` contains `Polling cadence` and `Still at the install defaults` |
| Authenticated read | Signed in over the web entrypoint as a temporary administrator (`POST /api/v1/auth/login` `200`, `pfsense_hub_session` cookie set, `GET /api/v1/auth/me` `200`); `GET` then reported `source: "install"`, `updatedBy: null`, `60000 / 2 / 15000 / 30` |
| Save through a real session | `PUT` with `45000 / 3 / 5000 / 14` returned `200` carrying `source: "hub"`, `updatedBy: "dec044-verify"`, `applied: true`; the next `GET` reported the same values and `source: "hub"` |
| Live scheduler swap | The same `api` process logged `Background firewall polling stopped`, then `Background firewall polling started` with `intervalMs: 45000, concurrency: 3, jitterMs: 5000, retentionDays: 14` — no restart |
| Audit trail | `audit_events` holds `hub.settings.update / success` with `previous 60000/2/15000/30` and `updated 45000/3/5000/14`, and the `auth.login` event for the same session |
| Restore | A second `PUT` returned `200` with the install values; the row was then returned to its seeded state (`updated_by` and `saved_at` NULL, `60000 / 2 / 15000 / 30`, original `updated_at`) so the deployment is left untouched |
| Authorization | Unauthenticated `GET` and `PUT` each returned `401`, including with the retired session cookie |
| Save marker independent of attribution | After a save, `updated_by` was set NULL in SQL — the state a retired account leaves behind — and `GET` still reported `source: "hub"` with `updatedBy: null` and the saved `52000 / 3 / 4000 / 10` |
| Saving the install values still counts as saved | `PUT` with `60000 / 2 / 15000 / 30` returned `200` with `source: "hub"` and `applied: true`, so a save is never mistaken for an untouched row |
| Clearing the marker restores `install` | `saved_at` and `updated_by` set NULL: `GET` reported `source: "install"` and the seeded `updatedAt`, confirming the marker alone decides |
| Follow-up checks | API typecheck exit 0; `vitest run src` reports 28 files / 352 tests passed (17 in `hub-polling-settings.test.ts`, two of them new for the marker); `api` rebuilt and applied `019`, healthy; `web` untouched |
| Account retirement | The temporary administrator was left `is_active = false` with an unusable stored credential and 0 sessions; a login attempt and the old cookie each returned `401` |
| Deletion blocked | `dec044-verify` holds 7 `audit_events` rows; `DELETE FROM admin_users WHERE username = 'dec044-verify'` returned `ERROR: audit_events are append-only` (`prevent_audit_event_mutation`), with the failing statement shown as the FK's `UPDATE ONLY "public"."audit_events" SET "actor_id" = NULL` |

**Not verified:** the same save clicked inside the browser UI. The session was created through the login endpoint and used over HTTP against the same web entrypoint the browser uses, so every server-side layer — cookie, session lookup, admin hook, route guard, scheduler swap, audit — was exercised; only the form submission itself was not driven by a human. The repair path (missing or out-of-bounds row) remains unit-tested, not exercised live.

**Retiring an administrator, the only removal path.** Because the account cannot be deleted (see the finding below), retirement is: set `is_active = false`, replace `password_hash`/`password_salt` with a value that cannot verify, and delete the account's `admin_sessions` rows. That is what was done to `dec044-verify`, directly in SQL, because no API route offers it. Two consequences are recorded rather than glossed over: the action produced no `user.*` audit event, since no route performed it, and the row itself remains visible as an inactive account. An audited deactivation endpoint would be a new feature with its own record, not a cleanup step. DEC-045 makes this the settled lifecycle for administrators.

**Finding, administrator deletion.** `audit_events.actor_id` is declared `REFERENCES admin_users(id) ON DELETE SET NULL`, but `audit_events` also carries a trigger that raises on every `UPDATE` and `DELETE`, so that `SET NULL` can never run. Attempted directly: `dec044-verify` has 7 audit rows, and `DELETE FROM admin_users WHERE username = 'dec044-verify'` fails with `ERROR: audit_events are append-only` from `prevent_audit_event_mutation()`, with the failing statement shown as the FK's own `UPDATE ONLY "public"."audit_events" SET "actor_id" = NULL`. The temporary verification account could therefore not be removed: it was disabled, its stored credential was replaced with a value that cannot verify, and its sessions were deleted, leaving one inactive `dec044-verify` entry in User Management that cannot be deleted while its audit rows exist. No API route deletes administrators today, so this is latent, but any future delete capability — and any manual `DELETE FROM admin_users` — will hit it. Deactivation is recorded as the intended lifecycle in DEC-045; changing the audit schema or its triggers remains a separate decision.

**Resolved, how `source` is derived.** The first live save showed that `source` was `"install"` exactly while `hub_polling_settings.updated_by` was NULL, which made attribution the marker of a save and would have flipped a saved cadence back to `"install"` if the saving account were ever removed. Migration `019_hub_polling_settings_saved_at.sql` adds `saved_at`, written on every save and NULL for the seed and for a repair that restores the defaults, and `resolvePollingSettings` now derives `source` from it. Rows that already carried attribution were backfilled from `updated_at`, so no existing save changed meaning. Two new route tests cover the marker (`still reports a saved cadence when the saving account is no longer attributed`, `counts a save that writes the install values as saved`), and the three live rows above exercise the same three states against the deployment. `017`'s header comment still describes the superseded environment-default design; it is left byte-identical because applied migrations keep a checksum the API verifies at boot, so `019` and DEC-044 carry the current description.

