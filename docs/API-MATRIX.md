# pfSense REST API Matrix

The operation-level inventory is generated from `docs/reference/pfsense-openapi.json` by `scripts/generate-api-matrix.mjs`. Do not maintain the generated table manually.

## Source snapshot summary

The supplied OpenAPI 3.0 snapshot contains **267 paths, 694 operations, and 186 component schemas**. Its metadata version is `unknown`, not the installed package version.

| OpenAPI tag | Operations |
|---|---:|
| SERVICES | 302 |
| FIREWALL | 99 |
| VPN | 84 |
| SYSTEM | 71 |
| INTERFACE | 39 |
| STATUS | 30 |
| ROUTING | 28 |
| USER | 20 |
| DIAGNOSTICS | 15 |
| AUTH | 5 |
| GRAPHQL | 1 |
| **Total** | **694** |

## Currently verified Plus operations

These eight GET calls returned HTTP 200 against the Netgate 2100 running pfSense Plus 26.07.2-RELEASE. They are wired into the backend's fixed read-only client allowlist. The client now validates the response envelope and minimum per-operation data shape at runtime; malformed payloads are classified as `invalid_response` and recorded as failed polls. These schemas are defensive shape checks, not a complete version-pinned upstream contract or proof of CE compatibility.

| Method | Path | Device | Backend | Frontend | Automated tests |
|---|---|---|---|---|
| GET | `/api/v2/status/system` | Verified | Implemented | Aggregate check | Runtime shape tests |
| GET | `/api/v2/status/gateways` | Verified | Implemented | Not exposed | Runtime shape tests |
| GET | `/api/v2/status/interfaces` | Verified | Implemented | Not exposed | Runtime shape tests |
| GET | `/api/v2/status/services` | Verified | Implemented | Not exposed | Runtime shape tests |
| GET | `/api/v2/system/version` | Verified | Implemented | Not exposed | Runtime shape tests |
| GET | `/api/v2/diagnostics/arp_table` | Verified | Implemented | Not exposed | Runtime shape tests |
| GET | `/api/v2/firewall/states` | Verified | Implemented | Not exposed | Runtime shape tests |
| GET | `/api/v2/firewall/states/size` | Verified | Implemented | Not exposed | Runtime shape tests |

## Generate the full inventory
With the original JSON already committed at `docs/reference/pfsense-openapi.json`, run:

```bash
node scripts/generate-api-matrix.mjs
```

This writes `docs/API-MATRIX.generated.md` with tag, method, path, operation ID, summary, authentication, privileges, required packages, request/response schema references, immediate-apply behavior, and cache behavior.

Device verification, backend implementation, frontend exposure, and automated tests remain separate statuses. See `API-COMPATIBILITY.md`. Presence in the specification does not imply support or permission to invoke a write operation.
