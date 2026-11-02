# 02 — The model-facing surface

Everything an LLM session can do, and everything that shapes its requests.
The executor is the native in-process one: tool calls run inside the server
process, at most **10 concurrently** per batch. (Upstream's out-of-process
script runtime — PTC — and the `workflow` tool built on it are removed in this
fork; see [05](05-fork-changes.md).)

## Tools — `standard` preset (the default)

| Tool | What the model can do | Limits / notes |
|---|---|---|
| `bash` (Linux) / `pwsh` (Windows) | Run **one arbitrary command**, unconfined, as your user | `description` required; default timeout 60 s (cap 600 s; a timeout promotes the command to a background job instead of killing it); output kept in memory to 64 KB per stream, then spilled to a temp file (64 MB cap); child env is scrubbed (below) |
| `read` / `write` / `edit` / `read_image` | Read (line-numbered), create/replace, exact-string edit files; read images into the request | Plain filesystem, no fencing: defaults are workspace-relative but absolute paths work; read caps 2000 lines / 50 KB per call; edits are version-guarded — editing a file never observed this session fails loudly |
| `glob` / `grep` | File-name patterns and content search via bundled ripgrep | 100 glob results (excess spilled to a file, not sampled); 250 grep matches; 30 s search timeout |
| `job_output` / `job_list` / `job_kill` | Manage background jobs (from `run_in_background` or timed-out commands) | 10 concurrent jobs per owner; `job_output` waits up to 30 s (cap 600 s) |
| `schedule_create` / `schedule_list` / `schedule_update` / `schedule_delete` | Persistent session reminders: deliver a prompt into the same session at a time or cadence | Stored in DSH_HOME (survives restarts); delivery only while the server runs — due tasks fire on the next launch |
| `skill` | Load a skill's full body from the catalog (below) | Catalog published every step as `<available_skills>` |
| `get_goal` / `create_goal` / `update_goal` | Drive automatic continuation rounds toward an objective | Creation requires a direct human request; blocked/goal-round caps fence runaway loops |
| `todo_write` | Replace the session todo list | Parallel in-progress allowed |
| `ask_user_question` | Blocking structured questions with options | Untimed in the web UI |
| `web_search` | DeepSeek's search API (a full auxiliary model request) | Advertised only when a `DEEPSEEK_API_KEY` credential resolves; 60 s; 1–4 queries, ≤8 results |
| `web_fetch` | Anonymous GET of any public-looking http(s) URL | See [03](03-host-and-network.md) for the exact guard list and its gap; no cookies, plain UA, same-origin redirects only, ≤5 hops, 5 MB / 100 k chars, 30 s |
| `present` | Declare up to 4 files as the turn's deliverables (cards in the UI) | Files must exist |
| `subagent` | Start an independent child agent in-process; returns immediately | Depth cap 1 (children cannot spawn grandchildren); model selectable per child |
| `subagent_fork` | One-shot fork of the parent conversation (KV-cache-friendly) | No model-selection args |
| `list_subagent_models` | List routes allowed for child selection | |
| `send_message` / `interrupt_agent` / `list_agents` | Message/stop/list continuable children | Lineage-authorized |
| `exit_plan_mode` | Submit the plan for user approval (plan mode only) | Plan-mode rules injected while active |
| `plugin_manager` | Install/enable/disable/remove plugin bundles (pnpm → npm registries) | **Live in this preset** — network capability; see [03](03-host-and-network.md). Builds scripts run only after explicit conversational approval |

Shell child processes get a scrubbed environment: anything matching
`KEY|PASSWORD|SECRET|TOKEN` (case-insensitive) and all `DSH_*` variables are
removed; `NO_COLOR`, `TERM=dumb`, `PAGER=cat` are forced. Conversely the
child receives `DSH_HOME`, `DSH_SESSION_ID`, `DSH_PROFILE`, `DSH_WEB_URL`.

### Preset differences

- **`ptc`** — same as standard; both plugin tools stay disabled. (Its PTC
  executor row is disabled by the fork — see [05](05-fork-changes.md).)
- **`cordis`** — standard plus the `cordis` inspection tool and composition
  skills; `plugin_market` (market-index browsing) also becomes live.
- **`minimal`** — persona only, images read-only, compaction, and **stateful
  shells**: a PTY terminal plus `bash`/`pwsh` variants whose state persists
  across calls (300 s timeout). No skills, web, subagents, jobs, schedule,
  goal, plan mode, or ask-user. Note: the persistent pwsh description claims
  "no internet access" — upstream text; the shell is not network-restricted.

## Slash commands

`/compact` (manual context summarization), `/goal …` (manage the session
goal), `/feedback <text>` (records feedback — see telemetry in
[03](03-host-and-network.md)), `/export` (download the session log),
`/plan [off|message]` (toggle plan mode), `/model` (UI-only model picker).

## Skills

Skill roots, highest precedence first: project `<root>/.dsh/skills` →
`<root>/.agents/skills` → runtime → preset `customSkillDirs` →
`$DSH_HOME/skills` → `~/.agents/skills` → **bundled superpowers** (lowest).
Roots are watched; catalogs update live.

The bundled set is the fifteen **superpowers 7.0.1** workflow skills
(brainstorming, test-driven-development, systematic-debugging,
writing-plans, executing-plans, subagent-driven-development,
dispatching-parallel-agents, using-git-worktrees,
requesting/receiving-code-review, verification-before-completion,
finishing-a-development-branch, writing-skills, diagnosing-superpowers,
using-superpowers), vendored verbatim (MIT) with a small adaptation file
mapping their actions to dsh's tools.

**Auto-bootstrap:** once per session, on the first prompt that doesn't
already invoke a skill, the harness injects `using-superpowers` as if the
user typed `/using-superpowers` (re-asserted once if compaction drops it).
Off switch: **Settings → General → Auto Superpowers**.

## What shapes every request (no tool calls)

| Mechanism | Effect |
|---|---|
| Persona | "You are a coding agent powered by the {{model}} model." (minimal replaces the whole prompt) |
| `AGENTS.md` pickup | Project root `AGENTS.md`/`CLAUDE.md` (+ `.local` variants) and the user-global file, within a 64 KB budget; re-read on change |
| Time context | Current timestamp + timezone each eligible step |
| Tool-result pruner | Results over 8192 chars compacted head-4096/tail-1024 |
| Compaction | Automatic summarization at ≥80 % context use; folds restore the originals |
| Spill policy | Tool results over 12.5 k tokens go to a file; the model sees a notice + path |
| Image offload | On image-budget rejection, oldest images become placeholders and the request retries |
| Repeat reminders | Nudges after 3/5/8 identical consecutive tool calls |
| Timeout policy | Per-tool deadlines (`web_fetch` 30 s, search 60 s, glob/grep 30 s) |
| Retry / quota-reset | Exponential backoff honoring `Retry-After`; a provider-named usage-window reset is slept through exactly, up to 6 h (fork addition) |
| Session title | **One extra model request per session** (first prompt) — routed to the session's own provider, i.e. your local server |
| Plan mode | Rules injected only while active; tool catalog unchanged for cache stability |
| Goal driver | Automatic continuation rounds while a goal is active |
| Context Editor / Fold | Fork additions: request capture + surface edits/exclusions/overrides; model-driven reversible folds (`compress`/`decompress`/`search_context`/`acp_status`) — see [05](05-fork-changes.md) |
