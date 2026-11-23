# Domain Model and Manager API Contract

## Status and design rules

This document defines the initial application-owned domain model and manager-facing REST API contract for the read-only milestone. It is a design baseline, not an assertion that the pfSense REST API returns these exact field names or shapes.

The model is normalized around the manager's concepts. The pfSense adapter is responsible for translating edition- and package-specific responses into these types. Do not expose raw pfSense response objects as the public manager API.

Rules:

- Every managed device has a manager-generated stable ID. Firewall serial numbers and Netgate identifiers are not public IDs.
- Every device-specific record is scoped to a `deviceId`.
- Device identity and connection metadata are distinct from credentials. Store only a secret reference in device metadata.
- Missing, unsupported, stale, and unknown values must remain distinguishable from healthy/zero/false values.
- Measurements carry observation timestamps and source information where available.
- The initial application exposes read-only manager routes. No write route is defined here.
- Exact field mappings, units, enum values, and pagination behavior must be confirmed against captured, redacted responses from each supported firewall/API version before adapter implementation.

## 1. Core entities

### ManagedDevice

Represents one firewall known to the manager.

| Field | Type | Meaning |
|---|---|---|
| id | string (UUID) | Manager-generated immutable identifier |
| name | string | Operator-assigned display name |
| location | string or null | Operator-assigned site label |
| enabled | boolean | Whether collection is enabled |
| edition | `plus` | `ce` | `unknown` | Detected or configured pfSense edition |
| release | string or null | Detected pfSense release |
| architecture | string or null | Detected platform architecture |
| apiPackageVersion | string or null | Detected REST API package version |
| apiBaseUrl | string | Configured API origin, without credentials |
| credentialRef | string | Opaque reference to server-side secret storage |
| compatibility | CompatibilityStatus | Current adapter compatibility assessment |
| createdAt | ISO 8601 timestamp | Manager record creation time |
| updatedAt | ISO 8601 timestamp | Manager record update time |
| lastContactAt | ISO 8601 timestamp or null | Most recent successful contact |
| lastSuccessfulPollAt | ISO 8601 timestamp or null | Most recent successful collection |

Do not return `credentialRef` or the configured API URL in general inventory responses unless an authenticated administrative detail operation specifically needs them. Never return the credential value.

### CompatibilityStatus

- `verified`: required read capability has been tested for this device's detected profile.
- `partial`: some capabilities are verified, others are unsupported or unverified.
- `unverified`: the device profile or endpoint compatibility has not yet been validated.
- `unsupported`: the required integration capability is known not to be supported.
- `unknown`: insufficient information to determine compatibility.

Compatibility is per device and capability, not a global assertion that Plus and CE behave identically.

### DeviceHealth

A current summary derived from the latest observations, not a direct copy of one pfSense response.

| Field | Type | Meaning |
|---|---|---|
| deviceId | string | Managed device ID |
| reachability | `reachable` | `unreachable` | `unknown` | Manager's latest connection assessment |
| systemStatus | `healthy` | `degraded` | `critical` | `unknown` | Manager-normalized health state |
| cpuUsagePercent | number or null | CPU utilization, percent |
| memoryUsagePercent | number or null | Memory utilization, percent |
| diskUsagePercent | number or null | Disk utilization, percent |
| uptimeSeconds | number or null | Uptime, if the source exposes it |
| observedAt | ISO 8601 timestamp or null | Time represented by the source observation |
| collectedAt | ISO 8601 timestamp | Time the manager collected it |
| freshness | `fresh` | `stale` | `missing` | Manager assessment of observation age |

Thresholds for healthy/degraded/critical and the stale interval are not set in this contract. Do not invent thresholds in the adapter.

### GatewayObservation

