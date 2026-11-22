# Verification and documentation closeout

**Closeout date:** November 22, 2026 (America/New_York)  
**Active branch:** `feature/multi-site-onboarding`  
**Branch status:** This work is on the feature branch. It has not been merged into `main`.  
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
- The first Plus firewall's historical eight-endpoint diagnostic test used a temporary TLS verification bypass. The application enforces TLS, but a separately recorded, trusted certificate validation against that firewall remains outstanding.
- The exact installed pfSense REST API package version is not recorded.
- Background polling scheduling, bounded concurrency, retry/backoff, and continuous alert generation are not implemented as a production scheduler. Some polling is request-triggered.
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
