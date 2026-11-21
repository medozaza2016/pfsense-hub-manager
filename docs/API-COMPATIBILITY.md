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
| REST API package version | v2.11.0, as displayed by the manager compatibility profile on 2026-11-21 |
| Authentication | Dedicated regular user `pfsense_hub`, API key |
| TLS | Self-signed certificate, diagnostic verification bypass only |

The eight core operational GET operations were previously verified against this Plus firewall: `/api/v2/status/system`, `/api/v2/status/gateways`, `/api/v2/status/interfaces`, `/api/v2/status/services`, `/api/v2/system/version`, `/api/v2/diagnostics/arp_table`, `/api/v2/firewall/states`, and `/api/v2/firewall/states/size`. A ninth read-only GET, `/api/v2/system/restapi/version`, was added specifically to discover the installed package version. The compatibility UI reported 9 of 9 endpoint checks as Verified and displayed package version `v2.11.0` on 2026-11-21. See `INTEGRATION-STATUS.md`.

## Compatibility metadata collection

The manager includes one additional approved read-only probe: `GET /api/v2/system/restapi/version`. It reads the installed package version from `data.current_version`; the current Plus device profile displays `v2.11.0`. The adjacent `PATCH` operation is excluded. Release and architecture are stored only when explicitly named fields are present in existing responses, never inferred from CPU model. Missing values remain unknown. Probe failures do not affect operational connection health or erase existing metadata. The verification timestamp advances only when a package version is returned, and does not mean the full compatibility matrix is certified.

## Verification workflow
1. Pin the OpenAPI source and checksum.
2. Record target firewall edition, release, architecture, and package version.
3. Compare operation path, method, privileges, package requirements, and schemas.
4. Test only approved read-only operations using least privilege and verified TLS.
5. Store sanitized evidence: timestamp, device ID, operation ID, HTTP status, schema-validation result, and package version.
6. Re-run after firewall or package upgrades.

Never invoke write operations to discover whether they work. They require separate approval and the controls in `SECURITY.md`.