| Field | Type | Meaning |
|---|---|---|
| deviceId | string | Managed device ID |
| gatewayId | string | Stable within the device, adapter-derived |
| name | string | Gateway name |
| interfaceName | string or null | Associated interface |
| status | `online` | `offline` | `unknown` | Normalized status |
| latencyMs | number or null | Measured latency, if exposed |
| packetLossPercent | number or null | Packet loss, percent, if exposed |
| observedAt | ISO 8601 timestamp or null | Source observation time |
| collectedAt | ISO 8601 timestamp | Manager collection time |
| freshness | Freshness | Observation freshness |

### InterfaceObservation

| Field | Type | Meaning |
|---|---|---|
| deviceId | string | Managed device ID |
| interfaceId | string | Stable within the device, adapter-derived |
| name | string | pfSense interface name |
| description | string or null | Configured description |
| assigned | boolean or null | Whether assigned, if known |
| enabled | boolean or null | Administrative state, if known |
| linkState | `up` | `down` | `unknown` | Link state |
| macAddress | string or null | MAC address, if exposed and approved for display |
| ipv4Addresses | string[] | IPv4 addresses in CIDR notation |
| ipv6Addresses | string[] | IPv6 addresses in CIDR notation |
| observedAt | ISO 8601 timestamp or null | Source observation time |
| collectedAt | ISO 8601 timestamp | Manager collection time |
| freshness | Freshness | Observation freshness |

An empty address list means the adapter confirmed there are no addresses. An unavailable or unsupported address field must not be represented as an empty list without an accompanying field/capability status.

### ServiceObservation

| Field | Type | Meaning |
|---|---|---|
| deviceId | string | Managed device ID |
| serviceId | string | Stable within the device, adapter-derived |
| name | string | Service identifier |
| displayName | string or null | Friendly label, if known |
| status | `running` | `stopped` | `unknown` | Normalized runtime status |
| enabled | boolean or null | Configured enablement, if exposed |
| observedAt | ISO 8601 timestamp or null | Source observation time |
| collectedAt | ISO 8601 timestamp | Manager collection time |
| freshness | Freshness | Observation freshness |

### FirewallStateSummary

The initial contract exposes aggregate state-table information only.

| Field | Type | Meaning |
|---|---|---|
| deviceId | string | Managed device ID |
| stateCount | number or null | Current state count |
| observedAt | ISO 8601 timestamp or null | Source observation time |
| collectedAt | ISO 8601 timestamp | Manager collection time |
| freshness | Freshness | Observation freshness |

Individual state entries and ARP records can contain sensitive network metadata. They are not part of the initial dashboard contract. Their use, access control, and retention require a separate product decision.

### PollResult

Represents one collection attempt for one device and one collection group.

| Field | Type | Meaning |
|---|---|---|
| id | string (UUID) | Manager-generated poll ID |
| deviceId | string | Target device |
| group | `system` | `gateways` | `interfaces` | `services` | `firewallStates` | `version` | Collection group |
| outcome | `success` | `partial` | `failure` | Collection outcome |
| startedAt | ISO 8601 timestamp | Attempt start |
| completedAt | ISO 8601 timestamp | Attempt completion |
| durationMs | number | Elapsed time |
| error | ApiError or null | Classified failure, with sensitive details removed |

A poll result records collection metadata. It is not itself a substitute for the latest observation.

### Freshness

Use `fresh`, `stale`, or `missing`. The policy threshold is configurable only after polling cadence and dashboard requirements are decided. A failed poll must not silently overwrite a previously collected value with zero or null. Return the previous observation with its original timestamp and mark its freshness accordingly.

### Capability

| Field | Type | Meaning |
|---|---|---|
| key | string | Manager capability key, for example `status.system.read` |
| supported | boolean | Whether the adapter confirms support |
| verification | `tested` | `documented` | `unknown` | Evidence level |
| reason | string or null | Safe explanation when unavailable |

Capability keys are manager-owned and independent of raw firewall endpoint paths.

## 2. Common API conventions

