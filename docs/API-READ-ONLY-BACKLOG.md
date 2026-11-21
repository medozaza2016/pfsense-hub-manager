# Read-Only API Expansion Backlog

**Status:** Discovery and prioritization only. No new firewall permissions or manager routes are approved by this document.  
**Source:** The committed firewall-generated OpenAPI snapshot at `docs/reference/pfsense-openapi.json`, summarized by `docs/API-MATRIX.generated.md`.  
**Snapshot:** OpenAPI 3.0, 267 paths, 694 operations, 186 component schemas. The generated inventory contains 243 GET operations. The snapshot metadata version is `unknown`, it is not the installed package version.

## 1. Current integration baseline

The current first-device baseline is nine approved GET operations:

- Eight core operational reads: system, gateways, interfaces, services, firmware version, ARP table, firewall states, and firewall state-table size.
- One separate metadata probe: `GET /api/v2/system/restapi/version`, which reads `data.current_version`. The first Plus device compatibility page reported package version `v2.11.0` and 9 of 9 checks Verified on 2026-11-21.

The ninth operation is not a ninth monitoring domain. It is package metadata discovery. The adjacent PATCH endpoint remains excluded.

## 2. Discovery rules

An OpenAPI GET operation is only a candidate. Before implementation it must pass all of these gates:

1. Confirm exact path, HTTP method, operation ID, query/path parameters, request and response schemas, and pagination behavior from the pinned OpenAPI source.
2. Identify the exact firewall privilege string and any required package.
3. Review returned data for credentials, secrets, private keys, topology, client identifiers, or other sensitive content. Minimize fields and retention.
4. Verify installed REST API package, pfSense edition, release, and architecture on the target device.
5. Test the exact operation against the target firewall using verified TLS and least privilege. Record HTTP status and schema validation separately.
6. Add a fixed manager-owned provider operation, per-device capability evidence, caller authorization, response validation, bounded resource use, redaction, and tests.
7. Only then expose the result in the UI.

No generic API proxy is permitted. No permission is added during discovery. POST, PUT, PATCH, and DELETE remain outside the current read-only scope. Do not use GET operations that execute commands or cause operational side effects.

## 3. Prioritized candidate domains

The following routes and privileges are transcribed from the generated operation inventory. They are not yet live-verified, approved, or enabled.

