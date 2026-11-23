# Application Settings page redesign

**Status:** Approved design scope for the frontend redesign; functional settings integration is deferred to later roadmap work.  
**Reference:** Application Settings mockup supplied during the November 22, 2026 design review.

## Objective

Redesign **Administration → Application Settings** to match the supplied mockup. This is a Hub-wide settings page, not a per-firewall Site Settings page and not a host or Docker administration console.

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

## Immediate frontend redesign acceptance criteria

- [ ] The Application Settings page matches the supplied mockup's title, subtitle, two-card composition, row order, labels, descriptions, and actions.
- [ ] Desktop uses a two-column card layout; tablet/mobile layouts stack cleanly without clipping or horizontal overflow.
- [ ] General and Preferences cards use consistent spacing, alignment, borders, and typography from the existing design system.
- [ ] Switches and action controls have accessible names, visible focus states, and appropriate keyboard interaction.
- [ ] Preview-only behavior is communicated honestly. No success toast or saved-state claim is shown for local-only changes.
- [ ] The page remains distinct from Site Settings and Hub Settings.

## Future functional work, not part of the redesign

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

## Related documentation

See [Roadmap](ROADMAP.md) for the sequenced implementation backlog and [Frontend Implementation](FRONTEND-IMPLEMENTATION.md) for the current UI coverage and acceptance status.
