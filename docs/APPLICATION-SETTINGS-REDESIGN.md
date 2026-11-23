# Application Settings page redesign

**Status:** **Retired November 23, 2026** by [DEC-041](DECISIONS.md#dec-041-retire-the-hub-wide-application-settings-page). The page no longer exists in the product: its Administration navigation entry, its `/settings/application` route, the placeholder card component, and the page-specific styles have been removed. This document is retained as the design, implementation, and evaluation record. Do not re-implement from it.  
**Reference:** Application Settings mockup supplied during the November 22, 2026 design review. It is retained as design history and is no longer a binding visual specification, because the screen it pictures has been retired.

**Current state:** `/settings/application` redirects to `/settings/hub` with a history replacement, so an old bookmark opens Hub Settings instead of falling through to the Hub overview. No settings value is persisted or enforced, and no API route, database table, scheduler, or notification provider was added by this work.

## Objective (historical)

Redesign **Administration → Application Settings** to match the supplied mockup. This is a Hub-wide settings page, not a per-firewall Site Settings page and not a host or Docker administration console. This objective was withdrawn by DEC-041.

The immediate deliverable is the page structure, visual hierarchy, labels, descriptions, and responsive behavior. The controls may remain preview-only until their backend contracts and enforcement are implemented in a later phase.

## Approved page composition

The page header is:

- **Title:** Application Settings
- **Subtitle:** Application preferences and operational defaults

At desktop widths, show two cards side by side. At narrower widths, stack the cards in reading order. Preserve the existing pfSense Hub Manager design system: light workspace, dark navy sidebar, restrained blue actions, existing typography, spacing, borders, and responsive navigation.

### Card 1: General

Show two rows:

| Setting | Supporting value/text | Action |
|---|---|---|
| Application name | pfSense Hub Manager | Edit |
| Display timezone | Browser local timezone | Change |

The rows should be visually separated and aligned consistently. The action labels are **Edit** and **Change**, respectively.

### Card 2: Preferences

Show three preference rows, each with a short description and a right-aligned switch:

| Preference | Description |
|---|---|
| Automatic polling | Refresh site status on a schedule |
| Email notifications | Send notifications for important events |
| Require confirmation | Ask before consequential actions |

Keep the labels and descriptions as written above. The switches are part of the intended visual design, but their displayed positions in the reference image are illustrative. Do not treat those positions as approved operational defaults.

## Scope boundaries

- Keep this page limited to the **General** and **Preferences** cards shown in the reference.
- Do not add System Information, Maintenance, Backup & Restore, monitoring dashboards, host resource controls, or Docker controls to this redesign. Those require separate product scope and design decisions.
- These are Hub-wide settings. They must not be confused with per-site polling enablement or per-site connection configuration.
- The page must not imply that a setting is saved, persisted, enforced, or operational when it is only a local preview control.
- Do not create new API routes, database migrations, background jobs, email integrations, or security enforcement as part of the visual redesign.
- Preserve the existing application navigation and shared design components.

## Immediate frontend redesign acceptance criteria (historical)

These criteria describe the now-retired page. The single unchecked item is obsolete: there is no page left to accept visually, and the retirement itself is verified by typecheck, production build, and built-bundle inspection (see [Outcome](#outcome-november-23-2026)).

- [x] The Application Settings page implements the approved title, subtitle, two-card composition, row order, labels, descriptions, and actions.
- [x] Desktop uses a two-column card layout; tablet/mobile layouts stack through responsive CSS.
- [x] General and Preferences cards use the existing design system's spacing, alignment, borders, and typography.
- [x] Switches expose accessible names and state, use native keyboard-operable buttons, and have visible focus styling. General actions are native buttons.
- [x] Preview-only behavior is communicated. Switches update local React state only; General actions report that the workflows are not available. No save-success claim is shown.
- [x] The page remains distinct from Site Settings and Hub Settings.
- [ ] Complete browser visual and interaction acceptance at desktop, tablet, and mobile widths, including a narrow-width overflow check.

## Frontend implementation status (historical)

The two-card placeholder existed on main until November 23, 2026. DEC-041 then removed the page, its component, and its styles; no setting was ever persisted or enforced, and the remaining workflow list was never implemented for this page.

The remaining work is to implement the individual workflows and their contracts: application name editing, timezone selection and behavior, polling policy and scheduler, notification configuration and delivery, confirmation policy enforcement, authorization, persistence, audit behavior, and automated tests. These remain separate roadmap items. Browser visual acceptance is also still pending.

## Future functional work, not part of the redesign (not planned for this page)

The items below were the hypothetical requirements for a functional version of the retired page. They are not a backlog for it: DEC-041 assigns each capability elsewhere or leaves it unimplemented. They are kept only so the analysis is not lost.

### General settings
- Define and persist the Hub application display name.
- Define timezone behavior and persist an administrator-selected timezone if the product requires one. Distinguish an explicit Hub timezone from the browser's local timezone.
- Define which UI timestamps and scheduled jobs use the Hub timezone, UTC, or the viewer's browser timezone.

### Automatic polling
- Design a Hub-wide polling policy and its relationship to per-site polling enablement.
- Define polling interval, scheduling behavior, bounded concurrency, retry/backoff, failure handling, and behavior after restart.
- Implement and test the backend scheduler before presenting this preference as operational.
- Keep per-site enable/disable controls as a separate site-level setting.

### Email notifications
- Define supported event types, recipient management, delivery configuration, secrets handling, test delivery, retry behavior, and delivery/audit history.
- Implement a real notification provider and backend event path before enabling the preference as a functional control.
- Do not imply email delivery merely because the switch is enabled.

### Require confirmation
- Define the exact consequential actions that require confirmation.
- Enforce confirmation at the API/service boundary for protected operations, not only through a frontend dialog or switch.
- Ensure confirmation requirements are auditable and cannot be bypassed by calling the API directly.
- Keep this policy separate from any typed confirmation required for a specific destructive action.

### Persistence and authorization
- Define which roles may view or change each setting.
- Persist settings server-side with validation, audit events where appropriate, and safe defaults.
- Add API and database contracts only after the behavior and security requirements are approved.
- Test reload persistence, concurrent updates, authorization, failure handling, and restart behavior.

## Necessity and scope evaluation, November 23, 2026

**Status:** Resolved by [DEC-041](DECISIONS.md#dec-041-retire-the-hub-wide-application-settings-page) — **Option C, retire the page.** The evaluation below is preserved as the record of why. See [Outcome](#outcome-november-23-2026) for what was removed.

### What the documentation currently assigns to this page

DEC-035 and the section above define exactly five rows across two cards. Nothing else is approved for this page.

| Row | Approved presentation | What a functional version would require | Exists today? |
|---|---|---|---|
| Application name | `pfSense Hub Manager`, **Edit** | A validated, authorized, persisted value plus an audit event; every header, title, and export that renders the name would need to read it | No |
| Display timezone | `Browser local timezone`, **Change** | A defined Hub timezone, a rule for which timestamps use it versus UTC versus the viewer's browser zone, persistence, authorization, tests | No |
| Automatic polling | Switch, "Refresh site status on a schedule" | A real Hub-wide polling scheduler: interval, bounded concurrency, retry/backoff, restart behavior, and a decided relationship to per-site polling enablement | No |
| Email notifications | Switch, "Send notifications for important events" | Event catalogue, recipient management, provider configuration, secret handling, test delivery, retries, delivery history | No |
| Require confirmation | Switch, "Ask before consequential actions" | A defined list of consequential actions plus enforcement at the API/service boundary, auditable and not bypassable by calling the API directly | Partially: confirmation is already enforced per action |

### What the rest of the documentation says

- **No PRD requirement exists for this page.** The PRD contains no functional requirement for Hub-wide application preferences, an editable application name, or a display timezone. Its settings-related requirement points elsewhere: FR-13 (GUI-managed Hub access settings) targets **Hub Settings**, and PRD section 18 requires that configuration to be persisted in PostgreSQL and validated server-side.
- **Each preference overlaps a capability owned by another page or a deferred release.** Per-site polling enablement is part of the managed-site lifecycle (DEC-031) and the Connectivity/Site views. Notification delivery is explicitly a separate release requirement that "must not be represented as implemented" (PRD, manager administration section). Consequential-action confirmation is already required by FR-9 and enforced per action: a typed test phrase for site archival (DEC-031) and for stack Stop (DEC-039).
- **The prerequisites the documentation lists are all still open.** Background polling scheduling, bounded concurrency, and retry/backoff are recorded as not implemented, with polling partly request-triggered. There is no notification provider, no email secret handling, and no settings table, route, or authorization contract.
- **DEC-035 approves visual structure only.** It states that functional behavior "is deferred to the roadmap and must be implemented through approved API, persistence, authorization, scheduler, notification, and enforcement contracts."
- **The approved mockup is binding while the page exists.** The frontend rules require the pictured screens to be reproduced, so removing or reshaping the page is a product/design decision for the user, not an implementation detail.



### Assessment

Against the product documentation, the page as currently composed is **not necessary**. It carries no behavior that another approved surface does not already own, and every functional row depends on a capability the documentation still defers.

| Capability a user might expect here | Where the documentation puts it |
|---|---|
| Hub access method, endpoint, TLS, deployment state | Hub Settings (FR-13, DEC-025, DEC-033) |
| Enable or disable polling for a site | Managed-site lifecycle (DEC-031), Connectivity view |
| Users, roles, sessions | User Management (DEC-028) |
| Audit history | Audit Logs (DEC-028) |
| Alerts and their lifecycle | Alerts (DEC-028) |
| Host metrics, service control, recovery | System Monitoring & Recovery (DEC-026, DEC-027, DEC-039) |
| Background polling schedule, email delivery | Not implemented; deferred release requirements |

Two of the three switches also create a capability-implying risk: an enabled **Automatic polling** or **Email notifications** switch asserts behavior the documentation says does not exist, which this page's own rules forbid. **Require confirmation** is the inverse risk: a global off-switch would let an administrator weaken a safety control that FR-9 and DEC-031/DEC-039 currently enforce unconditionally.

### Options

**Option A, keep the page as an indefinite placeholder.** No work now. It stays a visible but non-functional Administration page, every future review repeats the "not operational" caveat, and its only unique content remains a branding constant and a timezone selector.

**Option B, reduce the page to settings that can be enforced with no new subsystem (recommended if the page is kept).** Keep the General card only: Application name and Display timezone, persisted server-side, admin-only, validated, audited, with safe defaults. Remove the three Preferences switches from this page: per-site polling stays per-site, notification delivery stays a deferred release, and confirmation remains an enforced per-action policy rather than a preference. This preserves the approved visual language, needs one small settings contract, and cannot imply a capability that does not exist. It still requires the decision, then API, persistence, authorization, audit, and tests before any control becomes interactive.

**Option C, retire the page.** Move the two genuinely enforceable values into the existing Hub Settings General area, or drop them; remove the Application Settings route and navigation entry; let each capability live on the page that owns it. This matches the principle that no Administration page exists without functional scope and leaves the smallest surface to secure and document. It contradicts the approved mockup's pictured screen, so it needs an explicit design decision.

**Option D, repurpose it as a settings index.** A page that only links to Hub Settings, User Management, System Monitoring & Recovery, and Audit Logs. No requirement defines it, it duplicates the navigation menu, and it adds a surface with no behavior of its own. Not recommended.

### Recommendation

Take **Option B** if the page must stay for visual completeness, and **Option C** if the smallest honest application surface is the priority. Do not treat Option A as a resting state, and do not implement Option B's workflows before the decision is recorded; if Option A is chosen deliberately, the page must keep its preview labeling.

**Chosen: Option C**, recorded as DEC-041 on November 23, 2026. The page was retired rather than reduced, because the two rows that could be enforced without a new subsystem were a branding constant and a timezone selector that no requirement asks for.

Independent of the choice:

- Do not add System Information, Maintenance, Backup & Restore, scheduler controls, or host/Docker controls to this page. Host operations belong to System Monitoring & Recovery.
- Do not present any switch as an operational default. A stored value must change real behavior, or the control must not be interactive.
- Any persisted setting needs server-side validation, a per-role authorization rule, safe defaults, an audit event where the value affects operations, and tests for reload persistence, concurrent updates, and denied access.

### Outcome, November 23, 2026

**Chosen option:** C, retire the page ([DEC-041](DECISIONS.md#dec-041-retire-the-hub-wide-application-settings-page)).

**Removed from the frontend:**

- the **Application Settings** Administration navigation entry and the `app-settings` page identifier in `apps/web/src/App.tsx`;
- the `page === "app-settings"` render branch and the `pageTitle` value that fed only that branch;
- the `/settings/application` entry in the Hub route map, replaced by a redirect to `/settings/hub` with a history replacement, so a saved bookmark resolves to a real page instead of falling through to the Hub overview;
- the shared placeholder card component: the `General` and `Preferences` cards, both placeholder actions, the three local-only switches, and the component-scoped toggle state;
- the same block where it had been reused inside Site Settings under a *Site preferences* heading. That copy presented Hub-wide values — application name, display timezone, and a global confirmation switch — on a per-site page, which no requirement approved. The page-specific styles were removed from `apps/web/src/style.css`.

**Retained:** the Device profile panel in Site Settings with its edit, enable/disable, credentials/TLS, and archive actions; Hub Settings; User Management; Audit Logs; and System Monitoring & Recovery. The `.switch` rules stay because User Management uses them for account status. The generic `.settings-grid` and `.settings-row` helper rules were also deleted in a follow-up commit, including the `.settings-grid` fragments inside the grouped auth-form selectors and the mobile grid override. No live component referenced them, so the deletion changed no behavior.

**Not added:** no API route, database migration, settings table, scheduler, notification provider, role rule, or audit event. Nothing is persisted and no capability is implied by the remaining interface.

**Where the former rows live now:**

| Former row | Current owner |
|---|---|
| Application name, Display timezone | Not implemented. If a requirement ever needs them, they belong to the Hub configuration surface under FR-13 and need their own approved contract (DEC-041). |
| Automatic polling | Managed-site lifecycle (DEC-031) and the Connectivity view; Hub-wide scheduling remains unimplemented |
| Email notifications | Deferred release requirement, explicitly not implemented |
| Require confirmation | Enforced per action by FR-9, DEC-031 (typed archive phrase), and DEC-039 (typed stack Stop phrase) — not a switchable preference |

**Verification:** `npm run typecheck`, `npm test` (22 files, 275 tests), and `npm run build --workspace @pfsense-hub/web` exit 0. The current bundle is `index-ee0p_jPM.js` with `index-Dde5v36r.css`; the first retirement build produced `index-CNcMdfiw.js` and `index-JAy8gOY-.css`. The built bundle contains no `Application Settings`, `Automatic polling`, `app-settings`, or `app-setting-row` string and does contain the `/settings/application` to `/settings/hub` redirect, and the built stylesheet contains no `app-settings`, `app-setting-row`, `settings-grid`, or `settings-row` rule. Details and remaining gaps are in [Verification and documentation closeout](VERIFICATION-AND-CLOSEOUT.md) section 14.

## Related documentation

See [Roadmap](ROADMAP.md) for the sequenced implementation backlog and [Frontend Implementation](FRONTEND-IMPLEMENTATION.md) for the current UI coverage and acceptance status.
