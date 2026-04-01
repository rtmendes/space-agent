# AGENTS

## Purpose

`app/` is the primary Agent One runtime.

Keep agent orchestration, prompt construction, tool flow, state management, user interaction, and optimistic UX in the browser whenever possible. Server-backed work in this tree should be browser clients for explicit server APIs, not server-side orchestration leaking into the frontend.

## Structure

The browser runtime is organized into three layers:

- `L0/`: immutable firmware changed through updates
- `L1/`: runtime-editable group customware
- `L2/`: runtime-editable user customware

Current browser entry surfaces:

- `app/L0/index.html`: main chat shell
- `app/L0/admin.html`: admin shell

Current shared module locations:

- `app/L0/_all/mod/_core/framework/`: shared frontend framework bootstrap, runtime helpers, API client, modal/component support
- `app/L0/_all/mod/_core/chat/`: current chat runtime, UI, storage, execution context, and LLM client helpers
- `app/L0/_all/mod/_core/admin/`: current admin UI modules
- `app/L0/test/`: firmware-side test and example customware fixtures

## Layer Rules And Module Model

- `L0` is firmware and should stay update-driven
- `L1` contains per-group customware; `_all` and `_admin` are special groups
- `L2` contains per-user customware; users should only write inside their own `L2/<username>/`
- `L1` and `L2` are transient runtime state and are gitignored; do not document repo-owned example content there as if it were durable framework structure
- groups may include users and other groups, and may declare managers that can write to that group's `L1` area
- group definitions live in `group.yaml` files under `app/L0/<group-id>/` and `app/L1/<group-id>/`
- modules are the supported browser extension unit
- each group or user owns a `mod/` folder, and module contents are namespaced as `mod/<author>/<repo>/...`
- browser-facing code and assets should normally be delivered through `/mod/...`
- the current inheritance model is `L0 -> L1 -> L2` across the effective group chain for the current user
- the current request identity still comes from a temporary trusted `username` cookie; do not build new frontend assumptions that depend on that shortcut lasting forever

## Frontend Implementation Guide

- keep root HTML shells thin; they should load shared framework assets and mount root `x-component` entries instead of owning large inline controllers
- use `/mod/_core/framework/initFw.js` as the shared frontend bootstrap for framework-backed pages
- prefer Alpine stores created with `createStore(...)` for feature controllers
- gate store-dependent component content with `x-data` and `template x-if="$store.<name>"`
- use Alpine handlers such as `@click`, `@submit.prevent`, `@input`, `@keydown`, `x-model`, `x-text`, `x-ref`, `x-init`, and `x-destroy` instead of wiring most behavior through manual `querySelector` listeners
- pass DOM references into stores from Alpine via `x-ref`; do not make stores scan the whole document when direct refs will do
- keep stores responsible for state, persistence, async flows, and orchestration; move large render-only helpers into separate modules when templating alone becomes too dense
- expose shared browser-facing APIs through the `A1` runtime namespace
- keep feature-specific runtime state in the owning feature namespace or store, such as `A1.currentChat`, not in generic runtime globals
- keep new runtime features in module folders, not in ad hoc top-level static paths
- legacy extension helpers still exist under the framework area; do not expand them casually if the module-based `/mod/...` model already covers the use case

## Current State

- `app/L0/index.html` loads framework styles and `/mod/_core/framework/initFw.js`, then mounts `/mod/_core/chat/chat-page.html`
- `app/L0/admin.html` follows the same pattern and mounts `/mod/_core/admin/admin-shell.html`
- browser-side file changes still require a manual browser refresh; live reload is not wired into the app runtime yet
- when app structure, layer behavior, module layout, entry shells, or frontend conventions change, update this file in the same session
