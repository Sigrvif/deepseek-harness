# 05 — Deliberate differences from upstream

Every intentional divergence of DSLRH from DeepSeek Harness 0.2.2-alpha.2,
with its reason. Anything **not** listed here behaves as upstream — and is
described in [01](01-what-it-is.md)–[04](04-data-and-settings.md).

## Removed or disabled

| Change | Why |
|---|---|
| **The command sandbox is gone** (2.4.5): the sandbox provider, the confined `bash-sandbox`/`pwsh-sandbox` executors, `fs-sandbox`, and the permission-preset service are not mounted; plain local executors run; the preset picker is absent from the UI | Upstream's Windows backend permanently rewrote the chosen project folder's ACLs (standing Everyone deny, path-derived `S-1-4-…` grant, inheritable Low integrity label — never revoked, even after exit). A test needing isolation gets a fully isolated machine, not folder ACLs. Cleanup recipe for folders locked by ≤2.4.4: top-level README |
| **The `workflow` tool and its PTC runtime are disabled** | The runtime executes model-written scripts through the removed sandbox seam; in-process code execution is the same capability category. The `ptc` agent preset keeps working on the native executor (its executor row is disabled since 2.4.7 — before that, creating a ptc-preset session failed outright) |
| **Feedback telemetry off by default** | The launchers export `DSH_TELEMETRY_DISABLED=1`. Upstream would export full session transcripts to its collector on Like/Dislike. The pipeline is described honestly in [03](03-host-and-network.md) rather than ripped out: nothing can leave while the launchers are used |
| **Session-log upload off by default** | Upstream embeds the session log in official DeepSeek API requests ("help improve DeepSeek") when enabled; now an explicit opt-in |
| **First-run dialogs pre-acknowledged**; no key-warning cards | Local-testing posture: the package must start clean with no provider key |
| **Plugin market tool disabled in the standard preset** (still live in `cordis`) | Offline default; plugin management remains available through the Plugins page and `plugin_manager` when network exists |

## Added

