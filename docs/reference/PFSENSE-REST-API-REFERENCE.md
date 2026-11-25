# pfSense REST API Reference

## Source and compatibility

This reference is based on the firewall-generated OpenAPI export supplied for this project and the accompanying REST API permission inventory.

- OpenAPI version: 3.0.0
- OpenAPI `info.version`: `unknown`
- Recorded firewall profile: Netgate 2100, pfSense Plus 26.07.2-RELEASE, ARM Cortex-A53
- Exact installed REST API package version: not yet recorded
- Exported paths: 267
- Schema components: 186
- API areas: AUTH, DIAGNOSTICS, FIREWALL, GRAPHQL, INTERFACE, ROUTING, SERVICES, STATUS, SYSTEM, USER, VPN

The complete firewall-generated OpenAPI JSON is included in this repository at [`docs/reference/pfsense-openapi.json`](./pfsense-openapi.json). Treat that file as the machine-readable source reference and preserve the export unchanged. This document is the human-readable navigation and safety guide, not a replacement for the OpenAPI definitions.

## Important distinction

An operation being documented or appearing in the firewall permission inventory does not mean it has been tested, implemented, safe, or enabled. Track these independently:

1. **Documented**, present in the supplied OpenAPI export.
2. **Tested**, exercised against a named firewall, firmware release, and API package version.
3. **Implemented**, supported by a specific manager adapter capability.
4. **Enabled**, explicitly allowed by manager policy and firewall permissions.

The current manager milestone is read-only. The dedicated `pfsense_hub` firewall API account holds the eight status GET privileges plus the 20 page-scoped GET privileges listed under "Approved page-scoped reads" below; it holds no write, apply, reboot, halt, or command privilege. Nothing is enabled automatically because a privilege exists: the manager backend's fixed route/method allowlist, its capability metadata, and the caller's role must all allow an operation. The backend enforces its own endpoint and capability allowlist. The frontend is not a security boundary. Do not implement a generic proxy that accepts arbitrary upstream paths, HTTP methods, or payloads.

## Adding a future endpoint

Use this sequence for every new integration operation:

1. Select the feature and exact endpoint/method from the OpenAPI export.
2. Verify the route and schema against the actual target firewall, recording pfSense edition/release, architecture, and installed REST API package version. A documented route is not proof of runtime support.
3. Review the operation's security impact and obtain feature approval. For the current read-only milestone, only GET operations may be considered.
4. Add only the required firewall-side permission to the dedicated `pfsense_hub` account. Do not grant broad permissions or write privileges for convenience.
5. Update manager-side authentication/authorization and the backend allowlist, including device capability declarations and user/role checks. Firewall permission and manager permission are separate gates, both must allow the operation.
6. Add sanitized contract fixtures and tests for success, malformed responses, denied permissions, timeouts, and per-device compatibility.
7. Update this reference and the integration status with the test evidence. Keep unsupported devices or versions explicitly marked unsupported.
8. Record "privilege granted" and "runtime verified" separately. A grant on the firewall proves only that the ACL entry exists; until the route and schema have answered on that profile, the area stays marked unverified and the UI keeps naming what to check.

Never automatically expand the firewall account's permissions or the manager's allowlist merely because the OpenAPI export changes.

## API area index

The export contains 267 paths and 186 schema components. The following groups are available for future feature planning:

| Area | Scope |
|---|---|
| AUTH | JWT and API key authentication and key management |
| DIAGNOSTICS | ARP, command execution, ping, tables, configuration history, reboot and halt |
| FIREWALL | Rules, aliases, NAT, schedules, state table, traffic shaping, virtual IPs, apply |
| GRAPHQL | GraphQL endpoint and response model |
| INTERFACE | Interface configuration, bridges, GRE, LAGG, VLANs, groups, apply |
| ROUTING | Gateways, gateway groups and priorities, static routes, apply |
| SERVICES | ACME, DNS, DHCP, FreeRADIUS, HAProxy, NTP, SSH, watchdog and related service settings |
| STATUS | System, gateway, interface, service, CARP, DHCP, IPsec, OpenVPN, WireGuard and logs |
| SYSTEM | Certificates, CA/CRL, DNS, hostname, HA sync, packages, REST API settings, tunables, updates, version, WebGUI |
| USER | Users, groups and authentication servers |
| VPN | IPsec, OpenVPN and WireGuard configuration and status |

For exact path, method, parameter, request-body, response, and schema details, consult the original OpenAPI export. Do not infer request or response shapes from a permission name alone.

## Current verified integration

These eight GET operations previously returned HTTP 200 on the recorded Plus firewall. That confirms successful reachability in that test, not complete schema validation or compatibility with other versions.

| Method | Endpoint | Current use |
|---|---|---|
| GET | `/api/v2/status/system` | System health and metrics |
| GET | `/api/v2/status/gateways` | Gateway status |
| GET | `/api/v2/status/interfaces` | Interface status and counters |
| GET | `/api/v2/status/services` | Service status |
| GET | `/api/v2/system/version` | Firmware version |
| GET | `/api/v2/diagnostics/arp_table` | Documented and reachable, not exposed in initial manager API |
| GET | `/api/v2/firewall/states` | Documented and reachable, individual entries excluded from initial manager API |
| GET | `/api/v2/firewall/states/size` | Aggregate state-table size |

The pfSense CE profile remains unverified. Do not claim Plus/CE compatibility until independently tested.

### Approved page-scoped reads (DEC-047, DEC-048)

