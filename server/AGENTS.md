# AGENTS

## Purpose

`server/` is the thin local infrastructure runtime.

It should not become the main application runtime. Keep browser concerns in `app/` and keep this tree focused on explicit infrastructure contracts that the browser or CLI needs.

## Responsibilities

- serve the root HTML entry shells from `app/L0/`
- resolve browser-delivered modules from the layered `app/L0`, `app/L1`, and `app/L2` customware model
- expose server API modules from `server/api/`
- provide the outbound fetch proxy at `/api/proxy`
- own SQLite access and related integrity-safe persistence operations when persistence work is implemented
- support local development and source-checkout update flows without turning the server into business-logic orchestration

## Structure

Current server layout:

- `server/app.js`: server factory and subsystem bootstrap
- `server/server.js`: startup entry used by the CLI and thin host flows
- `server/config.js`: default host, port, and filesystem roots
- `server/dev-server.js`: source-checkout dev supervisor used by `npm run dev`
- `server/package.json`: ES module package boundary for the backend
- `server/api/`: endpoint modules loaded by endpoint name
- `server/proxy/`: router, CORS helpers, request parsing, response helpers, and upstream proxy service
- `server/lib/api/registry.js`: API module discovery
- `server/lib/app-files.js`: app-path normalization and file/glob helpers used by legacy app-file listing flows
- `server/lib/customware/`: layout parsing, group index building, and module inheritance resolution
- `server/lib/file-watch/config.yaml`: declarative watched-file handler configuration
- `server/lib/file-watch/handlers/`: watchdog handler classes loaded by name
- `server/lib/file-watch/watchdog.js`: reusable filesystem watchdog that dispatches matching change events to handlers and exposes handler indexes
- `server/lib/git/`: backend-abstracted Git clients used by the `update` command

## Request Flow And Runtime Contracts

- request routing order is: API preflight handling, `/api/proxy`, `/api/<endpoint>`, then static file resolution
- non-`/mod` static requests should stay limited to root HTML shells under `app/L0/`
- `/mod/...` requests resolve through the layered customware model, using the watched `path-index` plus the group index to select the best accessible match from `L0`, `L1`, and `L2`
- current request identity is derived from a temporary trusted `username` cookie via the request-context helper; treat this as a temporary shortcut, not as a long-term auth model to build around
- watchdog infrastructure is config-driven
- `path-index` is a normal watchdog handler, not a special side channel
- `group-index` derives group membership and management relationships from `group.yaml`
- add new watchdog handlers by adding handler classes and wiring them in `server/lib/file-watch/config.yaml`, not by manually binding handlers in `server/app.js`

## API Module Contract

Endpoint files are named by route:

- `/api/health` loads `server/api/health.js`
- `/api/asset_get` loads `server/api/asset_get.js`

Endpoint modules may export method handlers such as:

- `get(context)`
- `post(context)`
- `put(context)`
- `patch(context)`
- `delete(context)`
- `head(context)`
- `options(context)`

Handler context may include parsed body data, query parameters, headers, request and response objects, `requestUrl`, `user`, app/server directory references, and watched-file indexes.

Handlers may return:

- plain JavaScript values, which are serialized as JSON automatically
- explicit HTTP-style response objects when status, headers, binary bodies, or streaming behavior matter
- Web `Response` objects for advanced cases

Current endpoint set:

- `health`
- `asset_get`
- `asset_set`
- `db`
- `list_app_files`
- `load_webui_extensions`

Current status notes:

- `asset_get` and `asset_set` are placeholder endpoints, not finished persistence APIs
- `db` is a placeholder route family for future SQLite work
- `list_app_files` is an older bridge-style helper around app-file scanning; do not expand it casually if a cleaner module-based contract is available
- `load_webui_extensions` resolves extension files from layered `mod/**/ext/**` paths using the current user's group inheritance and exact module-path overrides

## Server Implementation Guide

- keep endpoints narrow and explicit
- prefer plain JavaScript return values for simple JSON APIs
- use explicit response objects only when needed
- keep shared server libraries infrastructure-focused and reusable
- keep proxy transport, API hosting, file watching, and persistence concerns separate from app orchestration
- keep `server/app.js` focused on bootstrapping core subsystems, not on special-case registration logic
- prefer deterministic loader folders and name-based discovery for APIs, watched-file handlers, workers, and similar extension points
- keep inheritance resolution explicit and small
- keep new persistence APIs explicit, small, and integrity-safe
- do not move browser-side agent logic onto the server by default
- keep backend modules in `server/` on ES module syntax with `import` and `export`
- when server responsibilities, request flow, API contracts, watched-file behavior, or persistence architecture change, update this file in the same session
