# DeepSeek Harness (dsh) — Offline Bundles

Self-contained, offline-usable builds of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
for **Linux x64** and **Windows x64**, prepared for local testing against the
**SLR Runtime** (the llama.cpp server bundled with SLR Translator).

Each bundle folder carries everything dsh needs at runtime — the Node.js
runtime, the harness with all its dependencies, and the platform's native
modules — so nothing is downloaded or installed after unpacking. No internet
connection is required to run it.

| Bundle | Platform | Contents |
|---|---|---|
| `DSLRH-Linux/` | Linux x86-64 (glibc) | dsh 0.2.2-alpha.2 fork + Node.js v24.22.1 |
| `DSLRH-Windows/` | Windows 10/11 x64 | dsh 0.2.2-alpha.2 fork + Node.js v24.22.1 |

The bundles carry a **fork of dsh 0.2.2-alpha.2** (upstream commit
`e9b2168`): **DSLRH** (DeepSeek Local Runtime Harness) — the same harness
with the native Context Editor integrated, the local-testing defaults
summarized under [Adjustments in this package](#adjustments-in-this-package),
and one upstream subsystem removed on purpose (the command sandbox). Each
bundle carries a package version in `VERSION.txt` and in its archive name
(`dslrh-linux-x64-v2.4.15.7z`, `dslrh-windows-x64-v2.4.15.7z`).

Each bundle also ships a **windowed GUI that needs no installed browser**
(`dsh-gui` / `dsh-gui.cmd`): a bundled [LibreWolf](https://librewolf.net)
browser (official portable build) opens the Web UI in its own window, so dsh
works even with a broken or missing default browser. See
[Windowed GUI without a browser](#windowed-gui-without-a-browser).

Both bundles were verified against SLR Runtime b11429 (SLR Translator 3.080)
serving `qwen35-4b-paperwitch-q8.gguf` (with its DFlash draft auto-paired by
the runtime): the model answers through dsh's Web UI configuration, its
headless one-shot mode, and the Context Editor was verified end to end — an
edit made in the tab changes the next request's payload on the wire and
survives a restart.

## Documentation

The `docs/` folder inside each bundle is the systematic reference for the
whole package, written from a full source audit — start there before
assuming behavior:

| File | Answers |
|---|---|
| [docs/01-what-it-is.md](docs/01-what-it-is.md) | The pieces, boot flow, profiles/presets/patch layers, who can connect |
| [docs/02-model-surface.md](docs/02-model-surface.md) | Every tool, slash command, and skill the model gets; what shapes each request |
| [docs/03-host-and-network.md](docs/03-host-and-network.md) | Every process spawned, file written outside the bundle, and network endpoint — including telemetry and the `web_fetch` guard list |
| [docs/04-data-and-settings.md](docs/04-data-and-settings.md) | The `dsh-home/` layout, session-log format, settings namespaces, environment variables, CLI |
| [docs/05-fork-changes.md](docs/05-fork-changes.md) | Every deliberate difference from upstream, why it exists, known limitations |

This README stays operational: starting, connecting, troubleshooting,
upgrading.

## Quick start

### Linux

```sh
cd DSLRH-Linux
./dsh                     # starts the Web UI at http://127.0.0.1:3080
```

### Windows

```bat
cd dsh-windows-x64
dsh.cmd
```

Running the launcher **without arguments** starts the Web UI (so
double-clicking `dsh.cmd` works too). The launcher prints a URL with a
one-time login token and opens the default browser. If you would rather not
use the installed browser at all, start the bundled windowed GUI instead
(next section). To skip any browser: `./dsh web --no-open` /
`dsh.cmd web --no-open`. Keep the console window open while dsh runs;
closing it stops dsh.

## Adjustments in this package

These bundles are a lightly adjusted fork for local testing; the complete
list with rationale is in [docs/05-fork-changes.md](docs/05-fork-changes.md).

- **No command sandbox.** Upstream confines the agent's shell commands: the
  permission presets (Read only / Workspace write / Full access) select a
  confinement level, and the Windows backend enforces it by rewriting the
  NTFS security descriptor of the chosen project folder — standing deny ACEs
  and a Low integrity label that are never revoked, even after dsh exits.
  This package removes the sandbox entirely: every command runs unconfined,
  project folders are never touched beyond the files the agent writes, and
  the preset picker is gone from the composer (there is nothing to pick).
  The `workflow` tool went with it — it executed model-written scripts
  through the sandboxed runtime. If a test ever genuinely needs isolation,
  isolate the machine (a VM), not the folder.
- **Telemetry off.** The launchers disable feedback telemetry; no packet
  leaves without you re-enabling it (details in
  [docs/03-host-and-network.md](docs/03-host-and-network.md)).
- **Dark mode by default; no first-run dialogs.** The Web UI starts with the
  dark palette (the bundled LibreWolf always reports "light" as an
  anti-fingerprinting measure, so "follow the system" never turns dark), the
  "Preview Notice" is pre-acknowledged, and no key-warning dialog opens by
  itself. The DeepSeek provider is not touched: **Settings → Models** still
  lets you add a DeepSeek API key or account exactly as upstream.
- **The native Context Editor and Context Fold** (the fork's headline
  additions — next section and
  [docs/05-fork-changes.md](docs/05-fork-changes.md)).
- **The MCP Servers settings page** (2.4.14 — own section below; npx-based
  servers spawn against the bundled Node.js).
- **A self-healing workspace picker** (2.4.16). On Linux the native OS
  chooser (zenity, then kdialog) is only used when it actually starts: at
  boot the harness runs `--version` on the chooser instead of trusting the
  binary exists, and a chooser that cannot start (a partial upgrade leaving
  libadwaita newer than gtk4 kills zenity with a `symbol lookup error`
  before any dialog) automatically falls back to the in-app directory
  browser — workspace creation keeps working with no OS dialog. Failures at
  pick time fall through zenity → kdialog, and a final error names each
  tier's cause instead of a doubled `Command failed` wall. Details below in
  "Host requirements".
- **A local-test settings posture.** The Models tab ships with the
  **SLR Runtime** preset as its top entry (see the SLR section below); the
  add-provider card opens on the "Custom model API" flow; the version row
  names both the dsh base and the fork package version; the Built-in plugins
  page has a "Fork additions" tab describing what this package carries
  beyond upstream.
- **License paperwork rides every bundle** (2.4.18). The package root
  carries upstream's `LICENSE` (MIT) and `THIRD_PARTY_NOTICES.md` beside
  this README, so the archives state their own terms; every bundled npm
  package keeps its own license file inside `app/node_modules`.

The theme and dialog defaults live in one file,
`app/node_modules/@deepseek-ai/dsh-web-app/cordis.patch.yml` (search for
"Local-test fork defaults"). The Context Editor is part of the fork's
source; if you replace the `app/` tree with a stock installation, both the
editor and the defaults are gone (a stock npm dsh works, minus these
additions).

## The Context tab

Every session gains a third view next to **Chat** and **Trajectory**. It
answers one question: *what exactly will the model receive next, and what
has it received so far?*

- **Context pane** — every model-visible message of the session (system
  prompt, runtime context, your messages, answers, tool outputs) with a
  token estimate per row and for the whole request. Each row can be
  **edited** (text replaced in place, reasoning signatures handled), or
  **excluded** (removed from every future request; the timeline hides it
  too). Edits keep their original as provenance — **Restore original** puts
  it back exactly. Multi-row selection supports batch edits and batch
  exclusion.
- **Requests pane** — the log of the last requests actually sent to the
  model provider (every request, including auxiliary ones like session
  titles), each expandable to the full JSON payload.
- **Tools & params pane** — remove or restore tools for this session and
  override generation parameters (temperature, max tokens, stop sequences,
  penalties). Overrides apply to agent turns and survive restarts.

Edits are durable session events: they persist across restarts, survive in
forks, and restore exactly. Selective condensation (summarize a chosen range
through the official compaction protocol) is available from the row
selection.

**Edit & resend in Chat (2.4.19)** — every sent message gains a pencil next
to Copy. It turns the bubble into an editable box; **Save & resend** removes
that message and everything after it from the model's context (one confirm;
restorable here in the Context tab) and sends the corrected text as a new
prompt. Stopped a broken prompt? Fix the typo and go — no exclusion walk
required. Exclusions and edits fold out of the live transcript immediately
(2.4.21) — no reload needed to see them take effect. The editor edits text only (attachments are not carried over), and
injections tied to the original send (session references, skill loads) stay
in context. In the Context tab, **Exclude to end** does the same truncation
with one confirm, and an excluded range now shows *what* it removed —
`Excludes #5–#12` plus the original text — instead of a bare `(excluded)`
row.

Alongside the tab, **Context Fold** lets the model itself compress consumed
conversation into summaries it writes, through four ordinary tools:
`compress` (fold a consumed range), `decompress` (read the originals back),
`search_context` (keyword search over summaries and originals), and
`acp_status` (usage + fold ledger). Folds are reversible, take effect on the
next model request, survive restarts, and never destroy the original
messages. Gentle nudges prompt the model as context grows. Adapted from the
open-source billion-context project (MIT + attribution) and re-built
natively on dsh's session log — no proxy involved.

## Branding (2.4.24)

The interface carries the DSLRH brand: the sidebar logo row shows the
DSLRH mark with the name plate **DSLRH** + fork version (click copies the
version), the window title reads **DSLRH**, and the blank-session greeting
upstream renders in the middle of the screen is removed.

## The right Sidebar's Files tab (2.4.22)

Every session's right Sidebar carries a **Files** tab — the session
workspace's file tree — and it opens by default at about half the
conversation's width (a deliberate collapse is remembered per session, and
the panel drag-resizes if you want it wider or narrower). Right-clicking a file or folder opens a real
context menu: **Open** (files, into the reading pane), **Copy absolute
path**, **Copy relative path**, and **Reference in chat**, which drops an
`@relative/path` mention into the composer so the next prompt can point at
the file without typing the path.

## MCP servers (2.4.14)

**Settings → MCP Servers** adds external tool servers to every session
(Model Context Protocol). Their tools appear under stable
`mcp__<name>__<tool>` names — the same convention Claude Code and Codex
use — alongside the built-in tools.

- **Local command (stdio)** — dsh spawns the server and talks JSON-RPC
  over its stdin/stdout. Example servers: **camofox** (anti-detection
  browser automation; start `npx camofox-browser@latest` first, then add
  a server with command `npx`, args `-y camofox-mcp@latest`, env
  `CAMOFOX_URL=http://localhost:9377`; on Windows, headless mode only) and
  **x64dbg-automate** (drive the x64dbg debugger; needs your own Python
  install and the x64dbg-automate plugin in the debugger; command
  `x64dbg-automate-mcp`).
- **URL (Streamable HTTP)** — dsh connects to a running server, e.g.
  `http://127.0.0.1:3000/mcp`, with optional headers.

**Broker mode (on by default)** — instead of handing the model every
server tool (2–3 servers easily mean 30+ entries), the model sees three:
`mcp_search_tools` (search by free text), `mcp_describe_tool` (full
argument schema), and `mcp_execute_tool` (run it). Turn it off on the same
page to expose all `mcp__…` tools directly; large-context or stronger
models often prefer that.

The bundled Node.js (including `npx`) is on `PATH` inside dsh, so
`npx`-based servers work without a system Node install — on Windows too:
the MCP client spawns server processes through `cross-spawn`, which
resolves `npx` to its `npx.cmd` shim automatically. Each server has a
tool-call timeout (default 60 s) and auto-reconnects after a crash.
Definitions persist in `dsh-home/storages/mcp_servers/` and survive
restarts; a failed spawn is shown per server and never blocks the others.

Servers can also be configured by hand in
`dsh-home/profiles/web/cordis.patch.yml` — the row **must** sit under an
`- insert:` block (a bare top-level row is silently ignored):

```yaml
- insert:
    - id: mcp-camofox
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: camofox
        transport: stdio
        command: npx
        args: ['-y', 'camofox-mcp@latest']
        env:
          CAMOFOX_URL: 'http://localhost:9377'
```

Details: `docs/02-model-surface.md` (model surface), `docs/03-host-and-network.md`
(spawned processes, env scrubbing, egress).

## Windowed GUI without a browser

```sh
cd DSLRH-Linux
./dsh-gui                # Linux; on Windows run dsh-gui.cmd instead
```

`dsh-gui` starts the dsh server with browser-opening disabled and opens the
Web UI in the bundle's own LibreWolf 158 (official portable build on
Windows; the official Linux AppImage, extracted so it runs without FUSE).
It runs with its own profile and `-no-remote`, so it never touches the
system browser or any running browser instance. Closing the LibreWolf
window stops the server. Extra arguments go to the web command
(`dsh-gui --port 8080`). On Linux the browser needs the usual desktop
libraries any Firefox needs (GTK3, nss — present on any normal desktop
distribution); a `Sandbox ... clone() failure` warning on exotic kernels is
harmless (the browser falls back and continues).

