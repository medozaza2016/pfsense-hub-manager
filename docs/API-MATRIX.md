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

## Page-scoped read operations (granted, not runtime-verified)

DEC-047 and DEC-048 add a separate, fixed, GET-only allowlist for on-demand page reads. The operator granted all 21 privileges to `pfsense_hub`; **no runtime response has been verified yet**, so "Device" reads *Granted* and the manager tests use constructed fixtures. These operations are not polled, do not write `poll_runs`, and do not count as capability evidence.

| Method | Path | Device | Backend | Frontend | Automated tests |
|---|---|---|---|---|---|
| GET | `/api/v2/firewall/aliases` | Granted | Implemented | Aliases page | Sanitizer + route |
| GET | `/api/v2/interfaces` | Granted | Implemented | Interfaces configuration | Sanitizer + route |
| GET | `/api/v2/firewall/rules` | Granted | Implemented | Firewall Rules page | Sanitizer + route |
| GET | `/api/v2/firewall/nat/port_forwards` | Granted | Implemented | NAT page | Sanitizer + route |
| GET | `/api/v2/firewall/nat/outbound/mappings` | Granted | Implemented | NAT page | Sanitizer + route |
| GET | `/api/v2/firewall/nat/one_to_one/mappings` | Granted | Implemented | NAT page | Sanitizer + route |
| GET | `/api/v2/routing/static_routes` | Granted | Implemented | Routing page | Sanitizer + route |
| GET | `/api/v2/services/dhcp_servers` | Granted | Implemented | DHCP page | Sanitizer + route |
| GET | `/api/v2/services/dhcp_server/address_pools` | Granted | Implemented | DHCP page | Sanitizer + route |
| GET | `/api/v2/services/dhcp_server/static_mappings` | Granted | Implemented | DHCP page | Sanitizer + route |
| GET | `/api/v2/services/dns_resolver/settings` | Granted | Implemented | DNS page | Sanitizer + route |
| GET | `/api/v2/services/dns_resolver/host_overrides` | Granted | Implemented | DNS page | Sanitizer + route |
| GET | `/api/v2/services/dns_resolver/domain_overrides` | Granted | Implemented | DNS page | Sanitizer + route |
| GET | `/api/v2/system/certificates` | Granted | Implemented | Certificates page | Sanitizer + route |
| GET | `/api/v2/system/certificate_authorities` | Granted | Implemented | Certificates page | Sanitizer + route |
| GET | `/api/v2/status/ipsec/sas` | Granted | Implemented | VPN page | Sanitizer + route |
| GET | `/api/v2/status/openvpn/servers` | Granted | Implemented | VPN page | Sanitizer + route |
| GET | `/api/v2/status/openvpn/clients` | Granted | Implemented | VPN page | Sanitizer + route |
| GET | `/api/v2/status/wireguard/tunnels` | Granted | Implemented | VPN page | Sanitizer + route |
| GET | `/api/v2/status/wireguard/peers` | Granted | Implemented | VPN page | Sanitizer + route |
| GET | `/api/v2/system/restapi/version` | Granted | Implemented | Compatibility page | Sanitizer + route |

Write methods on these paths remain prohibited and unprivileged. See [INTEGRATION-STATUS.md](INTEGRATION-STATUS.md) for the verification checklist that must be completed before any row changes from *Granted* to *Verified*.
With the original JSON already committed at `docs/reference/pfsense-openapi.json`, run:

```bash
node scripts/generate-api-matrix.mjs
```

This writes `docs/API-MATRIX.generated.md` with tag, method, path, operation ID, summary, authentication, privileges, required packages, request/response schema references, immediate-apply behavior, and cache behavior.

Device verification, backend implementation, frontend exposure, and automated tests remain separate statuses. See `API-COMPATIBILITY.md`. Presence in the specification does not imply support or permission to invoke a write operation.
