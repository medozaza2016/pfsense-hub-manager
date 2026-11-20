# Agent Instructions

These instructions apply to the entire repository.

## Mission

Build **pfSense Hub Manager**, a secure, centralized management and monitoring application for multiple pfSense firewalls, including mixed deployments of pfSense Plus and pfSense CE.

The product is a management layer. It must not replace pfSense, bypass its security model, or depend on Netgate Nexus.

## Source of truth

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