The GUI writes a diagnostic log to `dsh-home/gui.log`. If a previous GUI
run was killed hard and its server still holds port 3080, the next start
finds and stops it automatically (via `dsh-home/gui.pid`, falling back to a
process scan), like SLR Runtime's `--stop`. To check the browser by itself:
`DSH_GUI_BROWSER="librewolf --headless --screenshot /tmp/ui.png" ./dsh-gui`
renders the UI to a PNG and exits.

Other useful commands (identical on both platforms):

```sh
./dsh --version           # print the dsh version
./dsh --help              # CLI help
./dsh web --port 8080     # serve the Web UI on another port
./dsh web --no-open       # serve without opening a browser
```

## Connecting dsh to SLR Runtime

SLR Runtime serves an OpenAI-compatible API on `http://127.0.0.1:1234` by
default (`SLR Runtime.cmd` / `SLR Runtime.sh`, options `--port <n>` and
`--stop`; it uses the model and settings last recorded by SLR Translator).
The **model id is the GGUF file name** of the served model.

### Step 1 — start SLR Runtime

Start it from your SLR Translator folder and wait until it reports the model
as loaded. Note the port (default 1234) and the model id shown in its status
line.

### Step 2 — the SLR Runtime provider (already configured, editor opens first)

The bundle ships with an **SLR Runtime** provider preset as the default: the
Models settings page lists it at the top, pointing at
`http://127.0.0.1:1234/v1`, with a placeholder API key (`slr-local`, set by
the launchers — SLR Runtime ignores keys, but dsh always sends one) and an
example model entry (a Qwen3.6-35B-A3B GGUF declared with text+image input
and off/low/medium/high reasoning — SLR Runtime maps anything above off to
"on").

