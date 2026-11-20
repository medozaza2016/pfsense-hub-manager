# Product Requirements Document

## 1. Product summary

**Name:** pfSense Hub Manager

**Status:** Draft, initial requirements captured from project discussions.

**Product type:** Centralized management and monitoring application for multiple pfSense firewall installations.

The product provides one management interface for a mixed pfSense environment, initially involving pfSense Plus at one location and pfSense CE at another. It is an independent management layer, not a replacement firewall and not a Netgate Nexus client.

## 2. Problem statement

Operating separate pfSense installations creates fragmented visibility and requires administrators to connect to each firewall independently. The project aims to provide a consolidated view and a consistent management experience across locations and editions.

A key challenge is that pfSense Plus and CE, and their REST API package versions, may not expose identical capabilities. The application must make those differences explicit.

## 3. Goals

1. Provide a central dashboard for multiple pfSense devices and locations.
2. Support mixed pfSense Plus and pfSense CE deployments.
3. Establish secure, reliable communication with each firewall.
4. Present device reachability, health, and supported operational information in one interface.
5. Isolate edition- and version-specific behavior behind a compatibility-aware integration layer.
6. Start with read-only access and establish a secure foundation before enabling changes.
7. Remain independent of Netgate Nexus.

## 4. Non-goals for the initial milestone

- Replacing pfSense firewall functionality.
- Requiring or integrating with Netgate Nexus.
- Assuming every REST API operation is supported on every edition or release.
- Exposing firewall management interfaces publicly by default.
- Making firewall configuration changes before authorization, audit, and rollback requirements are designed.
- Remote shell access or arbitrary command execution.
- Automatic firmware upgrades.

These items may be reconsidered through explicit requirements and security review.

## 5. Users and primary use case

**Primary user:** An administrator responsible for more than one pfSense firewall.

**Initial scenario:** The administrator opens one dashboard and can identify both locations, see whether each firewall is reachable, and review the operational information that its installed REST API version supports.

Additional user roles and multi-user collaboration requirements have not yet been specified.

## 6. Initial functional requirements

### FR-1: Managed devices

The system shall represent multiple firewall instances, each with a human-readable name, location, pfSense edition, installed release, API package version, and connection state where those values can be safely and reliably obtained.

### FR-2: Device connectivity

The system shall test connectivity to each configured firewall independently and display success, failure, timeout, or unsupported status without blocking other devices.

### FR-3: Compatibility awareness

The system shall account for pfSense edition, release, API package version, and platform architecture. It shall not assume that a feature or endpoint exists merely because it works on another device.

### FR-4: Read-only monitoring

The initial milestone shall retrieve only explicitly approved read-only information. The initial verified Plus endpoint set is recorded in docs/API-SPECIFICATION.md. The final dashboard metrics and polling frequency remain open.

### FR-5: Unified dashboard

The system shall provide a consolidated view of registered devices and make each device's status and last successful communication time clear.

### FR-6: Error handling

The system shall communicate authentication failures, network failures, timeouts, API errors, TLS failures, and unsupported capabilities distinctly. It shall tolerate partial outages.

### FR-7: Auditability

The initial release shall log security-relevant access and operational errors without recording secrets. If write operations are introduced later, a complete action audit trail is mandatory.

## 7. Initial non-functional requirements

- **Security:** Least privilege, secret protection, TLS verification, and private connectivity preferred.
- **Reliability:** A single unreachable firewall must not make the overall service unavailable.
- **Compatibility:** Support must be explicit and tested by edition and release.
- **Maintainability:** Firewall API calls must be isolated behind a provider/adapter layer.
- **Observability:** Provide useful diagnostics while redacting credentials and sensitive payloads.
- **Extensibility:** Support adding further devices and locations without redesigning around a fixed count of two.

Quantitative availability, performance, and retention targets remain open.

## 8. Technology direction discussed

React + TypeScript, Next.js, Cloudflare Workers, and a self-hosted Node.js/TypeScript backend on Proxmox have been discussed at different points. No final framework or hosting architecture has been approved. The database, authentication/identity provider, secrets-management approach, deployment topology, and network path to the firewalls also remain open. See docs/ARCHITECTURE.md and docs/DECISIONS.md.

