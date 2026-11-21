# Agent Instructions

These instructions apply to the entire repository.

## Mission

Build **pfSense Hub Manager**, a secure, centralized management and monitoring application for multiple pfSense firewalls, including mixed deployments of pfSense Plus and pfSense CE.

The product is a management layer. It must not replace pfSense, bypass its security model, or depend on Netgate Nexus.

## Source of truth

- Treat `docs/PROJECT-ROADMAP.md` as the canonical phased delivery plan and cross-session handoff. Read its current position and next action at the start of each session, and update it before ending a meaningful session.
- Treat `docs/PRD.md` as the product requirements source of truth.
- Treat `docs/DECISIONS.md` as the record of approved architectural decisions.
- Treat `docs/ROADMAP.md` as a concise implementation checklist only; it must not contradict the canonical project roadmap.

Before implementing a feature:
1. Read this file and the relevant documents in `docs/`.
2. Treat `docs/PRD.md` as the product requirements source of truth.
3. Treat `docs/DECISIONS.md` as the record of approved architectural decisions. If a decision is not recorded, do not present an assumption as settled.
4. If code and documentation disagree, identify the discrepancy and propose a correction rather than silently choosing one.

Keep documentation synchronized with meaningful changes.

## Product constraints

- Support both pfSense Plus and pfSense CE. Do not assume identical API capabilities across editions or releases.
- Integrate through the pfSense REST API where supported. This is a community-maintained, unofficial integration, not a Netgate-supported API.
- Treat API availability and compatibility as version-dependent. Check the installed firewall version, API package version, architecture, and documented compatibility before relying on an endpoint or installation artifact.
- The known deployment discussed so far includes two firewall locations: one pfSense Plus installation and one pfSense CE installation. Design for multiple managed devices rather than hard-coding exactly two.
- Do not make Netgate Nexus a runtime dependency.
- Begin with read-only operations. Any configuration-changing capability requires explicit product requirements, authorization controls, audit logging, and tests before implementation.
- Do not assume ARM64 support for third-party packages. The Plus firewall discussed during planning is ARM64, and upstream automated testing may not cover that architecture. Verify rather than infer compatibility.

## Security requirements

- Never commit firewall credentials, API keys, tokens, private keys, configuration backups, or real customer/network data.
- Never put secrets in browser-delivered code, frontend environment variables, logs, error messages, screenshots, or test fixtures.
- Do not expose a firewall management API directly to the public internet as a default architecture.
- Prefer private network connectivity or a VPN between the manager and firewalls. Document any alternative and its threat model before implementation.
- Use least privilege and read-only credentials for the initial integration.
- Validate TLS certificates. Do not disable certificate verification to work around connectivity problems.
- Redact secrets and sensitive network details from logs.
- Require explicit authorization for every state-changing operation. Record actor, target device, action, timestamp, outcome, and relevant request metadata in an audit trail.
- Apply authentication, authorization, input validation, rate limiting, and secure session/token handling at the server boundary.
- Treat data returned by managed firewalls as untrusted input.

## Mandatory integration safeguards

These rules apply to every agent, contributor, service, and future feature in this repository. They are global requirements, not optional guidance for a particular endpoint.

- **Deny by default.** The manager backend must expose only explicitly implemented and approved capabilities. Unknown routes, methods, devices, editions, API versions, and capabilities must be rejected, not passed through.
- **No arbitrary upstream proxy.** Never accept a caller-supplied firewall URL, path, HTTP method, shell command, or raw request body and forward it to a managed firewall. Resolve devices from trusted server-side records and map manager-owned operations to fixed upstream routes.
- **Read-only is the current security boundary.** Until a separately reviewed write-capability design is approved, permit only the exact required GET operations. Do not enable POST, PUT, PATCH, or DELETE merely because the upstream API documents them or a firewall permission exists.
- **Command execution is prohibited.** Do not expose or call the diagnostics command prompt endpoint, shell execution, or equivalent arbitrary-command functionality.
- **Disruptive actions are prohibited.** Do not expose reboot, halt, service restart, firewall apply, state-table flush, or other operationally disruptive actions in the initial read-only milestone.
- **Enforce authorization server-side.** Authenticate every caller and authorize every operation against the user's role, target device, and capability. Frontend visibility or disabled buttons are not authorization.
- **Protect device identity and credentials.** Keep API keys and tokens server-side, encrypted or held in an approved secret store when one is selected. Never return them to clients or write them to logs, traces, error responses, fixtures, screenshots, or repository files.
- **Validate TLS.** Verify firewall certificates and hostnames. Never disable certificate validation or silently fall back to insecure HTTP. A self-signed certificate requires an explicit trust configuration, not a verification bypass.
- **Constrain network destinations.** Firewall connection targets must come from trusted device configuration. Prevent caller-controlled destination changes and validate configured destinations to reduce SSRF and routing abuse.
- **Validate all upstream data.** Treat firewall responses as untrusted. Validate response envelopes, types, bounds, enums, and nullable fields at runtime. Reject or safely quarantine malformed data without crashing other device polling.
- **Bound resource use.** Apply connection and response timeouts, response-size limits, pagination limits, bounded retries with backoff, and per-device concurrency controls. Do not allow one unreachable or malformed firewall to stall the fleet.
- **Minimize retained network data.** Do not persist raw ARP entries, firewall state records, packet details, or other sensitive topology/traffic metadata unless a documented feature requires it and retention/access controls are approved.
- **Audit privileged activity.** Record security-relevant actions with actor, target device, capability, timestamp, outcome, and safe metadata. Never include secrets or full sensitive payloads in audit events.
- **Future write operations require a separate gate.** Before any state-changing feature is implemented, document its product requirement, exact endpoint and schema, least-privilege permissions, role checks, explicit target confirmation, preview/diff, backup and recovery plan, audit events, controlled apply, rollback limitations, post-change verification, and tests. Obtain explicit approval in project decisions before implementation.
- **Test security boundaries.** Add tests proving disallowed methods and paths are rejected, callers cannot change device destinations, unauthorized users cannot access devices/capabilities, TLS verification is enabled, secrets are redacted, and failures remain isolated per device.

