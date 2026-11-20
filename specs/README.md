# Upstream API specifications

Place the original, unmodified user-supplied pfSense REST API OpenAPI JSON at `specs/pfsense-openapi.json`. The source snapshot identifies OpenAPI 3.0.0, title "pfSense REST API Documentation", and metadata version "unknown". Record a SHA-256 checksum and date when adding the original file. Do not confuse the metadata version with the installed REST API package version on a firewall.

Generate the operation inventory from the repository root using:

`node scripts/generate-api-matrix.mjs`

See `docs/API-SPECIFICATION.md`, `docs/API-MATRIX.md`, and `docs/API-COMPATIBILITY.md`.
