# AGENTS

## Purpose

`server/lib/auth/` owns the local auth and session system.

It handles password verifier logic, login challenge and completion, session-cookie issuance and revocation, user file helpers, derived user indexing, and CLI-facing user-management helpers. This is local infrastructure, not the final identity system, so keep it explicit and narrow.

Documentation is top priority for this subtree. After any change under `server/lib/auth/`, update this file and any affected parent or dependent docs in the same session.

## Ownership

Current files:

- `service.js`: login challenge creation, login completion, session-cookie helpers, session revocation, and request-user resolution
- `passwords.js`: verifier and proof helpers
- `user_files.js`: canonical `L2/<username>/user.yaml` and `meta/` read or write helpers
- `user_index.js`: derived user and session index snapshot builder
- `user_manage.js`: create user, set password, and create guest user helpers

## Storage Contract

Current user storage layout:

- metadata: logical `L2/<username>/user.yaml`
- password verifier: logical `L2/<username>/meta/password.json`
- active sessions: logical `L2/<username>/meta/logins.json`
- user-owned modules: logical `L2/<username>/mod/`
- on disk those files live under `CUSTOMWARE_PATH/L2/...` when `CUSTOMWARE_PATH` is configured, otherwise under repo `app/L2/...`

`user_files.js` is the canonical helper layer for those files. Do not write them through ad hoc path logic elsewhere.

## Session And Login Contract

Current session rules:

- the session cookie name is `space_session`
- the cookie is `HttpOnly`, `SameSite=Strict`, and scoped to `/`
- login uses the shared challenge and proof flow from `service.js`
- successful login writes the session record into `meta/logins.json` and refreshes the watchdog
- session revocation deletes the stored session entry and refreshes the watchdog
- when `SINGLE_USER_APP` is enabled, request auth resolves every request to the implicit `user` principal and bypasses cookie-backed login entirely

Current user-index rules:

- `user_index.js` derives user records and sessions from `user.yaml`, `password.json`, and `logins.json`
- request auth state should flow from that derived index rather than reparsing those files manually per request

## User-Management Contract

`user_manage.js` currently owns:

- `createUser(...)`
- `setUserPassword(...)`
- `createGuestUser(...)`

Rules:

- user creation initializes the user directory, `meta/`, and `mod/`
- password resets rewrite the verifier and clear active sessions
- guest users are created under randomized `guest_` usernames

## Development Guidance

- keep auth state and session rules centralized here
- do not add direct cookie or session-file manipulation elsewhere when the auth service already owns the flow
- treat the current local file-backed auth model as a constrained infrastructure contract, not as a place to casually grow unrelated policy
- if user storage, session semantics, or login flow change, also update `app/L0/_all/mod/_core/onscreen_agent/ext/skills/development/` because its development skills mirror this contract
- if user storage, session semantics, or login flow change, update this file and the relevant router or API docs in the same session
