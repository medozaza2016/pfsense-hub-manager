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

The manager's approved read-only integration contains **nine GET operations** on the Netgate 2100 running pfSense Plus 26.07.2-RELEASE: eight core operational reads and one separate REST API package-version metadata probe. The compatibility page currently reports 9 of 9 endpoint checks verified for this device. This is per-device evidence, not proof of CE compatibility. Endpoint-specific response mapping and automated upstream contract tests remain incomplete.

| Method | Path | Device | Backend | Frontend | Automated tests |
|---|---|---|---|---|
| GET | `/api/v2/status/system` | Verified | Implemented | Aggregate check | Not tested |
| GET | `/api/v2/status/gateways` | Verified | Implemented | Not exposed | Not tested |
| GET | `/api/v2/status/interfaces` | Verified | Implemented | Not exposed | Not tested |
| GET | `/api/v2/status/services` | Verified | Implemented | Not exposed | Not tested |
| GET | `/api/v2/system/version` | Verified | Implemented | Not exposed | Not tested |
| GET | `/api/v2/diagnostics/arp_table` | Verified | Implemented | Not exposed | Not tested |
| GET | `/api/v2/firewall/states` | Verified | Implemented | Not exposed | Not tested |
| GET | `/api/v2/firewall/states/size` | Verified | Implemented | Not exposed | Not tested |
| GET | `/api/v2/system/restapi/version` | Verified | Implemented, metadata probe | Compatibility metadata | Not tested |

The ninth operation, `GET /api/v2/system/restapi/version`, is a package-version metadata probe, separate from the eight core operational checks. Its adjacent `PATCH` operation is not enabled.

## Generate the full inventory
With the original JSON already committed at `docs/reference/pfsense-openapi.json`, run:

```bash
node scripts/generate-api-matrix.mjs
```

This writes `docs/API-MATRIX.generated.md` with tag, method, path, operation ID, summary, authentication, privileges, required packages, request/response schema references, immediate-apply behavior, and cache behavior.

Device verification, backend implementation, frontend exposure, and automated tests remain separate statuses. See `API-COMPATIBILITY.md`. Presence in the specification does not imply support or permission to invoke a write operation.