Because the model must match what your SLR Runtime actually serves, **the
preset's editor opens by itself on start**. Adjust the **Model catalog**
entry — press **Fetch available models** (asks the server via
`GET /v1/models`) or type the model path/file name by hand — fix the Base
URL port if you changed it, and **Apply**. The editor stops opening by
itself once the model differs from the shipped example; the row stays at
the top either way, and the composer's model picker selection becomes the
default for new sessions.

The preset lives in `dsh-home/profiles/web/cordis.patch.yml` — edit it there
to change the endpoint or model before first start. DeepSeek is not gone: it
is listed under **Add model provider → Third-party model provider** and
becomes a normal entry once you give it an API key (or set
`DEEPSEEK_API_KEY` in your environment).

### Step 2 (headless profile) — configure via profile patch file

The headless profile has no web UI; each bundle ships a ready-made example at
`examples/slr-runtime-provider.patch.yml`. Copy its two entries into
`dsh-home/profiles/headless/cordis.patch.yml`, adjust model id and port, and
run the profile.

For the patch-file route the API key comes from the environment: export
`SLR_RUNTIME_API_KEY=slr-local` before starting dsh, or write
`SLR_RUNTIME_API_KEY=slr-local` into `dsh-home/.env`.

The launchers also export `DSH_BUNDLED_SKILL_DIR` pointing at the bundled
superpowers skills shipped inside the app, so every session's skill catalog
includes them (see `VERSION.txt`). Override the variable to use a different
bundled root; project and user skill directories always outrank it.

