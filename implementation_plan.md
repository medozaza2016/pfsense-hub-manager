# Implementation Plan — Site Telemetry Increment

**Status:** Approved for implementation (Act mode), November 23, 2026
**Baseline:** `main` at `14e3c2f`
**Security boundary:** unchanged. Read-only, the same eight verified GET operations, no new pfSense privileges, no new upstream routes.

## Overview

Wire the site workspace to the existing verified read-only endpoints instead of preview fixtures:

- Overview, Monitoring, Interfaces, Gateways, Services, and Compatibility all read from one `GET /api/v1/devices/:deviceId/snapshot` response.
- Persist real compatibility metadata (`release`, `platform`, API package version, compatibility verdict, checked-at) instead of returning `release: null`.
- Replace blanket `supported: true, verification: "tested"` with capability state derived from recorded poll outcomes.
- Keep every unknown honest: no invented CPU/memory history, no synthesized uptime, no claimed API package version or CPU architecture that none of the eight endpoints exposes.

The client module cache makes navigating Overview → Monitoring → Interfaces → Gateways → Services → Compatibility inside the cache window a single snapshot request, which performs one eight-endpoint collection.

## Types

`apps/api/src/pfsense/observations.ts` (new)

- `SystemObservation`: `platform`, `uptimeText`, `uptimeSeconds`, `cpuCount`, `cpuUsagePercent`, `memoryUsagePercent`, `diskUsagePercent`, `swapUsagePercent`, `loadAverage`.
- `GatewayObservation`: `name`, `delayMs`, `stddevMs`, `lossPercent`, `status`, `substatus`.
- `InterfaceObservation`: `name`, `description`, `enabled`, `status`, `ipv4`, `subnet`, `ipv6`, `mtu`, `media`.
- `ServiceObservation`: `name`, `description`, `enabled`, `running`.
- `VersionObservation`: `release`, `base`, `patch`, `buildTime`.
- `StateSummaryObservation`: `arpEntries`, `firewallStates`, `stateTableLimit`, `stateTableCurrent` (counts only).
- `SiteSnapshot`: device id, `collectedAt`, `outcome`, `failedOperations`, `failures[]`, `system`, `version`, `gateways[]`, `interfaces[]`, `services[]`, `stateSummary`, `compatibility`.
- `CompatibilityObservation`: `declaredEdition`, `reportedEdition`, `release`, `platform`, `apiPackageVersion` (always `null` today), `verdict`, `checkedAt`.
- `CapabilityObservation`: `key`, `label`, `endpoint`, `operationGroup`, `supported: boolean | null`, `verification`, `lastCheckedAt`, `errorClass`.

`apps/api/src/pfsense/provider.ts`

- `CollectionResult`: `snapshot`, `failures`, `failedOperations`, `durationMs`.
- `capabilities(deviceId: string): Promise<CapabilityObservation[]>` — signature change.

`apps/web/src/lib/site-snapshot.ts` (new): mirrored `SiteSnapshot` view types plus `useSiteSnapshot` return type.


## Files

New:

- `apps/api/migrations/016_device_compatibility.sql`
- `apps/api/src/pfsense/observations.ts`, `observations.test.ts`
- `apps/api/src/pfsense/observation-cache.ts`, `observation-cache.test.ts`
- `apps/api/src/pfsense/observation-routes.ts`, `observation-routes.test.ts`
- `apps/web/src/lib/api.ts`, `apps/web/src/lib/site-snapshot.ts`

Modified:

- `apps/api/src/pfsense/provider.ts`, `provider.test.ts`
- `apps/api/src/devices/device-repository.ts`, `device-repository.test.ts`
- `apps/api/src/devices/admin-routes.ts` (optional `onDeviceChanged` callback; no new route)
- `apps/api/src/server.ts`, `apps/api/src/config.ts`, `apps/api/src/metrics.ts`
- `apps/web/src/App.tsx`, `apps/web/src/style.css`
- `.env.example`
- Docs: `DECISIONS.md` (DEC-042), `API-SPECIFICATION.md`, `API-COMPATIBILITY.md`, `FRONTEND-IMPLEMENTATION.md`, `ROADMAP.md`, `METRICS.md`, `VERIFICATION-AND-CLOSEOUT.md`

## Functions

