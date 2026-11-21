# Manager authentication

The manager uses two account roles:

- **Admin**: full access to manager features and user administration.
- **User**: authenticated read-only access to manager data.

## First launch

When no administrator exists, the web application displays the one-time administrator setup screen. The first administrator supplies a display name, email address, and password of at least 12 characters. The API serializes bootstrap attempts with a PostgreSQL advisory transaction lock and refuses subsequent bootstrap requests.

## Credentials and sessions

- Passwords are hashed using Node.js scrypt with a random per-password salt.
- Passwords and session tokens are never returned to the browser.
- Session tokens are random, opaque values. Only SHA-256 hashes are stored in PostgreSQL.
- Sessions expire after 12 hours and are revoked at sign-out.
- The browser cookie is HttpOnly, SameSite=Strict, host-only, and Secure when the request is served through HTTPS.
- The API checks the session and current account role on each authenticated request.
- Login attempts are temporarily rate-limited per source IP in the API process.
- Authenticated state-changing requests with an Origin header must match the manager's origin.

## API access

The initial setup status, one-time administrator bootstrap, and sign-in endpoints are public. All other manager API endpoints require a valid session. User and role administration endpoints additionally require the Admin role. Both roles can view the initial read-only firewall inventory and request read-only checks.

The pfSense API key remains a Docker secret and is used only by the API container. It is not stored in manager user records or sent to browser code.

## Current limitations

This is the first authentication milestone, not a completed production identity system. There is no password reset or email delivery, MFA, external identity provider, persistent distributed login throttling, or administrator recovery workflow yet. Keep the UI bound to localhost until the remaining production security review is complete.