These are read-only GETs on fixed allowlists. They are **not** part of the eight-operation polling set, are never called by the health snapshot, and do not count as capability evidence. Two manager namespaces serve them: `configuration/*` (administrator-only) and `telemetry/*` (any authenticated caller).

Configuration areas:

| Method | Endpoint | Privilege |
|---|---|---|
| GET | `/api/v2/firewall/aliases` | `api-v2-firewall-aliases-get` |
| GET | `/api/v2/interfaces` | `api-v2-interfaces-get` |
| GET | `/api/v2/firewall/rules` | `api-v2-firewall-rules-get` |
| GET | `/api/v2/firewall/nat/port_forwards` | `api-v2-firewall-nat-port-forwards-get` |
| GET | `/api/v2/firewall/nat/outbound/mappings` | `api-v2-firewall-nat-outbound-mappings-get` |
| GET | `/api/v2/firewall/nat/one_to_one/mappings` | `api-v2-firewall-nat-one-to-one-mappings-get` |
| GET | `/api/v2/routing/static_routes` | `api-v2-routing-static-routes-get` |
| GET | `/api/v2/services/dhcp_servers` | `api-v2-services-dhcp-servers-get` |
| GET | `/api/v2/services/dhcp_server/address_pools` | `api-v2-services-dhcp-server-address-pools-get` |
| GET | `/api/v2/services/dhcp_server/static_mappings` | `api-v2-services-dhcp-server-static-mappings-get` |
| GET | `/api/v2/services/dns_resolver/settings` | `api-v2-services-dns-resolver-settings-get` |
| GET | `/api/v2/services/dns_resolver/host_overrides` | `api-v2-services-dns-resolver-host-overrides-get` |
| GET | `/api/v2/services/dns_resolver/domain_overrides` | `api-v2-services-dns-resolver-domain-overrides-get` |
| GET | `/api/v2/system/certificates` | `api-v2-system-certificates-get` |
| GET | `/api/v2/system/certificate_authorities` | `api-v2-system-certificate-authorities-get` |

VPN status areas:

| Method | Endpoint | Privilege |
|---|---|---|
| GET | `/api/v2/status/ipsec/sas` | `api-v2-status-ipsec-sas-get` |
| GET | `/api/v2/status/openvpn/servers` | `api-v2-status-openvpn-servers-get` |
| GET | `/api/v2/status/openvpn/clients` | `api-v2-status-openvpn-clients-get` |
| GET | `/api/v2/status/wireguard/tunnels` | `api-v2-status-wireguard-tunnels-get` |
| GET | `/api/v2/status/wireguard/peers` | `api-v2-status-wireguard-peers-get` |

System version read (used by the Compatibility page):

| Method | Endpoint | Privilege |
|---|---|---|
| GET | `/api/v2/system/restapi/version` | `api-v2-system-restapi-version-get` |

All 21 privileges have been granted to `pfsense_hub` by the operator. **Granted is not verified.** Each entry appears in the pinned OpenAPI export (`docs/API-MATRIX.generated.md`), which is a candidate rather than proof: the route, method, response schema, and package compatibility must still be confirmed against the installed REST API package on each firewall profile, and the result recorded in [INTEGRATION-STATUS.md](../INTEGRATION-STATUS.md). A firewall that does not expose a route (for example WireGuard without `pfSense-pkg-WireGuard`) is reported as unverified rather than as an empty result. Write methods on these paths (`PUT`, `DELETE`, `PATCH`, `POST`) remain prohibited and are not granted.

## High-risk operations, excluded from initial scope

- `POST /api/v2/diagnostics/command_prompt`: arbitrary command execution.
- `POST /api/v2/diagnostics/reboot` and `POST /api/v2/diagnostics/halt_system`: disruptive device actions.
- Configuration-changing POST, PUT, PATCH and DELETE operations across firewall, interface, routing, services, system, users and VPN.
- Apply operations that activate pending configuration changes.

Future write support requires fine-grained authorization, explicit target confirmation, preview/diff, backup and recovery strategy, audit records, controlled apply, and post-change verification. Do not grant these permissions to the current read-only service account.

## Response conventions

Most REST responses use an envelope containing `code`, `status`, `response_id`, `message`, `data`, and `_links`. GraphQL uses a separate `data` and `errors` structure.

The export defines common error statuses including 400, 401, 403, 404, 405, 406, 409, 415, 422, 424, 500 and 503. The manager should translate upstream errors into stable manager-owned error codes and must not expose API keys, authorization headers, raw secrets, or stack traces.

## Schema and fixture policy

Use the OpenAPI component definitions for field names, types, nullability, enums, defaults, read/write flags, and constraints. Before finalizing runtime validation, capture sanitized responses from each supported firewall profile and compare them with the export.

Never commit API keys, JWTs, private key material, serial numbers, Netgate identifiers, public IPs, hostnames, or unredacted ARP/firewall-state records. Raw network state can reveal sensitive topology and device identity.

Record the exact pfSense release, architecture, REST API package version, endpoint, HTTP status, content type, and sanitized fixture provenance for every runtime test. The supplied export reports its own version as unknown, so it is not version-pinned yet.

## References

- [pfSense REST API project](https://github.com/pfrest/pfSense-pkg-RESTAPI)
- [REST API documentation](https://pfrest.org/)
- [Authentication and authorization](https://pfrest.org/AUTHENTICATION_AND_AUTHORIZATION/)
- [Queries, filters, and sorting](https://pfrest.org/QUERIES_FILTERS_AND_SORTING/)
- [Working with object IDs](https://pfrest.org/WORKING_WITH_OBJECT_IDS/)