## Endpoint onboarding and authentication maintenance

- The current `pfsense_hub` firewall account and manager integration are intentionally limited to the eight GET endpoints recorded in `docs/reference/PFSENSE-REST-API-REFERENCE.md`. Do not assume that the account can access other documented API operations.
- When a feature requires an additional endpoint, first verify the exact route, HTTP method, request/response schema, and compatibility against the target firewall's installed REST API package and release. A path in the OpenAPI export or permission inventory is a candidate, not proof of runtime support.
- Update the firewall-side service account permissions only for the exact endpoint/method required by the approved feature, using least privilege. Keep the account read-only while the product milestone is read-only. Never grant broad API, command-prompt, reboot, halt, apply, or configuration-write privileges as a shortcut.
- Update the manager-side authentication/authorization configuration and capability allowlist for each newly approved operation. This includes the backend's upstream method/route allowlist, device capability metadata, and caller role authorization. Firewall permissions alone do not enable a manager feature, and manager code must not assume that a firewall permission exists.
- Record the permission change, target firewall profile, package version, test result, and any rollback steps. Test both allowed access and denied access before marking the operation supported. Keep per-device capability differences explicit.
- Do not change the existing eight-endpoint scope or expand firewall privileges automatically when the OpenAPI export changes. Every additional endpoint requires explicit feature approval and verification.

## Frontend routing standard

- Use **React Router** for all frontend page and subpage navigation. Do not implement page navigation solely with component state, conditional rendering, or manually managed History API calls.
- Every navigable page must have a stable, meaningful URL path. Use lowercase, kebab-case path segments (for example, `/firewalls`, `/firewalls/add`, `/audit-logs`, and `/users`). Prefer nested paths when a page belongs to a parent resource.
- Define route paths in one central route configuration. Navigation links, redirects, breadcrumbs, and page titles must use that configuration rather than duplicating literal paths throughout components.
- Support direct navigation, browser back/forward, bookmarking, and page refresh on every valid route. Configure the web server's SPA fallback so non-API page paths serve the frontend entry point.
- Use route parameters for resource identity (for example, `/firewalls/:firewallId`) and query parameters for shareable filters, search terms, pagination, and tabs when appropriate.
- Apply authentication and role-aware route handling in the frontend for user experience, but always enforce authorization independently in the backend. A hidden navigation item is not an access control.
- Do not add a new page as a state-only view. Add its route, route-level access behavior, navigation entry where appropriate, and relevant route tests together.

## Engineering practices

- Prefer small, focused changes with clear names and types.
- Use TypeScript strictness where practical. Avoid `any`; if unavoidable, isolate it and explain why.
- Validate all external inputs at runtime, not only with TypeScript types.
- Keep firewall-specific API behavior behind a provider/adapter boundary. Do not spread edition- or version-specific conditionals throughout the UI.
- Make compatibility explicit. Unknown or unsupported capabilities should be reported as unsupported, not silently approximated.
- Handle timeouts, retries, partial failures, and unavailable devices. Do not let one firewall failure make the entire dashboard unusable.
- Do not log credentials or full sensitive API payloads.
- Add tests for normal behavior, error cases, authorization boundaries, and edition/version differences.
- Do not add dependencies without explaining the need and checking maintenance, licensing, and security posture.
- Do not introduce a database, authentication provider, hosting service, or state-management library until the architecture decision is documented.
- Do not invent API endpoints or request/response schemas. Verify them against the installed REST API documentation and supported package version.

## Workflow

1. Inspect the existing repository before changing it.
2. State the intended change and files affected.
3. Implement the smallest complete increment.
4. Run relevant formatting, linting, type checks, and tests when the project has them.
5. Report exactly what was changed and which checks were or were not run.
6. Update documentation when behavior, setup, security, or architecture changes.

## Definition of done

A change is not complete merely because code was written. It is complete when:
- The implementation matches documented requirements.
- Relevant tests and checks pass, or limitations are explicitly reported.
- Security implications have been considered.
- Documentation is updated.
- No secrets or real infrastructure credentials have been introduced.