### Step 3 — talk to the model

Type in the Web UI, or run a one-shot task from the command line:

```sh
SLR_RUNTIME_API_KEY=slr-local ./dsh --profile headless "Summarize this folder in three bullets."
```

The headless profile runs one fresh session, prints the final answer, and
exits — handy for scripted tests. It creates `dsh-home/profiles/headless/`
on first use; put the same provider patch there as for the web profile.

## Offline behavior

The launchers set `DSH_TELEMETRY_DISABLED=1`, so no telemetry is sent (any
non-empty value disables it). The Web UI serves all of its assets from the
local server; nothing is loaded from CDNs. Model requests go only to the
provider you configured (SLR Runtime on this machine). Profile setup on
first launch copies shipped templates — no network involved. What does not
work offline, by design: the plugin market and `dsh plugin` package
management (needs pnpm + registry access), the web-search tool, and any
non-local model provider. The complete network ledger — including what
feedback telemetry would send if you ever re-enabled it — is
[docs/03-host-and-network.md](docs/03-host-and-network.md).

## Where dsh keeps its data

The launchers set `DSH_HOME` to the `dsh-home/` folder inside each bundle,
so profiles, sessions, settings, and credentials all stay inside the bundle
and it remains portable. Delete `dsh-home/` to reset dsh to a clean state.

