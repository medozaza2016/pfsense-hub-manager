# Hub Installation and First-Run Bootstrap

**Status:** Linux first-install and Tailscale access path verified on November 22, 2026; broader production acceptance remains in progress. Windows has a documented Docker Desktop development setup, not a full PowerShell installer.
**Decision:** DEC-031, DEC-032, and DEC-036
**Implementation status:** The active feature branch supports a single-entry Linux installation on a clean Debian 13/systemd host. The main installer provisions the Hub and standard Host Agent, verifies their connection, and enables GUI-managed access deployment after health checks. A clean install completed successfully, and Hub Settings reported the Tailscale endpoint verified with desired and applied revision 2. The same script also provides an unprivileged `--local` development mode that starts the Hub from any checkout path without the Host Agent. Windows/Linux install-script parity is not claimed: Windows Docker Desktop is the local development platform and does not run the Linux systemd Host Agent. Reboot/restore, backup recovery, and migration acceptance remain outstanding.

**Operator procedure:** Use the [Prepared Proxmox LXC quick start](DEPLOYMENT.md#prepared-proxmox-lxc-quick-start-recommended) for the standard two-command path. Use [Fresh Linux Host Setup](DEPLOYMENT.md#fresh-linux-host-setup) only for a plain Linux machine that still needs host prerequisites or Docker. This document records lifecycle requirements and acceptance criteria.

## 1. Core installation rule

A fresh pfSense Hub Manager installation must start and become usable with **zero registered firewalls**.

The Hub is the application installation. A pfSense firewall is a separately registered site managed by that Hub. The Hub must not require a firewall UUID, firewall name, edition, API URL, API key, or firewall CA certificate to initialize.

There are no placeholder firewall records or fixed first-device identities in the installation configuration.

## 2. Lifecycle and ownership

1. **Install the Hub:** provision the host, Docker Compose, PostgreSQL, Hub secrets, and application services.
2. **Initialize the Hub:** run database migrations and complete first-run administrator account setup.
3. **Use the Hub without sites:** the dashboard and administration areas must load when the managed-device table is empty.
4. **Register a site when ready:** an administrator uses the Sites GUI to enter that firewall's connection details and credentials.
5. **Generate the site identity:** the backend generates a random UUID for the new managed-device record. The UUID is not requested from the operator and is not derived from a firewall serial number, hostname, API key, or Netgate account.
6. **Test and monitor independently:** each site has its own HTTPS origin, credential, TLS trust configuration, compatibility result, and connection state.

A site UUID identifies a Hub database record. It is not a Hub installation ID and is not a value that must be copied from an existing Hub.

## 3. Hub-only environment configuration

The target `.env.example` contains only settings required to run Hub infrastructure, such as:

- PostgreSQL database name and username.
- PostgreSQL password, generated locally and protected as a deployment secret.
- Hub web bind address, defaulting to `127.0.0.1`.
- Hub web port.

It must not contain per-firewall settings such as:

- `PFSENSE_DEVICE_ID`
- `PFSENSE_DEVICE_NAME`
- `PFSENSE_DEVICE_LOCATION`
- `PFSENSE_EDITION`
- `PFSENSE_API_BASE_URL`
- `PFSENSE_API_TIMEOUT_MS` as a global device setting
- `PFSENSE_CA_FILE`
- A global `PFSENSE_API_KEY_FILE` secret

Per-site credentials must be encrypted in PostgreSQL by the backend. The application encryption key remains a separate protected runtime secret, never a normal `.env` value.

The current Compose file retains blank legacy single-firewall bootstrap fields and an empty API-key compatibility placeholder for existing deployments. A standard fresh install does not require a populated firewall ID, name, API origin, API key, or CA certificate. Do not place real firewall credentials in the Hub installation environment.

## 4. Windows 11 local development workflow

Windows 11 with VS Code and Docker Desktop is the supported local development environment. It does not use the Linux production installer or the Linux systemd Host Agent.

There is currently no full `install-windows.ps1`. The existing `scripts/setup-encryption-key.ps1` provisions only the Windows application encryption key and its one-time recovery copy. It does not configure the full environment or start the Compose stack. The operator workflow is documented in [Windows 11 local setup and development](DEPLOYMENT.md#windows-11-local-setup-and-development-workflow).

From PowerShell at the repository root, on a clean local development checkout:

```powershell
if (Test-Path .env) { throw "An .env file already exists. Preserve it and inspect the current setup before proceeding." }
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

Set a strong unique alphanumeric `POSTGRES_PASSWORD` in `.env`. Leave legacy firewall bootstrap settings blank for a Hub with no registered firewall. Keep the agent token/socket empty and `HUB_ACCESS_DEPLOYMENT_ENABLED=false` on Windows. Save the recovery key in a password manager and run the provisioning script with PowerShell transcription/session recording disabled.

The local source validation commands are separate from environment provisioning and Compose startup:

```powershell
npm ci
npm test
npm run typecheck
npm run build
```

Node.js 22 and npm are required for these development checks, not for the Linux production host. The Windows workflow runs frontend/API containers but does not install or run the production Linux Host Agent. Do not claim Windows/Linux installer parity.
## 5. Linux Bash installation workflow

Production deployment targets Linux, initially Debian 13 on a Proxmox LXC or another supported systemd host. The implemented Bash installer provides the following behavior:

1. Verify Linux, systemd, Docker Engine, Docker Compose, Python 3.10 or newer, and iproute2 prerequisites.
2. Detect existing application files, Host Agent configuration/service, Compose containers, the PostgreSQL volume, and key files before making changes. Refuse to initialize over an existing database volume.
3. Create required directories with restrictive permissions.
4. Generate the database password, application encryption key, and Host Agent bearer token locally.
5. Present the one-time application encryption recovery key and require the operator to confirm it was saved.
6. Install the runtime key with permissions limited to the backend runtime identity and write a root-only .env file containing the Host Agent socket/token configuration.
7. Automatically invoke the standalone Host Agent installer, install its root-owned systemd service and group-restricted Unix socket, then validate Compose.
8. Build and start web, API, and PostgreSQL; wait for each to become healthy.
9. Verify API supplementary-group/socket access and a bearer-authenticated Host Agent request before setting HUB_ACCESS_DEPLOYMENT_ENABLED=true.
10. Preserve existing database volumes and application data during ordinary updates, restart, and recovery. Never use volume deletion as an installation shortcut.
11. Never prompt for a firewall UUID, firewall name, edition, API URL, API key, or firewall certificate during Hub installation.

The Linux Bash workflow is implemented and verified on the prepared Debian 13 Proxmox LXC. A matching automated Windows PowerShell Hub installer is not implemented; Windows remains a Docker Desktop development workflow. Do not imply Windows/Linux installer parity.

### 5.1 Linux local development mode

`scripts/install-linux.sh --local` (alias `--dev`) runs the same installer without privileges from any checkout path. It is a development convenience, not a production installation path, and it does not change the production procedure.

- Requires Docker Engine, Docker Compose v2, OpenSSL, and standard coreutils. systemd, Python, iproute2, and group management utilities are not required.
- Refuses to run as root, except through `sudo` with resolvable `SUDO_USER`, `SUDO_UID`, and `SUDO_GID`; created files are then returned to that account. A checkout owned by another account is rejected.
- Installs no Host Agent, no systemd service, and no agent configuration, and creates no root-owned project files. The optional `--with-agent` flag is the documented exception: it runs the same restricted agent binary as the invoking unprivileged account from that checkout, with its configuration in `~/.config/pfsense-hub/deployment-agent.json` and lifecycle control through `scripts/dev-host-agent.sh`. It enables the deployment gate in the local `.env` and still writes nothing to `/etc` or `/opt` and creates no systemd unit. The agent accepts only configuration, project, Compose, and `.env` files owned by the account running it, and a root agent still requires `/opt/pfsense-hub`. See DEC-038.
- Writes `.env` with empty `HUB_DEPLOYMENT_AGENT_TOKEN` and `HUB_DEPLOYMENT_AGENT_SOCKET`, `HUB_ACCESS_DEPLOYMENT_ENABLED=false`, and the loopback bind, so Hub access deployment stays disabled and requests return `503 HUB_ACCESS_DEPLOYMENT_DISABLED`.
- Applies the same non-destructive guards: an existing `.env`, key files, the `pfsense-hub_postgres_data` volume, or Compose project containers stop the installer instead of being overwritten.
- Builds and starts web, API, and PostgreSQL, waits for all three to become healthy, and prints `http://127.0.0.1:8080`.

Without a privileged agent, Linux local mode cannot verify or apply Tailscale or Custom Hub access settings. Use the production procedure for that capability, and stop the local stack with `docker compose down` rather than `docker compose down -v`.

## 6. First login and site registration

After a successful Hub-only installation:

- Open the Hub using its safe local binding.
- Complete the administrator first-run setup.
- Confirm the Hub dashboard loads with an empty Sites inventory.
- Do not create a fake or placeholder firewall record.

To add a firewall, use the GUI and provide the site's display name, optional location, edition, HTTPS API origin, API credential, and any required private CA trust material. The backend validates the profile, generates the UUID, encrypts the credential, stores the record, and offers a separate read-only connection test.

Credential fields are write-only. The Hub must never return plaintext credentials to the browser, include them in logs, or put them in URLs. TLS certificate and hostname verification must remain enabled.

## 7. Existing single-firewall installation migration

An optional legacy bootstrap path can import one environment-configured firewall for existing deployments. The standard fresh-install workflow starts with no registered site and does not populate that legacy configuration. Any existing single-firewall deployment must be migrated deliberately before legacy settings are removed.

Before removing any legacy variables or secret files:

1. Back up the PostgreSQL database and persistent volumes.
2. Preserve the exact existing device UUID and its poll history.
3. Preserve the existing API key and any TLS trust material securely.
4. Confirm the application encryption key and its independent recovery copy are available.
5. Import or reconcile the current firewall into the new per-site model without creating a duplicate record.
6. Verify that the stored credential decrypts and the site passes a TLS-verified connection test.
7. Confirm existing audit and polling history remains associated with the same device UUID.
8. Only after successful verification, remove obsolete single-firewall environment settings and global API-key secret wiring.

Do not rotate the application encryption key as part of this migration unless a separately tested key-rotation procedure is implemented. Do not delete old secrets, volumes, or database data as a cleanup shortcut.

## 8. Current implementation and acceptance warning

A fresh Hub can start without a registered firewall. The Compose file retains blank legacy single-firewall bootstrap fields and an empty API-key compatibility placeholder, but the installer does not require a real firewall identity, API URL, API key, or CA certificate. The manager supports GUI-based site registration with encrypted per-device credentials and TLS trust.

The Linux Bash installer is the single first-install entry point. It refuses to overwrite existing `.env`/secrets, Host Agent configuration/service, Compose project containers, or the named PostgreSQL volume. It never deletes volumes. When it detects existing state it changes nothing and prints the resume procedure and the destructive replacement procedure, so an operator is never left without a next step. The Host Agent installer remains a separate script internally for maintenance, but normal Linux onboarding invokes it automatically.

The standard prepared Proxmox LXC quick start assumes Debian 13, an administrator account, Docker Engine/Compose, Git, and base utilities are already present. It does not reinstall Tailscale or reset the existing CT identity. The full plain-Debian prerequisite procedure remains available for other hosts.

Remaining acceptance work includes reboot and snapshot-restore validation, backup/recovery drills, migration testing against an existing-data copy, and full multi-device validation with two real firewalls. The second CE firewall is intentionally deferred. Do not describe the product as production-ready until the wider release gates are complete.

## 9. Acceptance criteria

The installation and onboarding milestone has separate platform and product acceptance criteria. Do not require a Windows systemd Host Agent; that is a Linux production component.

### Linux installation checks

- [x] A fresh Hub starts without populated firewall-specific environment settings or a real firewall API credential.
- [x] PostgreSQL migrations complete during clean startup and the web/API/database services become healthy.
- [x] The installer provisions and enables the Host Agent, verifies the Unix socket, API supplementary group, and bearer-authenticated request, then enables GUI-managed access deployment.
- [x] The installer generates a protected application encryption key and requires confirmation that its one-time recovery copy was saved.
- [x] The installer refuses to overwrite existing secrets, agent configuration/service, containers, or PostgreSQL volume.
- [x] The unprivileged `--local` mode installs and starts the Hub from an arbitrary checkout path with no Host Agent, and keeps `HUB_ACCESS_DEPLOYMENT_ENABLED=false`.
- [x] `--local --with-agent` provisions an unprivileged development Host Agent from the same checkout, verifies the socket and bearer handshake, and adds no systemd unit, `/etc` write, or `/opt` write.
- [x] Hub Settings can apply and verify the Tailscale MagicDNS HTTPS endpoint on the tested prepared Debian 13 CT.
- [ ] Reboot and snapshot-restore recovery drill.
- [ ] Database and encryption-key backup/restore drill.
- [ ] Migration validation against a preserved existing-data copy.

### Managed-site product checks

- [x] Site registration and lifecycle routes are administrator-only.
- [x] Per-device API credentials and custom CA trust are encrypted and kept write-only at the API boundary.
- [x] Connection tests use a fixed read-only version endpoint and preserve strict TLS validation.
- [ ] Verify two real firewall profiles independently with separate origins and trust settings.
- [ ] Connect and validate the deferred pfSense CE firewall when the user is ready.
- [ ] Validate multi-device failure isolation and continuous polling behavior.

### Windows development checks

- [x] Windows API tests, API/web typechecks, and production builds completed in the recorded local run.
- [ ] A standalone automated Windows first-install/secret-provisioning workflow equivalent to the Linux installer is not currently implemented.

See [Verification and Documentation Closeout](VERIFICATION-AND-CLOSEOUT.md) for exact commands, commit baselines, test counts, skipped tests, and the clean Linux installation evidence.