| Priority | Domain | Candidate GET route(s) | OpenAPI privilege | Value and review notes |
|---|---|---|---|---|
| P1 | Firewall policy inventory | `GET /api/v2/firewall/rules` | `api-v2-firewall-rules-get` | High operational value. Read-only visibility into policy. Review rule schema, ordering, interface references, schedules, aliases, and sensitive network details. Recommended first feature candidate. |
| P1 | Firewall aliases | `GET /api/v2/firewall/aliases` | `api-v2-firewall-aliases-get` | Complements rules by resolving referenced networks, hosts, and ports. Alias contents may reveal internal topology, apply data minimization and access controls. |
| P1 | NAT inventory | `GET /api/v2/firewall/nat/port_forwards` | `api-v2-firewall-nat-port-forwards-get` | Important for understanding published services and inbound exposure. Treat internal destinations and port mappings as sensitive. |
| P1 | DHCP lease status | `GET /api/v2/status/dhcp_server/leases` | `api-v2-status-dhcp-server-leases-get` | Useful operational visibility, but leases can expose client names, MAC addresses, and IP assignments. Requires privacy review, restricted access, and no unnecessary persistence. |
| P1 | CARP status | `GET /api/v2/status/carp` | `api-v2-status-carp-get` | High value for HA deployments. Low expected data volume, but only useful on applicable devices. |
| P2 | Interface configuration inventory | `GET /api/v2/interfaces` | `api-v2-interfaces-get` | Complements current interface status with configured interface inventory. Review identifiers, VLANs, addressing, and schema differences. |
| P2 | Routing inventory | `GET /api/v2/routing/gateways`, `GET /api/v2/routing/static_routes` | `api-v2-routing-gateways-get`, `api-v2-routing-static-routes-get` | Supports topology and route visibility. Static routes can expose internal network layout. |
| P2 | VPN operational status | `GET /api/v2/status/openvpn/servers`, `GET /api/v2/status/openvpn/clients`, `GET /api/v2/status/wireguard/tunnels`, `GET /api/v2/status/wireguard/peers`, `GET /api/v2/status/ipsec/sas` | Corresponding `api-v2-status-*` GET privileges | High value for remote access and site-to-site monitoring. WireGuard endpoints declare `pfSense-pkg-WireGuard` as a required package in the snapshot. Verify installed package and avoid exposing peer secrets or sensitive endpoint details. |
| P3 | DHCP configuration inventory | `GET /api/v2/services/dhcp_servers`, `GET /api/v2/services/dhcp_server/static_mappings` | Corresponding `api-v2-services-dhcp-*` GET privileges | Useful configuration visibility. Static mappings expose device identity and addressing. Keep separate from lease-status collection. |
| P3 | DNS configuration inventory | `GET /api/v2/services/dns_resolver/settings`, `GET /api/v2/services/dns_resolver/host_overrides`, `GET /api/v2/services/dns_forwarder/host_overrides` | Corresponding `api-v2-services-dns-*` GET privileges | Useful for troubleshooting and centralized inventory. Host overrides may expose internal naming and topology. |
| P3 | Certificate inventory | `GET /api/v2/system/certificates`, `GET /api/v2/system/certificate_authorities` | `api-v2-system-certificates-get`, `api-v2-system-certificate-authorities-get` | Potentially useful for expiry monitoring. Must prove that responses exclude private-key material before exposing or retaining data. |
| Excluded pending separate review | REST API access control, users, auth keys, logs, command/table diagnostics | Examples include `GET /api/v2/auth/keys`, `GET /api/v2/system/restapi/access_list`, `GET /api/v2/users`, and `GET /api/v2/status/logs/*` | Individual privileges listed in generated inventory | Highly sensitive administrative/security data. Command execution is prohibited regardless of HTTP method. Logs and table dumps may expose secrets or large amounts of network data. Do not treat GET as inherently safe. |

## 4. Recommended implementation order

1. **Firewall rules read-only inventory**: first candidate because it is central to firewall management and can be implemented as a bounded, normalized read model. Begin with exact schema review and privilege confirmation, not code or permission changes.
2. **Aliases**: add after rules so referenced aliases can be resolved and presented consistently.
3. **NAT port forwards**: add with explicit treatment of internal destinations and exposure summaries.
4. **Interface and routing configuration inventory**: build the underlying topology view.
5. **Operational status domains**: DHCP leases, CARP, VPN status, each with its own data sensitivity and package checks.
6. **DHCP/DNS/certificate configuration inventory**: implement domain by domain after response schema and sensitive-field review.

This order is a product recommendation, not a compatibility claim. No candidate is assumed supported on CE based on Plus evidence.

## 5. First feature gate: firewall rules

Before implementing `GET /api/v2/firewall/rules`:

- [ ] Inspect the exact OpenAPI operation and all referenced component schemas, including nested references.
- [ ] Record required package(s), privilege string, query parameters, pagination, sorting, and response size characteristics.
- [ ] Confirm whether rule descriptions, schedules, source/destination aliases, interface names, and tracker IDs are returned.
- [ ] Review whether the existing `pfsense_hub` account can be granted only this exact GET privilege without broad `page-all` access.
- [ ] Obtain explicit approval before changing the firewall account's privileges.
- [ ] Test the endpoint on the first Plus firewall with verified TLS, then validate and sanitize the response.
- [ ] Add per-device evidence and contract tests before exposing the data.
- [ ] Keep rule writes, apply operations, and all configuration mutation methods disabled.

## 6. Evidence and limitations

- This backlog was produced from the repository's generated operation matrix. It does not establish live support, response correctness, or CE compatibility.
- The OpenAPI snapshot reports `info.version: unknown`. Its 694 operations and 243 GET count describe the supplied snapshot, not necessarily the currently installed package.
- The installed package version displayed by the first Plus device is `v2.11.0`; compatibility must still be checked against that release and ARM architecture.
- The second CE firewall remains unconnected and unverified.
- The current baseline is eight core operational GET operations plus one package-version metadata GET.
