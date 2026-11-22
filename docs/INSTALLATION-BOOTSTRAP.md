# Hub Installation and First-Run Bootstrap

**Status:** Approved target workflow, documentation only  
**Decision:** DEC-031  
**Implementation status:** Not implemented yet. The current Compose file, API configuration, and provisioning scripts still require a single environment-configured firewall. Do not treat the target steps below as executable instructions until the implementation milestone is merged and released.

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
- Code-server host port, if code-server remains part of the selected deployment.

It must not contain per-firewall settings such as:

- `PFSENSE_DEVICE_ID`
- `PFSENSE_DEVICE_NAME`
- `PFSENSE_DEVICE_LOCATION`
- `PFSENSE_EDITION`
- `PFSENSE_API_BASE_URL`
- `PFSENSE_API_TIMEOUT_MS` as a global device setting
- `PFSENSE_CA_FILE`
- A global `PFSENSE_API_KEY_FILE` secret

Per-site credentials must be encrypted in PostgreSQL by the backend. The application encryption key remains a separate protected runtime secret, never a normal `.env` value. Code-server credentials also remain separate from `.env`.

The final environment variable list must be derived from the actual Compose and application configuration after implementation. Do not remove a variable from the deployed environment until its consumer has been removed or migrated.

## 4. Windows 11 PowerShell installation target

The supported local development platform is Windows 11 with VS Code and Docker Desktop. The future PowerShell installer must:

1. Verify supported Windows, PowerShell, and Docker Desktop prerequisites.
2. Create required application, secret, runtime-key, certificate/trust, and workspace directories.
3. Detect existing configuration, database volumes, and key files before writing anything. Never overwrite or silently reinitialize existing state.
4. Generate the Hub database password and code-server password locally.
5. Generate one high-entropy application encryption key using the operating-system cryptographic random generator.
6. Install a protected runtime copy of the key and present a one-time recovery copy for the administrator's password manager. Do not log it or place it in source control, chat, or `.env`.
7. Write a Hub-only `.env` file and protect it with Windows ACLs.
8. Validate the Compose configuration.
9. Start the Hub stack only when the operator chooses to start it.
10. Never prompt for a firewall UUID, firewall name, edition, API URL, API key, or firewall certificate during Hub installation.

The existing `scripts/setup-encryption-key.ps1` recovery behavior must be preserved or incorporated into the final installer. It must refuse to replace an existing key.

## 5. Linux Bash installation target

Production deployment targets Linux, initially the existing Proxmox LXC. The future Bash installer must provide equivalent behavior:

1. Verify Linux, Docker Engine, and Docker Compose prerequisites.
2. Detect existing application files, Compose resources, database state, and key files before making changes.
3. Create required directories with restrictive permissions.
4. Generate database and code-server secrets locally.
5. Generate the application encryption key with a cryptographically secure operating-system random generator.
6. Install the runtime key with permissions limited to the backend runtime identity and provide a one-time recovery value without leaving it in shell history or routine logs.
7. Write a Hub-only `.env` file with restrictive permissions.
8. Validate Compose configuration before starting services.
9. Preserve existing database volumes and application data during ordinary installation, update, restart, and recovery operations.
10. Never prompt for a firewall UUID, firewall name, edition, API URL, API key, or firewall certificate during Hub installation.

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

This document records the approved target design. It does **not** mean the current repository already supports it.

As of the documentation baseline:

- `.env.example` still contains single-firewall identity and connection settings.
- `compose.yaml` still requires those firewall settings and mounts a global pfSense API-key secret.
- API configuration still requires a device UUID, name, edition, API URL, and API-key file.
- API startup still provisions the environment-configured device.
- The current site GUI does not yet complete the full per-site credential and connection lifecycle.
- The existing Linux setup has no reviewed end-to-end Bash installer equivalent to the Windows key-provisioning script.

Therefore, do not use a manually edited `.env` or the earlier one-off setup command as a substitute for the implementation. The current deployed installation must remain intact while the new flow is implemented and migration is designed.

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