## 9. Integration constraints and risks

The pfSense REST API discussed for this project is community-maintained and unofficial. Its compatibility depends on the exact pfSense release and package release. Not all operations are necessarily available across Plus and CE.

The first tested Plus firewall is a Netgate 2100 with an ARM Cortex-A53 processor and two CPU cores. Its reported pfSense release was 26.07.2-RELEASE. The exact REST API package version has not yet been recorded. ARM package availability and runtime behavior must be verified rather than assumed.

The first integration used a dedicated regular user named pfsense_hub with an API key and eight GET privileges. All eight selected endpoints returned HTTP 200 from the manager LXC. The direct-IP certificate was self-signed and TLS verification was bypassed for diagnostics only. Production use requires verified TLS.

The application must not expose firewall API endpoints to the public internet by default. A VPN or other private management path is preferred. The current manager-to-Plus test uses 172.10.50.1:10443. The second CE firewall is not yet connected, by design.

## 10. Initial acceptance criteria

The first milestone is acceptable when:
1. The repository contains approved architecture and security decisions.
2. A firewall can be registered without storing credentials in frontend code or source control.
3. The backend can establish a verified, secure connection to a test firewall over the approved network path.
4. The application can report connection state and distinguish common failure categories.
5. The application can retrieve a small, explicitly selected set of read-only information from a supported device.
6. Unsupported edition/version capabilities are reported clearly.
7. Tests cover success, timeout, authentication failure, and unsupported capability cases.
8. No firewall configuration-changing operation is enabled by default.

## 11. Open questions

1. What exact read-only information should the first dashboard show?
2. Where will the management service run, and how will it reach each site?
3. Will the backend require a private connector/agent?
4. Which frontend framework will be used, including whether Next.js is the selected framework?
5. Which backend runtime and deployment topology will be used?
6. Which authentication method will administrators use to sign in?
7. Where will firewall API credentials be stored, rotated, and revoked?
8. Is a database required for device inventory, status history, users, and audit records? If so, which one?
9. What are the exact CE release, Plus release, API package versions, and architectures at both locations?
10. Which API endpoints and capabilities are verified on each installation?
11. Is the product single-administrator initially, or must it support multiple users and roles?
12. What deployment, backup, retention, and recovery requirements apply?

## 12. Milestone outline

- **M0, Discovery:** Confirm firewall versions, API compatibility, connectivity, security model, and first dashboard data. The first Plus device's initial API connectivity and eight read-only endpoints are now verified.
- **M1, Foundation:** Approve architecture, scaffold repository, establish linting/testing, and implement secure configuration handling.
- **M2, Read-only integration:** Register devices, connect securely with verified TLS, check health, and retrieve approved read-only data.
- **M3, Unified dashboard:** Present device inventory, status, and per-device details.
- **M4, Hardening:** Complete security review, compatibility tests, audit coverage, and operational documentation.
- **Later milestones:** Consider selected write operations only after explicit requirements, authorization, audit, and recovery controls are approved.

## 13. Change control

This PRD is an initial draft based on the decisions captured in project discussions. New requirements and changes should be recorded explicitly. Do not silently convert an open question or technical assumption into an approved requirement.

## 14. Verified implementation preparation record

As of 2026-11-19 (America/New_York), the manager LXC named pfsense-hub-manager successfully authenticated to the first Netgate 2100 using the X-API-Key header for the dedicated pfsense_hub user. All eight GET endpoints in docs/API-SPECIFICATION.md returned HTTP 200. The API reported pfSense Plus 26.07.2-RELEASE.

The API key and firewall serial/Netgate identifiers are intentionally not included in this repository. The diagnostic TLS bypass and public-hostname timeout are documented in docs/INTEGRATION-STATUS.md. The 172.10.x.x addressing is being retained for now at the user's direction. The second pfSense CE firewall connection is deferred until the user is ready.

The application has not yet been scaffolded. See docs/ROADMAP.md for the remaining work and docs/DECISIONS.md for confirmed decisions versus open architecture choices.
