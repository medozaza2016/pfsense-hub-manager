# pfSense REST API Integration Specification

## Scope

This document records the API behavior verified against one Netgate 2100 running pfSense Plus 26.07.2-RELEASE. It is not a claim of compatibility with every pfSense Plus or CE release.

The API is the community-maintained pfSense REST API package. It is unofficial and not a Netgate-supported API. Record and verify the exact installed package version before relying on the integration in production.

## Connection profile (development only)

- Device identifier: assign an application-generated ID; do not use a serial number as a public identifier.
- Address tested from manager: 172.10.50.1
- Port: 10443
- Base URL: https://172.10.50.1:10443
- Authentication: API key in the X-API-Key HTTP header
- TLS: self-signed certificate observed; validation was bypassed only during diagnostic curl tests. Production TLS verification is mandatory.

Do not copy this development address or credential into frontend code. Store device connection settings and secrets server-side.

## Common response envelope observed

Successful responses used a JSON envelope with:
- code
- status
- response_id
- message
- data

The system endpoint returned code 200, status ok, and response_id SUCCESS. An unauthenticated request returned HTTP 401 and an envelope with code 401, status unauthorized, response_id AUTH_AUTHENTICATION_FAILED, message Authentication failed, and an empty data array.

Do not assume all endpoints return the same data shape. Validate each response at runtime and version the adapter behavior.

## Verified endpoint inventory

| Method | Path | Result on tested Plus firewall |
|---|---|---|
| GET | /api/v2/status/system | HTTP 200 |
| GET | /api/v2/status/gateways | HTTP 200 |
| GET | /api/v2/status/interfaces | HTTP 200 |
| GET | /api/v2/status/services | HTTP 200 |
| GET | /api/v2/system/version | HTTP 200 |
| GET | /api/v2/diagnostics/arp_table | HTTP 200 |
| GET | /api/v2/firewall/states | HTTP 200 |
| GET | /api/v2/firewall/states/size | HTTP 200 |

## Observed fields and sample values

The system response included platform, CPU model, CPU count, CPU usage, CPU load averages, memory usage, disk usage, uptime, BIOS metadata, and other platform fields. Serial and Netgate identifiers were present but are deliberately excluded from documentation and application display by default.

The gateway response included gateway name, source IP, monitor IP, delay, standard deviation, packet loss, status, and substatus. WAN_DHCP was online in the captured test.

The interfaces response included interface name, description, hardware interface, MAC address, MTU, enable/status flags, IP and subnet fields, and additional values.

The services response included service name, description, enabled flag, and status. The captured response included unbound, ntpd, and syslogd.

The version response reported 26.07.2-RELEASE.

The ARP table response included host, IP, MAC, interface, type, DNS resolution, and expiry information. This is sensitive network inventory and should be access-controlled and retained only when required.

The firewall states response included interface, protocol, direction, source, destination, state, age, expiry, and packet-related fields. This can expose traffic metadata and must not be logged or persisted indiscriminately.

The state-size response included maximumstates, defaultmaximumstates, and currentstates. The captured currentstates value was 2,337 and defaultmaximumstates was 340,000.

## Authentication

The successful test used:

- Header: X-API-Key
- Value: secret key belonging to the pfsense_hub local account

Do not put a real key in this file, test fixtures, source code, browser storage, or logs.

Basic Authentication was attempted with the dedicated username and returned HTTP 401 in the recorded test. The working authentication method established by the test is API-key authentication.

## Error handling requirements

The integration should distinguish:
- Network timeout or connection refusal.
- TLS certificate validation failure.
- HTTP 401 authentication failure.
- HTTP 403 authorization failure.
- HTTP 404 unsupported or unavailable route.
- Other non-success HTTP responses.
- Invalid JSON or invalid response schema.
- Endpoint unsupported on a given edition/package version.

Do not collapse all failures into a generic offline state.

## Not yet verified

