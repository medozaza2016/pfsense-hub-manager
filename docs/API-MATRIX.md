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


## Additional read-only inventory operations implemented

These operations are separate from the nine-operation core monitoring and compatibility baseline above. They are used only by the administrator-only firewall rules inventory.

| Method | Path | Purpose | Manager exposure | Status |
|---|---|---|---|---|
| GET | `/api/v2/firewall/rules` | Read firewall rule collection | `GET /api/v1/devices/:deviceId/firewall/rules` | Implemented, bounded, normalized, first Plus live-verified |
| GET | `/api/v2/interfaces` | Read configured interface assignments and descriptions | `GET /api/v1/devices/:deviceId/interfaces` | Implemented, first Plus live-verified |

The interface assignment response uses `id` as the logical interface identifier and `descr` as its human-readable label. The rules UI displays labels such as `Main (OPT1)`. These endpoints do not expand routine polling. Both manager routes are administrator-only. Only endpoint-specific GET privileges are used, not `page-all`. Firewall configuration writes remain disabled.
