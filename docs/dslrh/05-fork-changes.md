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
| **Bundled superpowers skills + auto-bootstrap** | Fifteen workflow skills shipped as the lowest-precedence skill root; `using-superpowers` auto-injected once per session (toggle in Settings → General) |
| **SLR Runtime preset** | Local OpenAI-compatible provider preconfigured (`127.0.0.1:1234`, placeholder key); its editor opens on start until the model id is changed from the example |
| **Quota-aware retry** | Provider usage-limit messages are parsed into exact reset times and slept through (≤6 h); request-id clock inference for providers that don't state a timezone |
| **Local-hardware timeouts** | The stream idle timeout defaults to **2 hours** (upstream: 5 min) and is a per-provider field in the Models page — a cold big-context prefill on a local runtime streams nothing until the first token, and the upstream default aborted + restarted exactly those requests; the Shell settings tab is restored (it had bound the removed sandbox executors' namespaces) |
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
restored the Shell settings tab.
