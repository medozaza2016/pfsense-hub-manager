# Installation

Docker Engine and Docker Compose v2 are host prerequisites. Node.js is not required on the host.

## Windows 11

From the repository root in PowerShell:

    Set-ExecutionPolicy -Scope Process Bypass
    .\scripts\install.ps1

Docker Desktop must be running.

## Linux

From the repository root:

    chmod +x scripts/install.sh
    ./scripts/install.sh

Run as a user permitted to run Docker. The installer secures .env and secret files. The API key and generated device-credential encryption key are owned by UID 1000 for the API container on Linux. Keep the encryption key backed up separately from the database, because registered firewall credentials cannot be decrypted without it.

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