To store the home elsewhere (e.g. a shared location), set `DSH_HOME`
yourself before launching — an externally set value wins over the default.
The full layout — every file, its owner, and the session-log format — is
[docs/04-data-and-settings.md](docs/04-data-and-settings.md).

## Host requirements

The core loop (server, Web UI, bundled browser, bundled Node.js, session
logs) is self-contained. What the package asks of the host OS, by feature:

- **Linux C runtime**: a standard glibc distribution (2.28 or newer —
  Debian 10, Ubuntu 18.04, RHEL 8, or anything current).
- **Workspace directory picker** (2.4.16): on Linux, dsh uses `zenity`,
  falling back to `kdialog`. At boot it *runs* `zenity --version`
  (then `kdialog --version`); if neither starts — not installed, or broken
  by a system library mismatch — the Web UI automatically uses its built-in
  directory browser instead, and workspace creation always works. On
  Windows the folder dialog is fully built-in (no host dependency).
- **Default workspace folder on first use**: `xdg-user-dir DOCUMENTS`
  (the `xdg-user-dirs` package) on Linux; built-in on Windows. Without the
  binary, the harness falls back to `~/Documents` (when it exists), else the
  home directory (2.4.17) - the picker pre-fills it and you can change it.
- **Opening a file or URL on the desktop**: `xdg-open` and a running
  desktop session on Linux; built-in on Windows. On a headless host the
  buttons degrade to showing the path as text.
- **Terminal tab**: your system shell (`bash`/`zsh`/`fish`; `cmd`/
  PowerShell on Windows) — expected, a shell tool implies a system shell.
- **Windowed GUI (`./dsh-gui`)**: the bundled LibreWolf needs the standard
  desktop stack (GTK 3, X11 or Wayland, D-Bus) — the same stable libraries
  every Firefox-family browser uses.
- **MCP servers**: your own commands (stdio or HTTP). A bare `npx` command
  resolves against the bundled Node.js; an `npx <package>` server fetches
  from npm on its first run (network needed once, then cached) — fully
  offline setups should point servers at local files.