- Base path: `/api/v1`.
- JSON request and response bodies use UTF-8.
- Timestamps use ISO 8601 UTC strings.
- Resource IDs are opaque manager-generated identifiers.
- Collection endpoints return a `data` array and optional `meta`.
- Device-specific endpoints use the manager's `deviceId`, never a raw firewall hostname as a path identifier.
- The API must not forward arbitrary caller-supplied paths, methods, headers, or URLs to a firewall.
- Authentication and authorization are mandatory at the server boundary, but the identity/session mechanism remains undecided.
- No endpoint in this initial contract changes firewall configuration.

## 3. Initial manager API routes

### Health and application metadata

| Method | Route | Purpose |
|---|---|---|
| GET | `/health/live` | Process liveness, no dependency checks |
| GET | `/health/ready` | Readiness of required application components |
| GET | `/api/v1/version` | Manager application version and API version |

Health endpoints must not disclose secrets, internal topology, or detailed dependency credentials.

### Device inventory and details

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/devices` | List managed devices and safe summary fields |
| GET | `/api/v1/devices/:deviceId` | Retrieve one device's safe details |
| GET | `/api/v1/devices/:deviceId/capabilities` | Retrieve the device's capability state derived from its own recorded poll outcomes |
| GET | `/api/v1/devices/:deviceId/snapshot` | Retrieve one sanitized read-only telemetry snapshot for the site workspace |
| GET | `/api/v1/devices/:deviceId/overview` | Alias of the snapshot handler, retained for the pre-existing path |

Manager-owned site lifecycle routes are separate from pfSense configuration operations and require an authenticated administrator. They only change the Hub's local inventory and encrypted connection material.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/v1/devices` | Register a site after a successful read-only TLS/API connection test |
| GET | `/api/v1/devices/:deviceId/profile` | Retrieve editable, non-secret connection profile fields |
| PATCH | `/api/v1/devices/:deviceId` | Update name, location, edition, and HTTPS API origin |
| PATCH | `/api/v1/devices/:deviceId/enabled` | Enable or disable manager polling for a site |
| PUT | `/api/v1/devices/:deviceId/credential` | Verify a replacement API credential with a read-only version request, then rotate the encrypted credential |
| PUT | `/api/v1/devices/:deviceId/tls-trust` | Set or clear the encrypted custom CA trust bundle |
| DELETE | `/api/v1/devices/:deviceId` | Archive the manager-side site, requiring request body `{ "confirmation": "ARCHIVE" }` |

Archival is non-destructive to operational history: it disables and hides the profile from active inventory, purges encrypted API credentials and custom TLS trust, resolves active/acknowledged device alerts, and retains polling history, alert records, and append-only audit events. Demo records are excluded from profile editing and archival. None of these routes enables POST, PUT, PATCH, or DELETE operations against pfSense itself.

