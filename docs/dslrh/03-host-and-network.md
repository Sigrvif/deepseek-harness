# 03 — What the harness does to your machine and network

The honest ledger. DSLRH runs **without a command sandbox on purpose**: shell
and filesystem tools execute as your user, unconfined. A test that needs
isolation should get a VM, not process-level confinement — that stance, and
the Windows ACL incident that prompted it, is recorded in
[05](05-fork-changes.md). This file lists what actually happens, so nothing
is a surprise.

## Processes the harness starts

| Process | When |
|---|---|
| `bash -c <cmd>` / `pwsh -NoLogo -NoProfile -NonInteractive -Command <cmd>` | Every `bash`/`pwsh` tool call; runs in your name, unconfined, in the session's working directory (so: also whenever the model decides) |
| node-pty shell | An interactive terminal tab is opened in the Web UI |
| ripgrep (`rg`) | `glob`/`grep` tool calls |
| pnpm | Plugin install/remove (`plugin_manager` tool, Plugins page, `dsh plugin`) |
| **Configured MCP server commands** (2.4.14) | One child process per enabled stdio MCP server (Settings → MCP Servers or a profile row), spawned when the server connects and killed on disable/remove/shutdown; `streamable-http` servers are outbound HTTP instead |
| LibreOffice (bundled kit) | Rendering an Office/PDF preview in the sidebar |
| The OS browser opener (`xdg-open`/`open`/…) | `./dsh` without `--no-open` — opens your **system** browser; `dsh-gui` instead uses the bundled LibreWolf with a private profile |
| External applications (VS Code, `explorer.exe`, Terminal…) | You click "Open In…" on a session/workspace |
| The server itself (`node app/lib/bin.js`) | Either launcher |

Subagents are **in-process**, not OS processes. Nothing runs at boot beyond
the server itself; no services, cron jobs, or registry entries are created.

## Files written outside the package

| Where | What | When |
|---|---|---|
| The chosen project folder (anywhere on disk) | Whatever the agent writes — by design | `write`/`edit`/shell commands |
| OS temp dir: `dsh-spill-*` | Command output beyond 64 KB, then up to 64 MB | Long tool outputs; swept automatically by later launches, not at exit |
| OS temp dir: `dsh-office-to-pdf-*` | Source + rendered PDF for Office previews | Removed after each conversion |
| pnpm's per-user store and config (`~/.local/share/pnpm`, `~/.npmrc`, Windows equivalents) | Package cache/config | Only if you install plugins |
| The system browser's own profile | Nothing dsh writes; it is just opened by `./dsh` | — |

Before 2.4.5, upstream's sandbox also rewrote the **NTFS security
descriptor** of every chosen project folder (standing deny ACE, path-derived
`S-1-4-…` grant, inheritable Low integrity label) and never revoked it. The
subsystem is removed; the cleanup recipe for affected folders is in the
top-level README.

Everything else — sessions, settings, credentials, attachments, spill
fallback, GUI logs, the GUI browser profile — stays inside
[DSH_HOME](04-data-and-settings.md). (Running `app/lib/bin.js` directly
without the launcher moves the default home to `~/.dsh` and re-enables
telemetry — use the launchers.)

## Network endpoints reachable from the harness

| Endpoint | Triggered by | Off switch |
|---|---|---|
| `127.0.0.1:3080` | The web UI itself (loopback bind; token + cookie auth) | — |
| `127.0.0.1:1234` (SLR Runtime) | Every model request, session titles | Your provider config |
| `https://dsh-otel-collector.deepseeksvc.com/v1/logs` | **Feedback telemetry only** (below) | `DSH_TELEMETRY_DISABLED` (launchers set it) |
| `https://api.deepseek.com` (+ `/v1`, `/anthropic` variants) | Only if you add a DeepSeek key/account or use DeepSeek web search | Don't configure it |
| `https://platform.deepseek.com` | DeepSeek account sign-in (optional) | Don't sign in |
| `registry.npmjs.org` / `registry.npmmirror.com` | Plugin management — including the model-facing `plugin_manager` tool in the standard preset | Don't use plugins; needs network anyway |
| Arbitrary public http(s) URLs | The model's `web_fetch` (below) | Preset config `fetch: false` |
| Ambient proxies (`HTTP(S)_PROXY`…) | All outbound requests, if the env names one | Unset the env |
| Whatever your MCP servers name (2.4.14) | stdio server child processes (any local IPC/exec they do), `streamable-http` server URLs + headers | Don't configure the server |

There is **no version or update check** anywhere in the harness.

### Telemetry, precisely

- The shipped composition carries upstream's feedback-telemetry pipeline with
  its production endpoint. It is **feedback-only**: nothing is sent during
  normal operation — no prompts, no usage pings.
- Clicking **Like/Dislike** or sending `/feedback` would export the **entire
  session log** (your prompts, answers, tool outputs, absolute working
  directory — including history inherited from forks), unredacted, in ≤4 MB
  gzip batches, tagged with a persistent random UUID
  (`$DSH_HOME/.anonymous-user-id`; delete the file to reset it).
- The launchers export `DSH_TELEMETRY_DISABLED=1`, which makes boot disable
  the pipeline outright — **in the shipped configuration no packet can leave
  without you unsetting that variable**. Unset it only on a machine where
  exporting full session transcripts is acceptable.
- Related upstream behavior, already off by the fork: embedding the session
  log in official DeepSeek API requests (`dsh_session_log`, opt-in only).

### `web_fetch`, exactly

Enforced: http(s) only; no credentials in URLs; URL ≤2048 chars; redirects
only to the same origin, re-validated, ≤5 hops; bodies capped 5 MB / 100 k
chars; 30 s timeout; a plain `deepseek-harness` user-agent; **no cookies or
ambient credentials**. Not enforced: private-address filtering — the tool can
fetch loopback and RFC1918 addresses (e.g. your SLR Runtime's status page).
On this package's threat model that adds nothing beyond the unconfined shell,
but it is stated here because "public destinations only" would overstate it.

## What the harness reads

- The whole inherited process environment (snapshotted at boot).
- Credential resolution order for any API key: managed
  `$DSH_HOME/.credentials.yaml` → inherited env → **`.env` in the directory
  you launched from** → `$DSH_HOME/.env`. A project `.env` silently supplies
  keys (e.g. an ambient `DEEPSEEK_API_KEY` arms DeepSeek web search).
  `.env` files can never override `DSH_*`, `PATH`, `HOME`, proxy, or TLS
  variables.
- `AGENTS.md`/`CLAUDE.md` in the project and `~/.agents` (instructions,
  skills) — reads only.

## Guards that do exist

- Loopback-only server bind; one-time token; HMAC cookies; uniform 401
  otherwise; `--trusted-host` is explicit.
- Shell child environments scrubbed of secret-looking and `DSH_*` variables;
  MCP server child processes (2.4.14) get the same scrub plus the server's
  own `env` block, and the bundled `node/bin` is on the harness's `PATH`
  (launchers export it), so bare `npx` commands resolve offline.
- Credential store file locked to 0600, written atomically, watched for
  external edits.
- Tools execute in-process with schema validation; no tool runs at boot.
- Sessions validate their preset loudly at creation (a broken plugin fails
  the session, never silently skips).
