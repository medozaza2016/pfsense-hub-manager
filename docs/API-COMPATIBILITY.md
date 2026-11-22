# pfSense API Compatibility

## Purpose
Track actual support independently for each firewall. The upstream OpenAPI specification is an inventory, not proof of compatibility with a particular device.

## Compatibility identity
For each device, record application device ID, pfSense edition, release, hardware architecture, exact REST API package version, pinned OpenAPI source checksum, and last verification date. Do not infer CE support from a Plus test.

## Status vocabulary
| Dimension | Statuses |
|---|---|
| Specification | Present / Removed / Changed |
| Device verification | Unknown / Verified / Unsupported |
| Backend | Not implemented / Implemented |
| Frontend | Not exposed / Exposed |
| Automated tests | Not tested / Passing / Failing |

Track each dimension independently. An operation can be specified but unknown on a device, or verified but not yet implemented.

## Current first-device evidence
| Property | Value |
|---|---|
| Device | Netgate 2100 |
| Edition | pfSense Plus |
| Release | 26.07.2-RELEASE |
| Architecture | ARM, ARM Cortex-A53 |
| REST API package version | Not recorded |
| Authentication | Dedicated regular user `pfsense_hub`, API key |
| TLS | Self-signed certificate, diagnostic verification bypass only |

Eight GET operations returned HTTP 200 from the manager LXC: `/api/v2/status/system`, `/api/v2/status/gateways`, `/api/v2/status/interfaces`, `/api/v2/status/services`, `/api/v2/system/version`, `/api/v2/diagnostics/arp_table`, `/api/v2/firewall/states`, and `/api/v2/firewall/states/size`. See `INTEGRATION-STATUS.md`.

## Current adapter contract checks, November 22, 2026

The pfSense client validates the common API envelope and a minimum operation-specific `data` shape for each of the eight approved read-only operations. Structurally malformed payloads are rejected as `invalid_response`; the provider records the operation as a failed poll rather than counting it as successful. Automated tests cover valid and malformed examples for every operation.

These checks are intentionally minimal and do not claim a full upstream schema contract. Field names and semantics remain release/package-dependent until sanitized responses from each supported release and API package version are captured and reviewed. The first Plus device's exact REST API package version remains unrecorded, and the second CE firewall has not been connected.

## Verification workflow
1. Pin the OpenAPI source and checksum.
2. Record target firewall edition, release, architecture, and package version.
3. Compare operation path, method, privileges, package requirements, and schemas.
4. Test only approved read-only operations using least privilege and verified TLS.
5. Store sanitized evidence: timestamp, device ID, operation ID, HTTP status, schema-validation result, and package version.
6. Re-run after firewall or package upgrades.

Never invoke write operations to discover whether they work. They require separate approval and the controls in `SECURITY.md`.
