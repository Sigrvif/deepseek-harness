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
| **MCP Servers settings page** (2.4.14) | Upstream's MCP client (`dsh-mcp-client`, shipped and functional) was configurable only by hand-editing the profile patch, where the natural first attempt — a bare top-level row instead of the required `- insert:` block — is **silently ignored**. The fork adds `dsh-mcp-manager` (a storage-domain-backed supervisor that mounts each enabled definition as its own `dsh-mcp-client` fiber — the pattern ACP uses for session servers) and a **Settings → MCP Servers** page (`dsh-client-ui-settings-mcp` over the `mcpManager` remote): add/edit/enable/disable/restart stdio or HTTP servers live, definitions persist in `$DSH_HOME/storages/mcp_servers/`, per-server status and failure reasons are visible, and manual profile rows keep working beside page-managed ones. The launchers now put the bundled `node/bin` on `PATH`, so `npx`-based servers (camofox) spawn without a system Node install. Recipes in the bundle READMEs (camofox, x64dbg-automate) |
| **Local-test UI defaults** | Dark theme; DeepSeek routes sorted last and dormant until keyed; the version row names the fork package; a "Fork additions" settings tab |
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
mode (three indirection tools instead of every server tool).
