# 04 — Data, settings, and configuration

`DSH_HOME` (the bundle's `dsh-home/` by default; an exported value wins)
holds everything. Delete it for a factory reset — you lose sessions,
settings, and stored keys.

## Layout

| Path | What lives there |
|---|---|
| `profiles/web/` | The web profile: `package.json` (bundle list), `cordis.patch.yml` (**all Settings-UI state** + the shipped SLR preset), pnpm workspace files; `node_modules` only if you installed plugins |
| `sessions/<projectKey>/<sessionId>/session.v4.jsonl.zstd` | Append-only session logs, one per session, grouped by working-directory slug |
| `storages/<domain>/<table>/<key>.json` | Key-value domains (below) |
| `.credentials.yaml` | Stored API keys + the browser-session grant (0600, atomic writes) |
| `.anonymous-user-id` | Random UUID used only if telemetry is ever enabled |
| `attachments/v1/`, `cache/attachments/` | Content-addressed image/file bytes referenced from sessions |
| `browser-profile/` | The GUI browser's own profile — dismissed popups, drafts; **no dsh settings** |
| `gui.log`, `gui.pid` | GUI diagnostics; pid used to stop a stale server holding the port |
| `.env` | Optional user-level env layer (keys etc.; cannot set `DSH_*`/`PATH`/proxy vars) |

KV domains under `storages/`: `session_projcache` (session-listing
checkpoints), `workspace`, `schedule` (persistent reminders),
`context_editor` (the Context tab's request log + edits/exclusions/overrides,
keyed by session id — migrate it together with `sessions/`), and
`mcp_servers` (2.4.14: the MCP Servers settings page's server definitions —
each record is one server: name, transport, command/args/env or URL/headers,
enabled flag).

## Session logs

Format v4: zstd-compressed JSONL; first record is a header (id, creation
time, cwd, parent session, preset). Read one with
`zstd -dc session.v4.jsonl.zstd`. Everything model-visible is
reconstructable from the log — that is an upstream invariant ("model-visible
⟺ logged"), and the Context tab's request log is derived from the same
stream. `/export` in the UI packages a session as ZIP + Markdown. The format
has been stable across the fork's whole 2.x line.

## Settings

One file: `dsh-home/profiles/web/cordis.patch.yml` (plain YAML, one entry
per plugin; stop dsh before hand-editing — it rewrites the file on the next
settings change). Deleting a plugin's entry resets that plugin to default;
deleting the file also removes the shipped SLR preset (restorable from
`examples/slr-runtime-provider.patch.yml`).

Main namespaces the UI writes:

| Namespace | Controls |
|---|---|
| `llm-pi-ai` | Custom model providers (the SLR Runtime preset): base URL, key env, model catalog, compat flags, stream idle timeout (editable per provider in the Models page's customized section) |
| `agent-default-model` | Provider/model for new sessions |
| `llm-deepseek*` | DeepSeek route (base URL, thinking, models) |
| `web`, `web-search-deepseek`, `web-deepseek-api` | Web search/fetch providers and their keys |
| `bash-local`/`pwsh-local` | Shell timeout, cwd, output caps (the Shell tab under Built-in plugins — restored in 2.4.8, it had bound the removed sandbox executors' names) |
| `agent-loop` | Parallel tool-call cap |
| `subagent-model-selection-settings` | Allowed child models |
| `session-log-deepseek` | Session-log upload (default **off**) |
| `superpowers-bootstrap` | Auto Superpowers toggle |
| `unrestricted-mode` | Unrestricted mode toggle (default **off**) |
| `change-report` | Change reports toggle — per-turn files-changed notices to the model (default **on**) |
| `ui-theme`, `locale`, `ui-chat`, … | Appearance and behavior preferences |
| `agent-preset-registry` | Default agent preset |

Most fields are *volatile*: edits apply live without a restart.

## Credentials

`.credentials.yaml` holds stored keys (written by the Models page; never
materialized into the process environment) and the
`client-connection/browser-session` signing grant, which is auto-regenerated
if missing — deleting just that record fixes login loops after migrations.
Resolution order for a key reference: this file → inherited env → project
`.env` → `$DSH_HOME/.env`.

## Environment variables

| Variable | Meaning (default) |
|---|---|
| `DSH_HOME` | Data root (bundle's `dsh-home/`) |
| `DSH_TELEMETRY_DISABLED` | Any non-empty value disables feedback telemetry (launchers set `1`) |
| `DSH_TELEMETRY_MODE` / `DSH_TELEMETRY_OTLP_URL` | Telemetry mode/endpoint, if ever enabled (`FEEDBACK_ONLY` / DeepSeek collector) |
| `DSH_PERMISSION_MODE` | Sandbox-policy mode; fork default `danger-full-access` — commands always run unconfined regardless |
| `DSH_BUNDLED_SKILL_DIR` | Bundled skills root (set by launchers) |
| `DSH_AGENTS_HOME` | Shared agent config root (`~/.agents`) |
| `SLR_RUNTIME_API_KEY` | Placeholder key for the SLR preset (`slr-local`, set by launchers) |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` | Official DeepSeek route + search, if used |
| `DSH_GUI_BROWSER` | Substitute browser executable for the GUI (testing) |
| `HTTP(S)_PROXY` / `NO_PROXY` / `ALL_PROXY` | Standard proxy env, honored for all outbound requests |

Exported **into** agent shells: `DSH_HOME`, `DSH_SHELL`, `DSH_SESSION_ID`,
`DSH_PROFILE`, `DSH_PROFILE_DIR`, `DSH_WEB_URL` (secret-looking names are
scrubbed out).

## CLI

```sh
./dsh                      # web UI, system browser
./dsh web --no-open        # no browser
./dsh web --port 8080 --host <ip> --trusted-host <name>
./dsh-gui                  # web UI in the bundled LibreWolf
./dsh --profile headless "task…"   # one-shot session, prints answer, exits
./dsh plugin --profile web add …   # pnpm passthrough (needs network)
./dsh --version / --help / --dump-config
```

`--profile` picks/creates a profile under `$DSH_HOME/profiles`; `--patch`
adds an overlay patch; first unrecognized token goes to the app command.
