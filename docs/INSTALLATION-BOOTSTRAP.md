# Hub Installation and First-Run Bootstrap

**Status:** Linux first-install workflow implemented, broader installation acceptance in progress
**Decision:** DEC-031 and DEC-032
**Implementation status:** The current branch supports a single-entry Linux installation on a clean Debian/systemd host. The main installer provisions the Hub and standard Host Agent, verifies their connection, and enables GUI-managed access deployment after health checks. Windows/Linux parity, reboot/recovery, and migration acceptance still require separate verification.

**Operator procedure:** Follow [Fresh Linux Host Setup](DEPLOYMENT.md#fresh-linux-host-setup) for the clean-machine prerequisites, Docker setup, repository checkout, and installer command. This document records the lifecycle requirements and acceptance criteria.

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

The final environment variable list must be derived from the actual Compose and application configuration after implementation. Do not remove a variable from the deployed environment until its consumer has been removed or migrated.

## 4. Windows 11 PowerShell installation target

The supported local development platform is Windows 11 with VS Code and Docker Desktop. The future PowerShell installer must:

1. Verify supported Windows, PowerShell, and Docker Desktop prerequisites.
2. Create required application, secret, runtime-key, certificate/trust, and workspace directories.
3. Detect existing configuration, database volumes, and key files before writing anything. Never overwrite or silently reinitialize existing state.
4. Generate the Hub database password locally.
5. Generate one high-entropy application encryption key using the operating-system cryptographic random generator.
6. Install a protected runtime copy of the key and present a one-time recovery copy for the administrator's password manager. Do not log it or place it in source control, chat, or `.env`.
7. Write a Hub-only `.env` file and protect it with Windows ACLs.
8. Validate the Compose configuration.
9. Start the Hub stack only when the operator chooses to start it.
10. Never prompt for a firewall UUID, firewall name, edition, API URL, API key, or firewall certificate during Hub installation.

The existing `scripts/setup-encryption-key.ps1` recovery behavior must be preserved or incorporated into the final installer. It must refuse to replace an existing key.

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

The Bash and PowerShell installers must implement the same logical workflow, validation gates, safe re-run behavior, and zero-firewall acceptance criteria. Platform-specific permission mechanisms may differ.

## 6. First login and site registration

After a successful Hub-only installation:

- Open the Hub using its safe local binding.
- Complete the administrator first-run setup.
- Confirm the Hub dashboard loads with an empty Sites inventory.
- Do not create a fake or placeholder firewall record.

To add a firewall, use the GUI and provide the site's display name, optional location, edition, HTTPS API origin, API credential, and any required private CA trust material. The backend validates the profile, generates the UUID, encrypts the credential, stores the record, and offers a separate read-only connection test.

Credential fields are write-only. The Hub must never return plaintext credentials to the browser, include them in logs, or put them in URLs. TLS certificate and hostname verification must remain enabled.

## 7. Existing single-firewall installation migration

The current implementation uses environment variables for one firewall and automatically ensures that configured device exists in PostgreSQL. This legacy behavior must be migrated deliberately.

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

## 8. Current implementation warning

This document records the approved target design and current partial implementation. The Compose file retains blank legacy single-firewall bootstrap fields and a compatibility API-key placeholder, but a fresh installation can start without registering a firewall. API startup no longer requires a populated firewall identity or API URL, and the manager supports GUI-based site registration with encrypted per-site credentials.

The Linux Bash installer now provides one entry point for the Hub and its standard Host Agent. It refuses to overwrite existing secrets, agent configuration, containers, or the named PostgreSQL volume. It does not delete database state. The Host Agent remains a separate maintenance script internally, but normal Linux installation invokes it automatically.

Remaining acceptance work includes a clean second-LXC installation, reboot/recovery validation, Windows/Linux workflow parity, and migration testing against an existing-data copy. Do not describe the product as production-ready until those checks are complete.

## 9. Acceptance criteria

The installation milestone is not complete until all of the following are demonstrated on both Windows Docker Desktop and Linux Docker Compose:

- A fresh Hub starts with no firewall-related environment variables or firewall secret files.
- Database migrations complete and the administrator can complete first-run setup.
- The Sites inventory is empty and the dashboard remains healthy.
- The installer generates and protects the application encryption key and recovery copy.
- Re-running the installer does not overwrite keys, configuration, or existing database state.
- A site added through the GUI receives a backend-generated UUID.
- Two sites can be registered with different origins, credentials, and TLS trust settings.
- Credentials are encrypted at rest and never returned to the browser or logs.
- A site connection failure does not prevent the Hub or other sites from operating.
- Existing single-firewall data can be migrated without losing identity, credentials, history, or audit records.
- Documentation and both installers agree on the same supported workflow.
- Tests and deployment verification are recorded from actual runs. Skipped checks are not marked as passed.
