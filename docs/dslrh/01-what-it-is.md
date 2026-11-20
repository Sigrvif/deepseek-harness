# 01 — What DSLRH is and how it runs

DSLRH is a self-contained local build of a **fork of DeepSeek Harness 0.2.2-alpha.2** (the pristine upstream release), tuned for offline testing against a local OpenAI-compatible model server (SLR Runtime on `http://127.0.0.1:1234/v1`). Everything it needs ships in the package: a Node.js runtime, the harness with all dependencies, native modules, and a portable LibreWolf browser for the windowed GUI.

## The pieces

| Piece | What it is |
|---|---|
| `dsh` / `dsh.cmd` | Launcher. Sets the environment (see [04](04-data-and-settings.md)), then runs the `web` command. Without arguments it starts the Web UI and opens the **system** browser; `--no-open` skips the browser. |
| `dsh-gui` / `dsh-gui.cmd` | GUI launcher. Starts the same server with browser-opening off, then opens the UI in the **bundled LibreWolf** with its own profile (`-no-remote`). Closing the window stops the server. |
| `node/` | Node.js v24.22.1 runtime (official build). |
| `app/` | The harness: a Cordis plugin tree in `app/node_modules` — several hundred `@deepseek-ai/*` packages. Only the ones mounted by the composition (below) are active; the rest is inert code carried for dependency closure. |
| `dsh-home/` | All data: profiles, settings, sessions, storages, credentials. Layout in [04](04-data-and-settings.md). |
| `browser/` | LibreWolf 158 + the GUI launcher script. |
| `examples/` | `slr-runtime-provider.patch.yml` — the ready-made provider entries for patch-file configuration. |

## Boot flow

1. The launcher exports `DSH_HOME` (default: the bundle's `dsh-home`), `DSH_TELEMETRY_DISABLED=1`, `SLR_RUNTIME_API_KEY=slr-local`, and `DSH_BUNDLED_SKILL_DIR` (the bundled superpowers skills). Pre-set values always win.
2. `app/lib/bin.js` parses CLI flags (`--profile`, `--patch`, `--dump-config`, …), resolves the profile — **`web`** is the shipped one — creating it from a template on first use, and boots the Cordis loader.
3. The profile's `package.json` names its bundles in order: `@deepseek-ai/dsh-base` (the host core) then `@deepseek-ai/dsh-web-app` (the web host + browser roster). Each bundle contributes a `cordis.patch.yml`: **one list of plugin rows**. Rows activate by service availability, not by file order.
4. Patch layers apply **last-write-wins per row id**: base bundle → web-app bundle → the four **agent preset** patches → your profile's `dsh-home/profiles/web/cordis.patch.yml` (where the Settings UI writes) → an optional home-level patch → `--patch` CLI overlays → a final derived patch that disables the telemetry row when `DSH_TELEMETRY_DISABLED` is set. A patch **replaces** the row's whole `config`; the settings service does field-level merging when it writes.
5. The web server binds `127.0.0.1:3080` (wildcard binds are refused), serves the built frontend, prints a one-time token URL, and — unless `--no-open`/SSH — opens a browser.

## Agent presets (per-session plugin sets)

Sessions are not the whole process: each session mounts one **agent preset** — a scoped second layer of model-facing plugins. Four ship; the default is `standard`:

| Preset | In one line |
|---|---|
| `standard` (default) | Full coding agent: shell, fs, search, jobs, schedule, skills, goal, todo, plan mode, subagents, web tools, ask-user, present. |
| `ptc` | Standard minus plugin tools. Upstream this preset ran tool calls through an out-of-process script runtime (PTC); that runtime is removed in this fork, so it falls back to the native executor. |
| `cordis` | Standard plus a runtime-inspection tool and harness-composition skills — for developing dsh plugins. |
| `minimal` | Persona + read-only images + compaction + **stateful persistent shells** only. |

Tool-by-tool detail lives in [02](02-model-surface.md).

## Who can connect

- The server binds loopback only. `--host` must name a concrete interface; `--trusted-host` can add specific authorities for the API fence.
- The printed URL carries a one-time launch token. First contact exchanges it for an HMAC-signed cookie (`HttpOnly`, `SameSite=Strict`). Every request without it gets a uniform 401 — including other machines and other local processes that did not see the token.
- `--tls-cert/--tls-key` enable HTTPS; `--public-url` only affects how links are rendered and grants nothing by itself.

## Other profiles

The launcher can also create and run upstream's other profile templates: `headless` (one-shot CLI task), `sdk` / `sdk-minimal` (stdio JSON-RPC), `acp`. They are not pre-created; the web profile is the shipped default.