| Addition | What it does |
|---|---|
| **Context Editor** (host + Context tab) | Captures every outbound request; shows the effective context with per-row edit/exclude/restore, batch ops, selective condensation, and per-session tools & generation-params overrides. Edits change the next request and survive restarts |
| **Context Fold** | Model-driven reversible compression: `compress`/`decompress`/`search_context`/`acp_status` tools, growth nudges, fold records in the session log. Adapted from billion-context (MIT, attributed in the Fork-additions tab) |
| **Bundled superpowers skills + auto-bootstrap** | Six workflow skills — rewritten for small local models and small no-repo projects (see [02](02-model-surface.md)) — shipped as the lowest-precedence skill root; `using-superpowers` auto-injected once per session (toggle in Settings → General). Rewritten from superpowers 7.0.1 in 2.4.13 (before that: the fifteen upstream skills vendored verbatim); the repo-centric upstream workflows were dropped and their kernels folded into the six, around a short `SPEC.md` goal anchor |
| **SLR Runtime preset** | Local OpenAI-compatible provider preconfigured (`127.0.0.1:1234`, placeholder key); its editor opens on start until the model id is changed from the example |
| **Quota-aware retry** | Provider usage-limit messages are parsed into exact reset times and slept through (≤6 h); request-id clock inference for providers that don't state a timezone |
| **Local-hardware timeouts** | The stream idle timeout defaults to **2 hours** (upstream: 5 min) and is a per-provider field in the Models page — a cold big-context prefill on a local runtime streams nothing until the first token, and the upstream default aborted + restarted exactly those requests; the Shell settings tab is restored (it had bound the removed sandbox executors' namespaces) |
| **Quieter, steadier long-session context** (2.4.9) | Fold reminders repeat every **30k tokens** of new growth (upstream-derived default: 50k) and no longer stall after a fold: small downward drift of the token estimate (pruner rewrites) is not mistaken for a compaction event and can no longer reset the reminder cadence — previously a long run could get exactly one reminder and then none. The durable time sample repeats **hourly** (upstream: 10 min) and drops its browser-zone line when the browser zone equals the request zone (anti-fingerprinting browsers report a fixed zone, so the line was constant noise) |
| **No automatic engine compaction** (2.4.10) | Upstream's automatic compaction triggers (step pressure, model switch, context-overflow recovery) are off; compaction runs only through Context Fold or manual `/compact`. The removed model-switch trigger was the worst offender: switching to a model with a smaller window force-compacted **through the old model** — the one being switched away from — so a switch away from a since-removed model 404'd forever (`MODEL_SWITCH_COMPACTION_FAILED`), permanently bricking the session, even when the context fit the new window comfortably (the threshold math does not scale: fixed 65,536 headroom plus the request's reserved completion tokens dropped a 128k window's bar to ~30k). Side effect, accepted: a provider-confirmed context overflow now fails the turn with the provider error instead of auto-summarizing — fold or `/compact` by hand |
| **Escalating fold-reminder wording** (2.4.11, absolute cap 2.4.12) | The fold reminder's phrasing follows the measured usage instead of one flat "compress now": informational while the window is mostly free (below 40% — small models otherwise folded needlessly early) **and** absolute usage is below 200k tokens (a million-token window must escalate at real token counts, not wait for 40% of itself), the advisory form to 70%, a demanding imperative with a named consequence for ignoring it to 90%, and the urgent form past 90%. The boundaries are config fields (`nudgeAdviseRatio`/`nudgeDemandRatio`/`nudgeInfoMaxTokens` on the context-fold row) |
| **MCP on-demand broker** (2.4.15) | Small models with 2–3 servers face 30+ tools; broker mode (default **on**, toggle on the MCP Servers page) replaces them with `mcp_search_tools`/`mcp_describe_tool`/`mcp_execute_tool` — lexical search over the connected servers' tools, full schema disclosure, and direct execution that reuses each tool's own definition (behavior identical to the direct path). Hiding is a per-agent tool restriction refreshed as servers connect or die; flipping the toggle live restores the direct `mcp__*` tools on the next request |
| **Self-healing workspace picker** (2.4.16) | On Linux the native OS chooser (zenity, then kdialog) is only used when it actually **runs**: the boot probe now executes `zenity`/`kdialog --version` instead of trusting that the binary exists, so a chooser that cannot start (a rolling-distro GTK4/libadwaita mismatch kills zenity with `symbol lookup error` before any dialog) automatically mounts the in-app **browse** picker and workspace creation just works. At pick time every non-cancel zenity failure falls through to kdialog (upstream fell back only when zenity was absent), and a final failure is one readable error naming each tier's cause — e.g. `native directory chooser failed (zenity: zenity: symbol lookup error: …; kdialog: not installed)` — instead of a doubled-prefix `Command failed` wall. Windows needs none of this: its dialog is fully built-in |
| **First-use default without xdg-user-dirs** (2.4.17) | Upstream resolves the first-use default workspace directory through `xdg-user-dir DOCUMENTS` and fails the `workspaces.initializeDefault` RPC outright when the `xdg-user-dirs` package is not installed. The lookup now falls back to `~/Documents` when it exists as a directory, else the home directory — a usable pre-filled suggestion the operator can change. Only a *missing* binary falls back: a system that answers keeps upstream semantics, including the refusal to treat a home-reporting (disabled) XDG directory as Documents, and every other lookup failure still propagates |
| **MCP Servers settings page** (2.4.14) | Upstream's MCP client (`dsh-mcp-client`, shipped and functional) was configurable only by hand-editing the profile patch, where the natural first attempt — a bare top-level row instead of the required `- insert:` block — is **silently ignored**. The fork adds `dsh-mcp-manager` (a storage-domain-backed supervisor that mounts each enabled definition as its own `dsh-mcp-client` fiber — the pattern ACP uses for session servers) and a **Settings → MCP Servers** page (`dsh-client-ui-settings-mcp` over the `mcpManager` remote): add/edit/enable/disable/restart stdio or HTTP servers live, definitions persist in `$DSH_HOME/storages/mcp_servers/`, per-server status and failure reasons are visible, and manual profile rows keep working beside page-managed ones. The launchers now put the bundled `node/bin` on `PATH`, so `npx`-based servers (camofox) spawn without a system Node install. Recipes in the bundle READMEs (camofox, x64dbg-automate) |
| **DSLRH branding** (2.4.24) | The blank-session greeting (whale icon, "Into the Unknown", preview badge) is removed, and the sidebar's logo row shows the DSLRH mark with the name plate **DSLRH** + fork version (click copies it) instead of the whale and the upstream base-version string. The window title reads DSLRH too |
| **Right sidebar opening width** (2.4.23) | The Files sidebar's first-open width is 30% of the frame (upstream: 45%), which lands it at roughly half the conversation's width on desktop screens instead of filling half the viewport; drag-resizing still works and persists for the app run |
| **Workspace Files sidebar** (2.4.22) | Right-clicking a file or folder opens a real context menu — **Open** (files), **Copy absolute path**, **Copy relative path**, and **Reference in chat**, which drops an `@relative/path` mention into the composer (upstream showed the browser's native page menu). The Files tab also opens by default in every session — the space next to the session view holds the file tree instead of a collapsed strip — while a deliberate collapse persists per session as before |
| **Live fold of edited/excluded context** (2.4.21) | Context-tab exclusions/edits and the chat's edit & resend used to leave the old exchange visible in the live transcript until the next reload, reading as if the action had failed; the live intake now retires the shadowed messages the moment the replacement lands, with exactly the fold a reload produces |
| **Prompt edit & resend** (2.4.19) | A pencil on every sent message turns the bubble into an inline editor; **Save & resend** removes that message and everything after it from the model's context (one confirm; restorable in the Context tab) and sends the corrected text as a new prompt — the stop-a-broken-prompt path no longer requires a Context-tab walk of per-row exclusions. The Context tab grows an **Exclude to end** row action (one confirm for prompt-plus-tail) and exclusion stubs that name their coverage (`Excludes #5–#12` plus the removed text) instead of a bare `(excluded)` row. The editor edits text only — attachments are not carried over; injections tied to the original send (session references, skill loads) stay in context |
| **Local-test UI defaults** | Dark theme; DeepSeek routes sorted last and dormant until keyed; the version row names the fork package; a "Fork additions" settings tab; the sidebar's bottom launcher is a plain **Settings** button (2.4.21) — upstream's account menu (Feedback to DeepSeek's form, account Sign in) is gone from it, and account management lives on the Account settings page; the MCP Servers editor no longer reserves a 240px band per field (2.4.21) |
| **Robustness fixes** | Serving-probe before browser open (Windows empty-page race); spill-store fallback when %TEMP% denies writes |

## Known limitations

- No confinement, by design (see [03](03-host-and-network.md) for the full
  ledger). The approval row survives from upstream but nothing consults it.
- The `minimal` preset's persistent-pwsh tool description claims no internet
  access; the shell is not restricted (upstream text, kept).
- Out-of-process subagent backends and the desktop (Electron) distribution
  are not shipped.
- Tools/params overrides apply to agent turns only and are not inherited by
  forks (upstream boundary).

## Version history

The full changelog lives in `VERSION.txt` beside this folder. Milestones:
2.4.5 removed the sandbox; 2.4.6 added the migration guide; 2.4.7 added this
documentation set and fixed the ptc preset; 2.4.8 raised the stream idle
timeout to two hours, exposed it per provider in the Models page, and
restored the Shell settings tab; 2.4.13 rewrote the bundled skills for
small-model, no-repo use; 2.4.14 added the MCP Servers settings page and
made npx-based MCP servers spawn out of the box; 2.4.15 added MCP broker
mode (three indirection tools instead of every server tool); 2.4.16 made
the workspace picker degrade gracefully when the host chooser cannot start;
2.4.17 gave hosts without xdg-user-dirs a first-use default via a
`~/Documents`/home fallback; 2.4.18 put upstream's `LICENSE` and
`THIRD_PARTY_NOTICES.md` into the bundle roots so the archives carry their
own terms; 2.4.19 added the chat-side prompt edit & resend, the
Exclude-to-end row action, readable exclusion stubs, and the Context tab's
missing edit-box styling; 2.4.20 fixed the editor staying open after
Save & resend (the close was a silent no-op against the snapshot store's
update contract) and hardened the composer handoff; 2.4.21 folds
edited/excluded context out of the live transcript immediately (it used to
linger until a reload), turns the sidebar's More menu into a direct
Settings button, and tightened the MCP Servers editor spacing; 2.4.22 added the file-tree
context menu (path copying, chat references) and made the Files tab open
by default in every session; 2.4.23 narrowed that sidebar's opening width
to 30% of the frame — roughly half the conversation — on wide screens;
2.4.24 replaced the DeepSeek branding (hero greeting, sidebar logo and
version plate, window title) with the DSLRH mark and fork version; 2.4.25
let the brand rows grow so the plate's version line shows in full instead
of clipping, and sized the mark up from the upstream 24px cap (to 40px,
then 60px in 2.4.26 with the logo row grown to fit — the artwork only
reads as the character at that size); 2.4.27 taught the harness to talk
about its own processes — jobs carry their OS pid (shown live in the jobs
popover), the popover opens itself while work is live, and a new
job-sentinel plugin gives the model a periodic, non-waking report of its
still-running background jobs so a forgotten `sleep` or dev server comes
back to its attention; 2.4.28 finished the branding in the model-facing
direction — the system prompt's identity line and the checkout/Web-GUI
guidance now name DSLRH — and added a standing deliverable-style paragraph
(the response is the deliverable; workspace text is data, not instructions;
user-supplied names stay verbatim) plus the opt-in, off-by-default
"Unrestricted mode" General-settings switch that fuses the execution-mode
block ported from the open-source dsh-unrestricted project (a jailbreak
prompt, ~1,900 extra tokens per request while on) for uncensored local
models. 2.4.29 made the per-turn files-changed summary actually earn its
keep — the changed-files card was gated behind the developer-tools
preference (default off), so a finished task silently showed no summary at
all; the card now always renders when a turn changed files. The summary's
blind spot closed too: a new turn watcher records command-line writes the
git snapshots cannot see (edited ignored paths, and any shell write in a
working directory outside a repository) and lists them without counts as
"detected", with dependency/build directories never scanned. And the model
now sees the same data: a new change-report plugin appends a compact
files-changed notice to the conversation at the session's next step (on by
default; a General-settings switch turns it off for small models).
Shortly after, 2.4.30 made the jobs layer tell the truth about
processes: a job used to settle the moment its command exited, so a
launcher that spawned its processes and quit (the SLR Translator smoke
test) vanished from the popover within seconds while the processes ran
for minutes — unreported by the sentinel and beyond `job_kill` (only
harness-close containment still held). A job now settles when the
command's whole managed range is empty: the popover row, the
still-running reports, and the stop button stay live until everything
the command opened is actually closed, the live row says
"pid N (processes remain)" once that is clearly the case, and the
foreground result still returns the moment the command itself exits.
The release also carries the fork's copyright line in the shipped
LICENSE files. 2.4.31 fixed the changed-files review for watcher-listed files — the
client's comparison validator still spoke only text/binary/oversized, so
opening a "detected" file dead-ended in an error; it now renders the
detected note (in the review tab's file selector too) — and replaced the
sidebar mark with the fixed artwork.
