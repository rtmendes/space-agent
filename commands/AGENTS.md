# AGENTS

## Purpose

`commands/` contains CLI command modules used by `space`.

Keep this file scoped to command-module behavior and help metadata. Repo-wide CLI surface and top-level command names still belong in `/AGENTS.md`.

Documentation is top priority for this area. After any change to command discovery, command behavior, command help, or the command tree under `commands/`, update this file in the same session before finishing.

## Contract

Each command module should export:

- `execute(context)`
- `help`

The `help` export may include:

- `name`
- `summary`
- `usage`
- `description`
- `arguments`
- `options`
- `examples`

The command loader discovers command modules dynamically from `commands/*.js`.

That means:

- every `.js` file in this folder is treated as a command module
- command names come from filenames
- command modules must stay import-safe because `help` loads them dynamically to collect metadata
- avoid top-level side effects, heavy startup work, or environment-specific initialization during import
- keep parsing and validation explicit inside the command module instead of relying on hidden global state

The `help` export should be complete enough that `node space help <command>` is useful without reading the code. Prefer accurate usage lines, concrete descriptions, explicit argument descriptions when position matters, and examples when the command shape is not obvious.

## Current Commands

- `group`
- `serve`
- `help`
- `user`
- `version`
- `update`

## Command Families

There are two kinds of commands in this tree:

- operational commands that control or inspect the local runtime: `serve`, `help`, `version`, `update`
- state-management commands that edit layered runtime data under `app/`: `user` and `group`

The preferred shape is a small number of readable top-level commands with explicit subcommands. Do not add one file per tiny action when a subcommand fits the existing command family cleanly.

## Operational Commands

### `serve`

Purpose:

- start the local Node server
- serve browser page shells and `/mod/...` assets
- expose `/api/...` endpoints
- keep local infrastructure available for browser-first flows

Current flags:

- `--host <host>`
- `--port <port>`

Current usage:

- `node space serve`
- `node space serve --host 0.0.0.0 --port 3000`

Guidance:

- keep `serve` focused on process startup and bootstrap overrides
- do not move application behavior into the command when it belongs in `server/`

### `help`

Purpose:

- list discovered commands
- show per-command help derived from each command module's `help` export

Current usage:

- `node space help`
- `node space help <command>`
- `node space --help`
- `node space --help <command>`

Guidance:

- command help text is part of the CLI contract; keep it accurate
- if a command grows new flags or subcommands, update both the module help and this file

### `version`

Purpose:

- print the git-derived project version string

Current usage:

- `node space version`
- `node space --version`

Guidance:

- keep output machine-friendly and concise
- omit the `+0` suffix when HEAD is exactly on the latest tag; print the bare tag instead
- avoid adding unrelated diagnostics here

### `update`

Purpose:

- update a source checkout from the git repository
- support branch tracking, remembered branch reconnect, tag targets, and commit targets

Current usage:

- `node space update`
- `node space update --branch <branch>`
- `node space update <branch>`
- `node space update <version-tag>`
- `node space update <commit>`

Behavior summary:

- with no target, it fast-forwards the current or recoverable branch from `origin`
- with `--branch <branch>` or a branch positional target, it reattaches and updates that branch
- with a tag or commit target, it moves the current or recovered branch to that exact revision when possible, otherwise it may fall back to detached HEAD

Guidance:

- keep update logic source-checkout specific
- prefer explicit revision handling over clever inference
- surface destructive or branch-moving behavior clearly in help text

## Runtime State Commands

These commands edit the layered runtime state under `app/`. They should operate through explicit filesystem contracts and shared backend libraries, not through ad hoc inline file mutations.

### `user`

Purpose:

- create and maintain `L2` users
- manage password verifier state

Current subcommands:

- `create`
- `password`
- `passwd` as an alias of `password`

Current usage:

- `node space user create <username> --password <password> [--full-name <name>] [--force]`
- `node space user password <username> --password <password>`

Current behavior:

- `create` creates `app/L2/<username>/`
- `create` writes metadata to `app/L2/<username>/user.yaml`
- `create` writes the password verifier to `app/L2/<username>/meta/password.json`
- `create` initializes sessions in `app/L2/<username>/meta/logins.json`
- `create` ensures a `mod/` folder exists for the user
- `password` rewrites the verifier and clears active sessions
- `--full-name` sets `full_name` in `user.yaml`; if omitted it defaults to the user id
- `--force` replaces the full user directory during create

Examples:

- `node space user create alice --password secret123`
- `node space user create alice --password secret123 --full-name "Alice Example"`
- `node space user create alice --password secret123 --force`
- `node space user password alice --password newsecret456`

Guidance:

- keep user creation idempotent only when explicitly requested; otherwise fail on existing users
- password-changing commands must clear sessions unless the auth model is intentionally changed
- keep auth storage layout consistent: metadata in `user.yaml`, auth state under `meta/`

### `group`

Purpose:

- create and maintain writable `L1` groups
- edit `app/L1/<group-id>/group.yaml` membership and manager relationships
- do not write `L0`; firmware groups are developer-maintained outside the CLI

Current subcommands:

- `create`
- `add`
- `remove`

Current usage:

- `node space group create <group-id> [--force]`
- `node space group add <group-id> <user|group> <id> [--manager]`
- `node space group remove <group-id> <user|group> <id> [--manager]`

Current behavior:

- `create` creates `app/L1/<group-id>/` and initializes `group.yaml`
- `create` ensures a `mod/` folder exists for the group
- `add` and `remove` work with both user membership and group inclusion
- `--manager` switches the target list from included members to managing members
- user targets affect `included_users` or `managing_users`
- group targets affect `included_groups` or `managing_groups`

Parameter meanings:

- `<group-id>` is the target writable `L1` group id
- `<user|group>` selects whether `<id>` is a user id or another group id
- `<id>` is the user id or group id being added or removed

Examples:

- `node space group create team-red`
- `node space group add team-red user alice`
- `node space group add team-red user alice --manager`
- `node space group add team-red group qa-team`
- `node space group add team-red group ops --manager`
- `node space group remove team-red user alice`
- `node space group remove team-red group qa-team`

Guidance:

- keep group mutations explicit; the command should always make it clear whether it edits members or managers
- prefer normalized list editing through shared helpers in `server/lib/customware/`
- when extending group semantics, keep command syntax readable instead of growing multiple near-duplicate top-level commands

## Implementation Conventions

- keep command modules small and explicit
- put shared CLI routing behavior in `space`
- put shared domain logic in server libraries, not inside the command parser
- commands should parse arguments, validate them, call a shared library, and print a concise result
- unknown flags or malformed argument combinations should fail fast with a useful usage error
- prefer deterministic output over chatty logs
- do not hide important destructive behavior behind implicit defaults
- prefer explicit filesystem contracts such as `user.yaml`, `meta/password.json`, `meta/logins.json`, and `group.yaml`
- keep command names and subcommands stable once exposed; when changing them, update help text and docs in the same session

## Guidance

- prefer a small number of readable top-level commands with subcommands over proliferating one-file one-action command names
- when command discovery, command help shape, or command-specific conventions change, update this file in the same session
