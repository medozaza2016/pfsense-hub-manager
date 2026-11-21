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

Run as a user permitted to run Docker. The installer secures .env and secret files. The API key file is owned by UID 1000 for the API container.

## Optional code-server

The installer asks whether to enable code-server. Default is No. If enabled, it generates a unique password or accepts one of at least 16 characters. The password is displayed at completion and saved in secrets/code_server_password. code-server is localhost-bound, isolated from the application network, and has no Docker socket. Its workspace is ./workspace.

## Security

The application is available at http://127.0.0.1:8080 by default. Optional code-server is at http://127.0.0.1:8443. API and PostgreSQL are not published. TLS verification is never disabled. Provide a private CA PEM when prompted if needed.

The application has no manager login yet. Keep it loopback-only and use an authenticated SSH tunnel for remote access. Do not publish it through a public reverse proxy.

## Operations

    docker compose ps
    docker compose logs -f api
    docker compose logs -f web

The API executes the existing SQL migration during startup. The installer waits for Compose health checks and probes the web health endpoint. It does not connect to or modify the production LXC.
