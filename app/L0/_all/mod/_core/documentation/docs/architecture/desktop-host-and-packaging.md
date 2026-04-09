# Desktop Host And Packaging

This doc covers the Electron desktop host and the packaging scripts that build native desktop outputs.

## Primary Sources

- `packaging/AGENTS.md`
- `packaging/desktop/main.js`
- `packaging/desktop/preload.js`
- `packaging/scripts/desktop-builder.js`
- `packaging/scripts/desktop-dev-run.js`
- `app/package.json`
- `package.json`
- `server/app.js`

## Desktop Host Startup

The Electron host stays thin:

- it starts the existing Node server runtime from `server/app.js`
- it waits for `listen()` before reading runtime fields such as `browserUrl`
- it opens the browser UI inside `BrowserWindow`

Current startup contract:

- the desktop host binds the backend to `127.0.0.1`
- it passes `PORT=0`, so the OS assigns a free local port for that launch
- after `listen()`, the server runtime updates its public `port` and `browserUrl` fields to the resolved bound port
- the host loads `${browserUrl}${launchPath}` instead of reconstructing a fixed URL from config

## Packaged Versus Source-Checkout Behavior

Current Electron behavior differs only where the native-host contract requires it:

- packaged apps force `SINGLE_USER_APP=true`
- packaged apps open `/enter` as the recovery-safe launcher shell
- source-checkout desktop dev runs keep the normal runtime auth flow
- both packaged and source-checkout runs use the same free-port startup flow

`preload.js` currently exposes only the minimal `spaceDesktop.platform` bridge to renderer code.

## Packaging Outputs

Desktop packaging is owned by `packaging/scripts/desktop-builder.js` plus thin per-platform entrypoints.

Current build behavior:

- reads the root `package.json` `build` config
- keeps `directories.app` pinned to the repo root because the Electron host entry lives outside `app/`
- keeps `app/package.json` in the bundle so the app tree stays an ES module package boundary, which means that nested package file must keep basic metadata such as `name` and `version`
- keeps the canonical source icon artwork under `packaging/resources/icons/source/` and derives platform-specific packaging icons from it
- points macOS packaging at that source PNG so `electron-builder` can compile the final app icon internally, while Windows and Linux use checked-in derived assets under `packaging/platforms/`
- disables `npmRebuild` so optional native dependencies such as `nodegit` do not block desktop packaging when fallback Git backends are already available
- keeps `asar` disabled so the bundled project tree stays watchable on disk
- writes platform artifacts under `dist/desktop/<platform>/`
- for macOS, the default targets are `dmg` and `zip`
- `--dir` produces an unpacked `.app` output for local inspection

Use this doc together with `packaging/AGENTS.md` when you need the exact host-versus-server ownership split.