- Exact package version.
- Pagination behavior and maximum result sizes.
- Rate limits and safe polling frequency.
- Schema stability across package versions.
- Endpoint availability on pfSense CE.
- Behavior on other Plus releases and architectures.
- Any write or configuration-changing endpoint.

No write endpoint is part of the initial integration contract.


## User-supplied OpenAPI source snapshot

The user supplied an OpenAPI 3.0 JSON document titled **pfSense REST API Documentation**. Its metadata identifies [pfSense-pkg-RESTAPI](https://github.com/pfrest/pfSense-pkg-RESTAPI), the Apache 2.0 license, and `info.version: unknown`. The snapshot contains 267 paths, 694 operations, and 186 component schemas. The exact installed API package version on the first firewall remains unrecorded.

Preserve the original JSON unchanged at `docs/reference/pfsense-openapi.json`. The original source is already committed at this path. Do not duplicate or relocate it. The generator reads this exact file.

The specification is an upstream contract reference, not proof that every operation exists on every pfSense Plus or CE release. Verify each supported operation against each firewall and its installed package version. The specification includes both read and write operations. The initial application release remains read-only, and no write operation is approved merely because it appears in the JSON.

Use the specification to generate `docs/API-MATRIX.generated.md` with `node scripts/generate-api-matrix.mjs`. Keep device compatibility evidence in `docs/API-COMPATIBILITY.md`.

## Manager site-snapshot contract, November 23, 2026

The manager exposes one sanitized read-only view per device: `GET /api/v1/devices/:deviceId/snapshot`. It performs the eight verified GET operations and returns only allowlisted fields. `GET /api/v1/devices/:deviceId/overview` is an alias of the same handler.

| Upstream endpoint | Manager fields retained | Deliberately excluded |
|---|---|---|
| `/api/v2/status/system` | `platform`, `uptime`, `cpu_count`, `cpu_usage`, `mem_usage`, `disk_usage`, `swap_usage`, `cpu_load_avg` | `serial`, `netgate_id`, BIOS metadata, temperature |
| `/api/v2/status/gateways` | `name`, `delay`, `stddev`, `loss`, `status`, `substatus` | `srcip`, `monitorip` |
| `/api/v2/status/interfaces` | `name`, `descr`, `enable`, `status`, `ipaddr`, `subnet`, `ipaddrv6`, `mtu`, `media` | `macaddr`, `hwif`, `linklocal`, `dhcplink`, `gateway`, all byte/packet counters |
| `/api/v2/status/services` | `name`, `description`, `enabled`, `status` (boolean, exposed as `running`) | — |
| `/api/v2/system/version` | `version`, `base`, `patch`, `buildtime` | — |
| `/api/v2/diagnostics/arp_table` | entry count only | every ARP record |
| `/api/v2/firewall/states` | entry count only | every state record |
| `/api/v2/firewall/states/size` | `currentstates`, `maximumstates` | — |

Field names are taken from the pinned OpenAPI schemas `SystemStatus`, `SystemVersion`, `RoutingGatewayStatus`, `InterfaceStats`, and `Service`. No captured live response is stored in this repository. A payload that does not match the expected top-level shape is rejected as `invalid_response` and recorded as a failed operation; it is never partially trusted.

Honest absences: the installed REST API package version and CPU architecture are not exposed by any of the eight endpoints, so the manager reports them as unknown. `uptime` is converted to seconds only when it matches a complete duration; otherwise the sanitized text is shown with a null duration. Utilization values outside a sane range become null instead of being clamped.

Compatibility verdicts: `verified` means a release was reported and nothing contradicts the declared edition; `mismatch` means the release/platform string names the other edition; `unknown` means there is not enough evidence. Capability state comes from `poll_runs`, not from this specification.

## Manager page-scoped read contract, November 23, 2026 (DEC-047, DEC-048)

On-demand page reads use two fixed namespaces, separate from the eight polled status operations. Both return the same envelope:

```json
{ "data": { "deviceId": "…", "area": "rules", "collectedAt": "…", "count": 12, "truncated": false, "items": [] }, "meta": { "cacheHit": false, "durationMs": 12 } }
```

- `GET /api/v1/devices/:deviceId/configuration/:area` — **administrator-only** (server boundary; a non-administrator receives `403 ADMINISTRATOR_REQUIRED`).
- `GET /api/v1/devices/:deviceId/telemetry/:area` — **any authenticated caller**, matching the existing telemetry policy, because these areas report tunnel state or package-version metadata rather than stored configuration.

`items` holds the sanitized records; `dns-settings` and `restapi-version` each return exactly one element because the upstream endpoints document an object. `count` is the number retained and `truncated` marks a withheld tail. Unknown areas have no route and return the manager's `404` without any upstream call.

### Configuration areas

| Manager area | Upstream endpoint | Fields retained | Deliberately excluded |
|---|---|---|---|
| `aliases` | `/api/v2/firewall/aliases` | `name`, `type`, `descr`, `address` | `id`, `detail`, `tracker` |
| `interfaces` | `/api/v2/interfaces` | `if`, `descr`, `enable`, `typev4`, `ipaddr`, `subnet`, `typev6`, `ipaddrv6`, `mtu`, `media` | `spoofmac`, `adv_dhcp_*`, `dhcprejectfrom` |
| `rules` | `/api/v2/firewall/rules` | `type`, `interface`, `ipprotocol`, `protocol`, `source`/`source_port`, `destination`/`destination_port`, `descr`, `disabled`, `log`, `floating`, `direction`, `gateway` | `id`, `tracker`, `associated_rule_id`, `created_*`, `updated_*` |
| `nat-port-forwards` | `/api/v2/firewall/nat/port_forwards` | `interface`, `ipprotocol`, `protocol`, addresses/ports, `target`, `local_port`, `descr`, `disabled`, `natreflection` | `id`, `associated_rule_id`, `created_*`, `updated_*` |
| `nat-outbound` | `/api/v2/firewall/nat/outbound/mappings` | `interface`, `protocol`, `disabled`, `nonat`, addresses/ports, `target`, `target_subnet`, `nat_port`, `poolopts`, `descr` | `id`, `source_hash_key` |
| `nat-one-to-one` | `/api/v2/firewall/nat/one_to_one/mappings` | `interface`, `disabled`, `ipprotocol`, `natreflection`, `external`, `source`, `destination`, `descr` | `id` |
| `static-routes` | `/api/v2/routing/static_routes` | `network`, `gateway`, `descr`, `disabled` | `id` |
| `dhcp-servers` | `/api/v2/services/dhcp_servers` | `interface`, `enable`, `range_from`, `range_to`, `domain`, `gateway`, `dnsserver`, lease times, `denyunknown`, `staticarp` | `id`, advanced boot/option fields, `numberoptions` |
| `dhcp-address-pools` | `/api/v2/services/dhcp_server/address_pools` | `parent_id`, `range_from`, `range_to`, `gateway`, `domain` | `id`, advanced options |
| `dhcp-static-mappings` | `/api/v2/services/dhcp_server/static_mappings` | `parent_id`, `mac`, `ipaddr`, `hostname`, `descr`, `arp_table_static_entry` | `id`, `cid` |
| `dns-settings` | `/api/v2/services/dns_resolver/settings` | `enable`, `port`, `enablessl`, `tlsport`, `active_interface`, `outgoing_interface`, `dnssec`, `forwarding`, `regdhcp`, `regdhcpstatic`, `regovpnclients`, `strictout` | `custom_options`, `python*`, `sslcertref` |
| `dns-host-overrides` | `/api/v2/services/dns_resolver/host_overrides` | `host`, `domain`, `ip`, `descr`, `aliases` (count only) | `id`, alias records |
| `dns-domain-overrides` | `/api/v2/services/dns_resolver/domain_overrides` | `domain`, `ip`, `descr`, `forward_tls_upstream`, `tls_hostname` | `id` |
| `certificates` | `/api/v2/system/certificates` | `descr`, `type`, `valid_from`, `valid_until`, `valid_days_left` | `crt`, `prv`, `refid`, `caref`, `csr` |
| `certificate-authorities` | `/api/v2/system/certificate_authorities` | `descr`, `trust` | `crt`, `prv`, `refid`, `caref`, `serial` |

### Telemetry areas

| Manager area | Upstream endpoint | Fields retained | Deliberately excluded |
|---|---|---|---|
| `ipsec-sas` | `/api/v2/status/ipsec/sas` | `state`, `version`, host/ID pairs, `encr_alg`+`encr_keysize`, `integ_alg`, `dh_group`, `nat_remote`, `established` (ISO) | SPIs, `con_id`, `uniqueid`, `child_sas` |
| `openvpn-servers` | `/api/v2/status/openvpn/servers` | `name`, `mode`, `port`, `vpnid`, connection count | `mgmt`, `conns`, `routes` |
| `openvpn-clients` | `/api/v2/status/openvpn/clients` | `name`, `status`, `state`, `state_detail`, `connect_time`, virtual addresses, remote host/port | `mgmt` |
| `wireguard-tunnels` | `/api/v2/status/wireguard/tunnels` | `name`, `status`, `listen_port`, `mtu`, transfer/packet counters, `descr`, peer count | `public_key`, peer records |
| `wireguard-peers` | `/api/v2/status/wireguard/peers` | `tunnel_device`, `endpoint`, `allowed_ips`, `latest_handshake` (ISO), counters, `persistent_keepalive`, `descr` | `public_key`, `preshared_key` |
| `restapi-version` | `/api/v2/system/restapi/version` | `current_version`, `latest_version`, `latest_version_release_date`, `update_available` | every other upstream field |

### Behavior shared by every area

- The device is resolved from `managed_devices`; there is no caller-supplied URL, path, method, header, or body. Routes are GET only and registered per area, so an unapproved area cannot be reached at all.
- `400 INVALID_DEVICE_ID`; `404 DEVICE_NOT_FOUND` for unknown and demo records alike; `409 DEVICE_DISABLED`; `409 DEVICE_UNAVAILABLE` if the profile disappears between the check and the client build.
- Bounds: 2,000 records per area, 200 nested entries, 256-character nested entries, 200-character text, 64-character identifiers. Out-of-range integers become `null`; unknown enum members become `null`; only real JSON booleans are accepted; control characters are replaced. A nested list may be a single string when a release returns a scalar where the schema documents an array.
- A `data` value that does not match the documented top-level shape raises a shape error and returns `FIREWALL_INVALID_RESPONSE`; nothing is partially displayed. A configuration-shaped body cannot satisfy a status area, and vice versa.
- Upstream refusals: `502 FIREWALL_PERMISSION_DENIED` (message names the derived privilege), `502 FIREWALL_ENDPOINT_UNSUPPORTED` (message names the route), `502 FIREWALL_INVALID_RESPONSE`, `502 FIREWALL_UNAVAILABLE` for authentication/TLS/rate-limit/transport, `504 FIREWALL_TIMEOUT`. Manager `403 ADMINISTRATOR_REQUIRED` stays distinct so a missing firewall privilege is never mistaken for a manager permission problem.
- Cache: one `ObservationCache` per namespace and area, 60 s success / 10 s failure, 64 devices, single-flight, invalidated when the device profile changes.
- These reads do not write `poll_runs`, do not feed capability evidence, metrics, alerting, or retention, and persist nothing.

Runtime status: implemented and unit-tested in the manager. The operator has granted the 21 GET privileges to `pfsense_hub`, so a live call should now be answered rather than refused. **Live response verification is still pending**: the exact privilege names as enforced by the installed package, the response schemas, and CE behaviour have not been recorded. Until they are, a page that fails names the privilege or route to check and never claims the data is verified. `INTEGRATION-STATUS.md` carries the per-area checklist. One immediate benefit is that the Compatibility page can now report the installed REST API package version, which previously had to be shown as unknown.