- `parseSystemObservation`, `parseGatewayObservations`, `parseInterfaceObservations`, `parseServiceObservations`, `parseVersionObservation`, `parseStateSummary`, `parseUptimeSeconds` — zod parsing plus explicit field-by-field mapping. Never spread an upstream object.
- `evaluateCompatibility(declaredEdition, system, version)` — returns verdict `unknown | verified | mismatch`; `mismatch` only when the declared edition contradicts the release/platform string.
- `deriveCapabilities(latestRuns)` — `supported: true` on success; `false` only for `unsupported`, `authorization`, or `authentication` failures; `null` for transport/schema failures so a transient outage is never reported as an absent capability.
- `DeviceRepository.listCompatibility()`, `getCompatibility(deviceId)`, `recordCompatibility(deviceId, input)`.
- `PfSenseProvider.collect(deviceId, onResult)` returns a sanitized snapshot; `PfSenseProvider.capabilities(deviceId)`.
- `ObservationCache.get(key, load, isFailure)`, `invalidate(key)`, `clear()`.
- `registerObservationRoutes(app, deps)`; `pollObserver(deviceId)` metric helper.

## Classes

- `ObservationCache<T>`: success TTL (default 10 s), failure TTL (default 2 s), single-flight per key, 64-entry bound with oldest-entry eviction, explicit `invalidate`, no persistence, no timers.

## Dependencies

None added. Reuses `zod`, `pg`, `fastify`, `undici`, `prom-client`, React, and `react-router` already in the workspaces. No state library, no chart library, no database service.

## Testing

- `observations.test.ts`: sensitive fields (`serial`, `netgate_id`, `macaddr`, `hwif`, `monitorip`, `srcip`, packet counters) never appear; uptime parsing and unparseable uptime; out-of-range numbers; wrong top-level shapes; edition inference and mismatch detection.
- `observation-cache.test.ts`: success TTL, failure TTL, single-flight, bound eviction, invalidation, loader rejection.
- `provider.test.ts`: snapshot shape, per-operation poll rows, sanitized output, `recordCompatibility` on success, capability derivation for success/unsupported/timeout, no capability claim before any poll.
- `observation-routes.test.ts`: 400 invalid id, 404 unknown/demo device, 409 disabled device, 200 snapshot, 200 capabilities, cache reuse across two requests, no upstream call for a denied request.
- `device-repository.test.ts`: new compatibility columns round-trip.
- Frontend: typecheck and production build; no frontend unit runner exists in this workspace, so interaction is verified by build/typecheck plus a live check when an API and firewall are available.


## Implementation Order

1. **Phase 0 documentation reconciliation** (separate commit, no behavior change): MONITORING.md, DEC-026 status, README/DEPLOYMENT/INTEGRATION-STATUS/SECURITY/MULTI-SITE-ONBOARDING-PLAN/AUTOMATIC-HUB-ACCESS-DEPLOYMENT branch statements.
2. Migration `016_device_compatibility.sql` + repository compatibility methods.
3. `observations.ts` + tests.
4. `observation-cache.ts` + tests.
5. Provider: sanitized snapshot collection, compatibility recording, capability derivation + tests.
6. `observation-routes.ts`, `server.ts` wiring, config, metrics helper, admin callback + tests.
7. Web: `lib/api.ts`, `lib/site-snapshot.ts`, six page components, styles.
8. `npm test`, `npm run typecheck`, `npm run build`; record exact results.
9. Docs: DEC-042, API-SPECIFICATION, API-COMPATIBILITY, FRONTEND-IMPLEMENTATION, METRICS, ROADMAP, closeout section 15.

## Known limitations and open questions

- The approved mockup image is not present in the repository (`docs/mockups/` contains only `README.md`) and `/Projects/pfSense Hub Manager/mockups/` does not exist on this machine, so this increment preserves the existing established design system rather than comparing against the image.
- `apiPackageVersion` cannot be read from the eight approved endpoints. It stays `null` until a separately approved endpoint or an operator-entered value is specified.
- CPU architecture is not exposed; compatibility therefore records release and platform only.
- `SystemStatus` has no CPU/memory history. Monitoring shows current values only and says so; the placeholder trend chart is removed rather than fed with fake data.
- Alert severity thresholds for CPU/memory/disk are not approved, so `systemStatus` remains `unknown` and no alert is generated from utilization.
- Gateway/interface/service field names come from `docs/reference/pfsense-openapi.json` (schemas `SystemStatus`, `SystemVersion`, `RoutingGatewayStatus`, `InterfaceStats`, `Service`), not from a captured live response in this repository. Unknown shapes fail closed as `invalid_response`.
- `poll_runs.operation_group` gains per-operation labels (`diagnostics` becomes `arpTable`) so per-operation capability state is unambiguous. Historical rows keep their old labels; capability derivation falls back to the legacy shared label.
