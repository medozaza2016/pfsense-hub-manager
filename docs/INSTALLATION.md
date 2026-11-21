# Installation

Docker Engine and Docker Compose v2 are host prerequisites for every Docker installation. Node.js and npm are required only for the optional local development validation profile.

## Windows 11

From the repository root in PowerShell:

    Set-ExecutionPolicy -Scope Process Bypass
    .\scripts\install.ps1

Docker Desktop must be running. This is the Docker deployment path and does not require Node.js on the host.

For a Windows development setup that also prepares and validates the local npm workspaces, run:

    .\scripts\install.ps1 -Development

The development profile requires Node.js 22 or newer and npm 10 or newer. It checks both versions, installs workspace dependencies when needed, verifies that the local TypeScript compiler is available, and runs the repository type-check and production build before continuing with Docker installation. If Node.js is missing or too old, install the current Node.js LTS release and reopen PowerShell before rerunning the command.

On Windows, the development profile also verifies the native optional packages required by the installed Rollup and esbuild versions. If npm has omitted or incorrectly deduplicated a platform package, `scripts/repair-native-deps.mjs` installs the exact matching native package version at the dependency level that owns it. This matters because Vite and the API can depend on different esbuild versions and must not share one incompatible native binary. This repair does not change `package.json` or the lockfile. The API test command runs source tests only, avoiding duplicate execution of compiled `dist` tests.\n\nThe API workspace pins the patched major lines for Zod (`^4.6.7`) and Vitest (`^5.1.1`) to address the advisories observed during the November 2026 installation. Existing Zod schemas use the common object/string/enum/safeParse APIs, but the upgrade must still pass the local API tests and type checks before it is considered validated.

After dependencies are installed, the development installer runs `npm audit`. If vulnerabilities are reported, it automatically runs `npm audit fix`, which applies compatible updates allowed by the dependency constraints, then runs a second audit and reports any remaining findings. It never runs `npm audit fix --force` and does not automatically accept further breaking major-version upgrades. Review and commit any dependency or lockfile changes produced by the fix. The project does not currently commit a package lockfile, so a reproducible `npm ci` installation is not yet available.

## Linux

From the repository root:

    chmod +x scripts/install.sh
    ./scripts/install.sh

Run as a user permitted to run Docker. The Linux installer currently provisions the Docker deployment only; it does not require Node.js or npm on the host.

The installer secures .env and secret files. The API key and generated device-credential encryption key are owned by UID 1000 for the API container on Linux. Keep the encryption key backed up separately from the database, because registered firewall credentials cannot be decrypted without it.

## Optional code-server

The installer asks whether to enable code-server. Default is No. If enabled, it generates a unique password or accepts one of at least 16 characters. The password is displayed at completion and saved in secrets/code_server_password. code-server is localhost-bound, isolated from the application network, and has no Docker socket. Its workspace is ./workspace.

## Security

The application is available at http://127.0.0.1:8080 by default. Optional code-server is at http://127.0.0.1:8443. API and PostgreSQL are not published. TLS verification is never disabled. Provide a private CA PEM when prompted if needed.

The manager UI includes local administrator setup and session authentication. Keep it loopback-only until the remaining production security review is complete. Use an authenticated SSH tunnel for remote access. Do not publish it through a public reverse proxy.

## Operations

    docker compose ps
    docker compose logs -f api
    docker compose logs -f web

The API applies database migrations during startup, including the encrypted firewall-credential fields. The installer creates the separate encryption-key secret if it does not already exist. The installer waits for Compose health checks and probes the web health endpoint. It does not connect to or modify the production LXC.
