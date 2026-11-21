# Read-Only API Expansion Backlog

**Status:** Firewall rules read-only access is live-verified on the first Plus firewall and the manager backend endpoint is implemented. No firewall configuration writes are in scope.  
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

1. **Firewall rules read-only inventory**: implemented as a bounded, normalized administrator-only read model. Remaining acceptance work is local Windows test/typecheck/build validation and trusted-TLS verification against the private Tailscale address.
2. **Aliases**: add after rules so referenced aliases can be resolved and presented consistently.
3. **NAT port forwards**: add with explicit treatment of internal destinations and exposure summaries.
4. **Interface and routing configuration inventory**: build the underlying topology view.
5. **Operational status domains**: DHCP leases, CARP, VPN status, each with its own data sensitivity and package checks.
6. **DHCP/DNS/certificate configuration inventory**: implement domain by domain after response schema and sensitive-field review.

This order is a product recommendation, not a compatibility claim. No candidate is assumed supported on CE based on Plus evidence.

## 5. First feature gate: firewall rules

### Confirmed from the operator's installed firewall documentation (2026-11-21)

The live firewall documentation at `https://pfsense.luxoritpro.com/api/v2/documentation#/FIREWALL/getFirewallRulesEndpoint` confirms:

- Method/path: `GET /api/v2/firewall/rules`
- Description: reads all existing Firewall Rules.
- Endpoint type: Plural.
- Associated model: `FirewallRule`; no parent model.
- Authentication required; supported modes are BasicAuth, JWTAuth, and KeyAuth.
- Allowed privileges: `page-all` and `api-v2-firewall-rules-get`. Use only the endpoint-specific `api-v2-firewall-rules-get` privilege. Do not grant `page-all`.
- Required packages: None.
- Applies immediately: No.
- Cache: None.

The operator supplied the complete Parameters and 200 Response schema from the installed v2.11.0 documentation. The only required permission granted was the endpoint-specific `api-v2-firewall-rules-get`, not `page-all`.

### Live verification (2026-11-21)

The operator tested the endpoint over Tailscale at `https://172.10.50.1:10443`:

- TCP connectivity to port 10443 succeeded from the Windows workstation over the Tailscale interface.
- A request without the API key returned HTTP 401, confirming the endpoint was reached.
- A request with the API key returned HTTP 200, `status: "ok"`, and a rule in the `data` array.
- The returned example contains nullable fields, so consumers must not treat every documented field as required.
- The successful curl test used `-k`, so it bypassed certificate validation. It verifies API key and privilege behavior, **not trusted TLS**. The manager must continue to enforce TLS verification using the firewall CA certificate and/or a matching TLS server name.

The first manager implementation is a separate administrator-only route, `GET /api/v1/devices/:deviceId/firewall/rules`. It uses fixed GET routing, page size 100, a 1,000-rule cap, field allowlisting, and no raw-rule persistence. It is not part of routine dashboard polling and does not expand the nine-operation compatibility baseline.

### Additional public REST API documentation context

- `GET /api/v2/firewall/rules` is the plural/many endpoint for reading the firewall rule collection. Its documented endpoint class is `FirewallRulesEndpoint`. The plural response's `data` field is an array of objects.
- Plural GET endpoints support querying/filtering and pagination. The REST API exposes pagination through limit/offset and HATEOAS previous/next links; the manager should use bounded page sizes and follow links or offsets deliberately, not fetch an unbounded collection.
- The generated project OpenAPI matrix lists the endpoint-specific privilege `api-v2-firewall-rules-get` and also `page-all`. The manager should request only the endpoint-specific privilege. Do not grant `page-all`, because it grants access to all API endpoints.
- The upstream documentation distinguishes GET's read behavior from POST/PATCH/PUT/DELETE operations on the same endpoint family. Only GET is in scope here.

References:
- [FirewallRulesEndpoint class documentation](https://pfrest.org/php-docs/classes/RESTAPI-Endpoints-FirewallRulesEndpoint.html)
- [Swagger and OpenAPI guide](https://pfrest.org/SWAGGER_AND_OPENAPI/)
- [Endpoint types, plural collections and pagination](https://pfrest.org/ENDPOINT_TYPES/)

These public docs explain the endpoint model and generic plural endpoint behavior. The project's pinned OpenAPI JSON and the live firewall's own Swagger page remain authoritative for the installed package version and exact component fields. The current online documentation is not a substitute for checking the Plus device's installed v2.11.0 package.

Before marking `GET /api/v2/firewall/rules` complete:

- [x] Inspect the installed v2.11.0 endpoint parameters and 200 response schema.
- [x] Record the endpoint-specific privilege and confirm no package dependency.
- [x] Confirm nullable fields and the presence of rule descriptions, source/destination, interface, and tracker metadata.
- [x] Grant only `api-v2-firewall-rules-get`; do not grant `page-all`.
- [x] Test the endpoint on the first Plus firewall and verify HTTP 200 with the API key.
- [x] Add a fixed GET operation, bounded pagination, response field allowlisting, and administrator-only API route.
- [ ] Validate the implementation on Windows with API tests, typecheck, and build.
- [ ] Establish trusted TLS for the private Tailscale endpoint without bypassing certificate verification.
- [ ] Add the administrator-only frontend inventory and complete manual acceptance.
- [x] Keep rule writes, apply operations, and all configuration mutation methods disabled.

## 6. Evidence and limitations

- This backlog was produced from the repository's generated operation matrix. It does not establish live support, response correctness, or CE compatibility.
- The OpenAPI snapshot reports `info.version: unknown`. Its 694 operations and 243 GET count describe the supplied snapshot, not necessarily the currently installed package.
- The installed package version displayed by the first Plus device is `v2.11.0`; compatibility must still be checked against that release and ARM architecture.
- The second CE firewall remains unconnected and unverified.
- The current baseline is eight core operational GET operations plus one package-version metadata GET.