- **The model**: SLR Runtime (or any OpenAI-compatible server) on
  `127.0.0.1:1234` is intentionally outside this package.

## Troubleshooting

- **`MISSING_CREDENTIAL` / `No API key for provider`** — the provider has no
  key. In the Web UI form, type any value into the API key field; with a
  patch file, set `apiKeyEnv` and export the variable (see above).
- **`Couldn't open folder` when creating a workspace** — the error text now
  names the failing chooser and its cause, e.g.
  `native directory chooser failed (zenity: zenity: symbol lookup error:
  …; kdialog: not installed)`. That specific message means the system's
  GTK libraries are out of sync (typically a partial upgrade: libadwaita
  newer than gtk4) — a full system upgrade fixes it, or install `kdialog`.
  Meanwhile workspace creation still works through the in-app directory
  browser: 2.4.16 only selects the OS chooser when it actually starts.
- **`zenity: symbol lookup error` in a terminal too?** Then the problem is
  the system, not dsh — verify with `zenity --version` outside dsh, and
  `ldd /usr/lib/libadwaita-1.so.0 | grep gtk-4` shows which gtk4 the
  mismatched libadwaita resolves.
- **`UNKNOWN_MODEL`** — the model id must exactly match what the server
  reports: the GGUF file name. Check `curl http://127.0.0.1:1234/v1/models`.
- **Model discovery finds nothing** — enter the model id by hand; discovery
  is a convenience, not a requirement.
- **Requests refused although URL and key are right** — a gateway can shape
  requests differently than OpenAI. SLR Runtime b11429 needed no corrections
  in testing, but if a future runtime build rejects requests, add to the
  provider entry in `cordis.patch.yml`:
  ```yaml
        compat:
          supportsDeveloperRole: false
          maxTokensField: max_tokens
  ```
- **Port already in use** — dsh's Web UI defaults to 3080; SLR Runtime to
  1234. Change either (`dsh web --port <n>` / `SLR Runtime --port <n>`).
- **Windows SmartScreen** may warn about `node.exe` or `librewolf.exe` when
  the folder arrives via a browser download; these are official,
  checksum-verified binaries (Node.js v24.22.1; LibreWolf 158.0.1-2
  portable/AppImage). Choose "Run anyway" or unblock the files.
- **`dsh-gui` window never appears** — check `dsh-home/gui.log`; it records
  everything the GUI, the server, and the browser print. The browser can be
  exercised on its own (see the screenshot check above), and
  `DSH_GUI_BROWSER` can substitute any other executable to isolate a fault.
- **"Your LibreWolf profile cannot be loaded"** — the launcher creates the
  profile directory (`dsh-home/browser-profile`) before starting the
  browser, so this means the folder exists but is unreadable, unwritable,
  or left corrupt by a crash. Delete `dsh-home/browser-profile` (only the
  GUI's browser profile — no dsh settings are stored there) and start
  again; it is recreated fresh.
- **A session created with the `ptc` preset failed before 2.4.7**
  (`agent-preset/invalid … waiting for ptcRuntime`) — a leftover from the
  sandbox removal, fixed in that version; ptc-preset sessions run on
  the native executor.
- **Resuming a very large session was aborted mid-prefill and retried**
  ("Retried model request (X/5)") on versions before 2.4.8 — the stream
  idle timeout then defaulted to 5 minutes, while a cold 100k+ prompt on a
  local runtime sends nothing until the first token. The default is now
  2 hours, tunable per provider under **Settings → Models → provider →
  customized → Stream idle timeout (ms)**.
- **The Shell settings tab was missing before 2.4.8** — it was bound to the
  removed sandbox executors' names; it now edits the local executors that
  actually run (timeout, output cap).
- **A session refused model switches with `MODEL_SWITCH_COMPACTION_FAILED`
  on versions before 2.4.10** — switching to a smaller-window model force-
  compacted through the old model first, so a switch away from a
  since-removed model failed forever and bricked the session. Automatic
  engine compaction is gone in 2.4.10 (Context Fold or manual `/compact`
  instead); after upgrading, the same switch simply succeeds and the
  session resumes normally.

## Upgrading from an earlier package

The archive replaces the program; your data lives in `dsh-home/` and migrates
by file placement — the session-log and storage formats have been stable
across this fork's whole 2.x line, so nothing converts. The one rule:
**carry data over, let the new archive provide the deliberate defaults.**

1. Stop the old dsh (close the GUI window or its console).
2. Extract the new archive to a fresh folder (never unpack over the old
   one — that keeps an intact rollback).
3. Copy from the old `dsh-home/` into the new one — data only:
   - `sessions/` — chat logs.
   - `storages/` — the Context tab's per-session data (request log, edits,
     exclusions, fold records), keyed by session id. Move it together with
     `sessions/`, or those panes come up empty for pre-upgrade sessions.
   - `.credentials.yaml` — stored provider API keys.
   - Optional conveniences: `browser-profile/` (the GUI browser's dismissed
     popups and drafts), `logs/`, `.anonymous-user-id`.