### Current observations

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/devices/:deviceId/health` | Latest normalized system health |
| GET | `/api/v1/devices/:deviceId/gateways` | Latest gateway observations |
| GET | `/api/v1/devices/:deviceId/interfaces` | Latest interface observations |
| GET | `/api/v1/devices/:deviceId/services` | Latest service observations |
| GET | `/api/v1/devices/:deviceId/firewall-states/summary` | Latest aggregate state-table observation |
| GET | `/api/v1/devices/:deviceId/polls` | Recent poll outcomes for the device |

A successful response may contain stale observations if the most recent poll failed. The response must include `collectedAt` and `freshness` so the UI can distinguish last-known data from current data.

## 4. Response envelopes

### Single resource

```json
{
  "data": {
    "deviceId": "opaque-manager-id",
    "reachability": "reachable",
    "freshness": "fresh",
    "collectedAt": "2026-11-19T23:00:00Z"
  }
}
```

The values above are illustrative contract examples, not observed firewall values.

### Collection

```json
{
  "data": [],
  "meta": {
    "deviceId": "opaque-manager-id",
    "collectedAt": "2026-11-19T23:00:00Z",
    "freshness": "fresh"
  }
}
```

### Error

```json
{
  "error": {
    "code": "DEVICE_UNREACHABLE",
    "message": "The managed device could not be reached.",
    "requestId": "opaque-request-id",
    "retryable": true
  }
}
```

Error messages are safe for the client. Do not include API keys, authorization headers, raw upstream payloads, stack traces, private IP details beyond what the authorized UI needs, or certificate private material.

Initial normalized error codes:

- `DEVICE_NOT_FOUND`
- `DEVICE_UNREACHABLE`
- `DEVICE_TIMEOUT`
- `TLS_VALIDATION_FAILED`
- `DEVICE_AUTHENTICATION_FAILED`
- `DEVICE_AUTHORIZATION_FAILED`
- `CAPABILITY_UNSUPPORTED`
- `UPSTREAM_RATE_LIMITED`
- `UPSTREAM_ERROR`
- `UPSTREAM_INVALID_RESPONSE`
- `INTERNAL_ERROR`

HTTP status mapping should be consistent: 400 for invalid manager request, 401/403 for manager authentication/authorization, 404 for unknown manager resource, 502 for invalid/upstream failures, 503 for unavailable dependencies or device, and 504 for upstream timeout. The final mapping should be implemented and tested as a centralized error policy.

## 5. Mapping from verified Plus endpoints

The current integration record confirms HTTP 200 from these eight read-only endpoints on one pfSense Plus 26.07.2-RELEASE device. This is evidence of reachability and successful response, not a complete schema contract.

| Verified pfSense endpoint | Manager model / use |
|---|---|
| `GET /api/v2/status/system` | DeviceHealth and system metadata |
| `GET /api/v2/status/gateways` | GatewayObservation collection |
| `GET /api/v2/status/interfaces` | InterfaceObservation collection |
| `GET /api/v2/status/services` | ServiceObservation collection |
| `GET /api/v2/system/version` | ManagedDevice release and version metadata |
| `GET /api/v2/diagnostics/arp_table` | Not exposed in initial manager API |
| `GET /api/v2/firewall/states` | Not exposed as individual entries in initial manager API |
| `GET /api/v2/firewall/states/size` | FirewallStateSummary |

The verified first firewall is a Netgate 2100 running pfSense Plus 26.07.2-RELEASE on ARM Cortex-A53. The exact REST API package version is not yet recorded. The original successful manual tests used temporary TLS certificate verification bypass because the certificate was self-signed; that bypass is historical. The manager client now connects to this device with validation enabled, using a device-scoped CA bundle and a pinned TLS server name, and collected all eight approved operations over that connection on November 23, 2026.

The supplied REST API permission inventory contains many additional methods, including configuration-changing methods. Their presence in that inventory does not make them part of this contract or authorize their use.

## 6. Validation and unresolved schema work

Before implementing the adapter, capture sanitized examples for each of the eight verified endpoints. Remove API keys, serial numbers, Netgate IDs, public addresses, private network details, hostnames, and other sensitive values before committing fixtures.

For each endpoint, record:

1. Exact API package version and firewall release/architecture.
2. HTTP status and content type.
3. Response envelope and field names.
4. Nullability, enum values, units, and timestamp semantics.
5. Pagination or collection-size behavior.
6. Runtime validation schema and mapping to manager-owned types.
7. Whether the field is safe and necessary to display or retain.

Do not infer CE compatibility from the Plus results. Repeat compatibility and schema validation independently when the CE device is connected.

## 7. Database-neutral persistence guidance

The model deliberately does not prescribe a database. When persistence is selected, keep these logical record groups distinct:

- Device inventory and non-secret configuration metadata.
- Device capability and compatibility assessments.
- Latest normalized observations by device and observation type.
- Poll execution history and classified failures.
- Later, separately approved audit/change records.

Do not persist raw firewall payloads by default. Define retention and backup requirements before selecting storage. The API contract should remain independent of the chosen persistence engine.