4. Settings: **keep the new `dsh-home/profiles/web/cordis.patch.yml`.** If
   you had deliberately changed settings, port those entries over by hand —
   the file is plain YAML, one entry per plugin. Typically that is your
   model id and port inside the `llm-pi-ai` (SLR Runtime) entry, plus any
   deliberate flips (theme, Auto Superpowers, the upload toggle). Do not
   copy the old patch file wholesale: the shipped patch is where deliberate
   fixes live (v2.4.4, for example, corrected the preset's model id from a
   full path to the bare GGUF filename — wholesale-copying an older patch
   would revert exactly that). Entries aimed at plugins the new version no
   longer mounts (e.g. `permissionPresets` in a home from ≤ 2.4.4) are
   inert; drop them while you are there.
5. Never carry over `profiles/*/node_modules` or lockfiles — they reference
   the old app tree. (Offline this only matters if you ever installed a
   plugin; reinstall it instead.)
6. Start the new bundle and check: old sessions list, a pre-upgrade
   session's Context tab fills, Models shows your provider, and the
   General tab's version row names the new fork package version.

If the GUI ever loops on login after migrating, delete the
`client-connection/browser-session` record from the copied
`.credentials.yaml` — that grant is regenerated on the next start; your
stored provider keys are the other records in the same file.

Equivalently, you can upgrade in place: copy everything **except**
`dsh-home/` from the new bundle over the old folder. Same result, but you
lose the easy rollback a fresh folder gives you.

## Resetting settings

All Settings-UI state (theme, language, Auto Superpowers, the upload toggle,
model providers) lives in one file per profile:

    dsh-home/profiles/web/cordis.patch.yml

Stop dsh before editing or deleting it — the server holds the file in memory
and rewrites it on the next settings write. Deleting the file resets every
setting to its shipped default, **but it also removes the shipped SLR
Runtime preset**, which lives in the same file by design. To restore the
preset, copy the two entries from `examples/slr-runtime-provider.patch.yml`
back into the file. To reset a single setting, delete just that plugin's
entry from the YAML — it is plain text. What is not settings:
`.credentials.yaml` (stored API keys), `sessions/` (chat logs), `storages/`
(Context tab data), `browser-profile/` (the GUI browser's own profile).
Deleting the whole `dsh-home` folder gives a factory-fresh home — a bare
model setup without the SLR preset until you re-add it from the example
file. Details: [docs/04-data-and-settings.md](docs/04-data-and-settings.md).

## Windows: folders locked by an earlier version

Versions of this package before 2.4.5 carried upstream's Windows command
sandbox. If you used such a version, the project folder you chose (e.g.
`E:\Dev3`) was modified permanently: it gained a deny ACE for Everyone, an
allow ACE for a synthetic `S-1-4-…` SID derived from the folder path, and a
Low integrity label — all standing, never revoked. Current versions never
touch folder security. To clean up a folder an earlier version locked, run
from an elevated command prompt:

```bat
icacls E:\Dev3 /save "%USERPROFILE%\Desktop\Dev3-acl-backup.txt" /t
icacls E:\Dev3 /reset /t /c
icacls E:\Dev3
```

The final check should list only the normal inherited entries (typically
`Everyone:(I)(OI)(CI)(F)`) and no `DENY`, no `S-1-4-`, and no
`Mandatory Label` line. The label was inheritable, so resetting the root
clears the whole tree. Note the side effects the lock had while it stood:
subdirectories refused Full-control opens (some backup/sync tools hit
Access Denied), and the Low label allowed any other low-integrity process
running as your user to write and delete inside the folder.

## Archives

The archives next to this README contain the matching bundle folder. The
name carries the package version (`dslrh-linux-x64-v2.4.15.7z`,
`dslrh-windows-x64-v2.4.15.7z`); it matches the `VERSION.txt` inside the bundle
and bumps whenever the bundle content changes.

Both archives are `.7z`. The dependency trees are plain folders (no
symlinks), so any 7-Zip-compatible tool works and nothing else is lost in
extraction:

```sh
7z x dslrh-linux-x64-v2.4.15.7z   # preserves the executable bits
```

Windows: extract with 7-Zip/NanaZip/WinRAR. If an extraction tool drops the
executable bits on Linux anyway, restore them once:
`chmod +x DSLRH-Linux/dsh DSLRH-Linux/dsh-gui DSLRH-Linux/node/bin/node DSLRH-Linux/browser/librewolf/AppRun`.

## What is inside each bundle

```
dsh-linux-x64/            dsh-windows-x64/
├── dsh                   ├── dsh.cmd            launcher (no arguments = Web UI;
│                         │                       sets DSH_HOME, DSH_TELEMETRY_DISABLED)
├── dsh-gui               ├── dsh-gui.cmd        windowed GUI, no browser needed
├── node/                 ├── node/               Node.js v24.22.1 runtime
├── app/                  ├── app/                dsh 0.2.2-alpha.2 fork
│   └── node_modules/     │   └── node_modules/   + all npm dependencies
├── browser/              ├── browser/            LibreWolf 158 + gui-launcher.js
├── dsh-home/             ├── dsh-home/           dsh data (created on use)
├── examples/             ├── examples/           slr-runtime-provider.patch.yml
├── docs/                 ├── docs/               the documentation set (see above)
├── VERSION.txt           ├── VERSION.txt         package version + fork notes
└── README.md             └── README.md           this file
```

Native modules are preinstalled per platform (`sharp`, `koffi`, `node-pty`,
`sherpa-onnx`, `ripgrep`, and dsh's own addons); each bundle contains exactly
the set a native install on that OS would have.

## Notes and limitations

- This is the official **CLI / Web UI** distribution of dsh (the fork
  described above), not the Electron desktop app.
- dsh is a fast-moving developer preview ("THERE WILL BE COMPATIBILITY-
  BREAKING CHANGES", per upstream). These bundles are pinned to the fork of
  `0.2.2-alpha.2` (upstream commit `e9b2168`); the fork's own changes are
  tracked in the `FORK.md` inside the fork repository, and upstream updates
  can be merged following its runbook.
- x64 only; Linux builds expect a standard glibc distribution (built around
  glibc 2.28+; works on current Debian/Ubuntu/Fedora/Arch).
- The bundles must live in a writable location (dsh-home and session logs
  are written next to them); on Windows avoid `C:\Program Files` unless you
  set `DSH_HOME` elsewhere.
- Licensed under MIT (upstream). Each npm package's license text ships
  inside `app/node_modules`; upstream's third-party notices:
  https://github.com/deepseek-ai/deepseek-harness/blob/main/THIRD_PARTY_NOTICES.md
