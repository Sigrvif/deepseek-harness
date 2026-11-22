# AGENTS.md — DSLRH (DeepSeek Local Runtime Harness)

DSLRH is a local fork of **DeepSeek Harness v0.2.2-alpha.2** (the pristine upstream release, branch `context-editor`) built for **offline local testing against the SLR Runtime** (an OpenAI-compatible local model server). It is not published: distribution is versioned offline 7z archives (`dsh-linux-x64-*`, `dsh-windows-x64-*`) that always carry everything done so far as a ready-to-use package. Git exists for checkpoints during development; there is no GitHub remote, no PRs, no CI.

Fork contract: [FORK.md](FORK.md) — read it before changing `packages/`. It lists every new package, every marked upstream edit (including the sandbox composition removal: DSLRH never confines commands nor touches project-folder ACLs — isolation happens outside the process), and the upstream-merge runbook. Every diff hunk in an upstream file carries a `fork(...)` marker.

**Naming:** documentation calls the project DSLRH. Package identifiers, plugin ids, and CLI names stay `@deepseek-ai/dsh-*` / upstream-shaped so an upstream merge never collides on renames. Do not rename code identifiers.

Commits: `git -c user.name=fork -c user.email=fork@local`; build **only at a clean HEAD** (a dirty tree stamps `-dirty` into the client build environment). Fork version lives in the root `package.json` `dshFork.version` and bumps whenever shipped behavior or bundle content changes.

## Upstream components and how to update them

Four upstream projects feed this fork. When one ships a meaningful update, evaluate, adopt deliberately, and re-verify — never blend silently. After any update: bump `dshFork.version`, update [FORK.md](FORK.md), `VERSION.txt` and the bundle READMEs, run the affected suites plus a full `pnpm run build` at a clean HEAD, refresh the offline bundles, wire-verify the affected feature, and repack both archives with an extraction check.

### 1. DeepSeek Harness — https://github.com/deepseek-ai/deepseek-harness

The base. The current baseline is recorded in the root `package.json` (`dshFork.base`, `dshFork.upstreamCommit`). To adopt a newer release: extract it into a fresh worktree and commit as a pristine baseline, merge/rebase resolving conflicts **only** in [FORK.md](FORK.md) §2 files (new packages never conflict), then `pnpm install`, run the fork's suites (note: upstream has ~14 pre-existing cross-file isolation failures at the baseline; run suites per package), full build, boot-check, refresh bundles, repack. The `packages/settings/settings/src/index.ts` LEGACY map and similar upstream files must keep their `fork(...)` markers through the merge.

### 2. agent-context-editor — https://github.com/jermaine123123/agent-context-editor

Behavioral ancestor of the native Context Editor. No code is used: the capability was re-implemented natively in `packages/context/context-editor` and `packages/client/ui-context-editor`, so the third-party plugin must never be installed alongside (two editors would fight over the same sessions). Update check: compare its release notes/diff against our feature set (request capture, surface edits, exclusions, condensation, request log, tools & params overrides). Adopt selectively — port behavior or UX wins into the native packages with tests; the native implementation is the product.

### 3. billion-context — https://github.com/ranxianglei/billion-context

Source of the fold semantics, growth-nudge cadence, and prompt corpus behind `packages/context/context-fold`. **MIT + attribution term** — attribution must survive in the file headers (`src/prompts.ts`), [FORK.md](FORK.md), and the Fork additions settings tab. Update check: diff its fold planning, nudge discipline, and prompts against `context-fold/src`; port deliberate improvements, keep the attribution, and re-verify with the fold suite plus a wire test (a compress call changes the next request's payload; decompress restores).

### 4. superpowers — https://github.com/obra/superpowers

Source of the seven bundled workflow skills in `packages/skill/superpowers-skills/skills` (MIT; the upstream LICENSE is kept beside them). The set was rewritten for the fork in 2.4.13 (six skills; the fifteen upstream skills were vendored verbatim before that), `test-driven-development` returned 2.4.36, and the router is `using-workflow` (renamed from `using-superpowers`, 2.4.36) — the tree is now a fork rewrite, not a vendoring. Update check: diff upstream's skill bodies against the rewrite, port deliberate improvements into the short forms, keep the stage tags (`metadata.stage`), and run the skills/bootstrap/workflow-stage suites.

## Repository layout

Upstream layout (full list: [packages/README.md](packages/README.md)): `vendor/` pinned Cordis, `packages/<group>/<pkg>/` (`@deepseek-ai/dsh-*`), `apps/`, `docs/`, `scripts/`, `.agents/` (workflows/notes), `snapshots/`.

Fork additions (all documented in [FORK.md](FORK.md) §1): `packages/context/context-editor`, `packages/context/context-fold`, `packages/skill/superpowers-skills`, `packages/skill/superpowers-bootstrap`, `packages/skill/workflow-stage`, `packages/client/ui-context-editor`, `packages/client/ui-fork-info`, `packages/client/ui-fork-auto-skills`.

## Documentation contract

[docs/dslrh/](docs/dslrh/) is the fork's user documentation set (six files, indexed by its README). It ships inside both bundles as `docs/` and is the systematic record of what the shipped package is, does, and touches — created after the sandbox incident precisely so that no "feature" ships undocumented again. Maintaining it is part of the fork contract, on par with FORK.md rows:

- Any change that alters shipped behavior, composition, data, settings, the model-facing surface, or the host/network footprint updates the matching doc file **in the same change** — a shipped change without its doc update is incomplete.
- [docs/dslrh/03-host-and-network.md](docs/dslrh/03-host-and-network.md) is exhaustive by design: every spawned process, write outside `DSH_HOME`, and reachable endpoint carries a row with its trigger and its off switch. Accuracy over reassurance — where a guard is absent, the doc says so.
- Doc claims are verified against the shipped composition, not source comments (the base patch once overstated web-fetch pinning; the docs state what is actually enforced).
- The bundle refresh copies `docs/dslrh/` into both trees as `docs/` (recipe step 5); the bundle READMEs index it and stay operational only.

## Commands

```sh
pnpm install             # pnpm workspaces, node >=24.9
pnpm run build           # the full gate graph (10 gates); run at clean HEAD
pnpm run test            # unit tests; ~14 pre-existing cross-file isolation
                         # failures exist at the baseline — run suites per package
pnpm run typecheck       # host + client aggregate checks
pnpm dsh web             # run from source (dev profiles need no key with the SLR preset)
```

The offline bundles refresh after a successful build (recipe below); the refresh tooling lives **outside** this repo in `/workspaces/devpod/DSH/bundle-tools` (`hoist-parity.py`, `swap-win32-natives.sh`, recipe in its README).

### Bundle refresh recipe

1. Commit at a clean HEAD, then `pnpm run build` (10/10 gates).
2. `pnpm --filter @deepseek-ai/dsh deploy --prod --config.auto-install-peers=true --config.node-linker=hoisted /workspaces/devpod/DSH/.deploy-hoisted` (the ignored-build warning for dsh-subprocess-local is expected).
3. `python3 hoist-parity.py` — restores vendor packages and `src/` trees the deploy misses (needs the previous bundle tree present).
4. Replace `DSLRH-Linux/app` and `DSLRH-Windows/app` with the hoisted tree; run `swap-win32-natives.sh` for the Windows tree (saved win32 natives in `/tmp/win32-natives2`).
5. Reset both `dsh-home/` to the pristine seed (extract `dsh-home/` from an earlier archive), copy `docs/dslrh/` into both trees as `docs/`, update `VERSION.txt` + bundle READMEs, bump the archive version.
6. `7za a -t7z -mx=9 dslrh-<platform>-x64-v<x.y.z>.7z DSLRH-<Platform>`, then extract each archive to a scratch dir and boot the Linux one (`./dsh web --no-open`); Windows gets structural checks (bin.js, win32 natives, CRLF launchers, node.exe).

### Wire verification

Feature claims are verified against the real bundle, not only unit tests: run a minimal fake OpenAI-compatible server on `127.0.0.1:1234` that logs every request body to a JSONL file, boot the bundle server with the launcher's environment (`SLR_RUNTIME_API_KEY=slr-local`, `DSH_BUNDLED_SKILL_DIR=<app>/node_modules/@deepseek-ai/dsh-superpowers-skills/skills`), create a session and send prompts over the wire API (`/connect?token=` then `POST /api/<ns>/<method>` with `{type:'client-request', rpcId, method, payload:{args}}`; `session/create`, `session/prompt`, `session/wait`), and read assertions from the fake's request log and the session log (`dsh-home/sessions/*/**.jsonl.zstd`, read with `zstd -dc`). For UI checks: Xvfb `:61` + the bundled LibreWolf with `--remote-debugging-port 9222` (`devtools.debugger.remote-enabled` is fork-enabled in the shipped `librewolf.cfg`) and WebDriver BiDi over `ws://127.0.0.1:9222/session`. The launcher must `mkdir -p` the `--profile` directory first: LibreWolf refuses a missing profile directory and windowed mode hides the error as a silent startup hang.

## Run relevant checks locally

Match evidence to the surface: focused behavior tests for the changed packages, the full 10-gate `pnpm run build` before claiming completion, and a wire/extract check for anything that ships. Never default to the whole test corpus; upstream CI conventions (coverage gates, snapshot projection, real-API e2e) do not run in this fork.

## Settings storage

All Settings-UI state lives in the active profile patch (`dsh-home/profiles/<profile>/cordis.patch.yml`, written atomically by the settings service; the shipped SLR preset seed lives in the same file). Stored credentials are `dsh-home/.credentials.yaml`. The user-facing reset recipe is documented in the bundle READMEs ("Resetting settings").

## Conventions

The upstream coding standards still govern every edit (condensed; the full list lives in the upstream tree this fork is based on):

- **Registrations are effects**: contributions go through `ctx.effect()` / `ctx.on()`; registries return disposers.
- **Waterfall listeners must call `next()`** to delegate; returning without it short-circuits the chain.
- **Model-visible ⟺ logged**: anything reaching a model request must be reconstructable from the session log.
- **Plugins, not loop changes**: new behavior goes on documented extension points; `agent-loop` changes require architecture-doc updates.
- **No hardcoded tunables in plugins**: deployment-varying choices are validated `Config` fields; a `DEFAULT_*` constant is not configurability. Volatile config fields (`z.<type>().default(...).volatile()`) are read per use and update live without remounting.
- **Misconfiguration fails loud**; never silently skip a missing referent.
- **Branded ids** at boundaries (`Branded<B>`), **no new `as unknown` casts**, `strict` TS with JSDoc on non-obvious exports (`@param`/ `@returns`).
- **Client UI copy is locale-owned**: typed dictionaries and `t`; the fork's own additions ship all eight languages (2.4.33; before that en + zh with English fallback).
- **Tests describe behavior**; change obsolete behavior with its tests.
- **Comments stay local**; state contracts, not reasoning transcripts.
- Files end with exactly one trailing newline; keep every `fork(...)` marker intact when touching upstream files.

## Vendoring policy

The vendored sources are pinned: vendor is [rescoped](docs/rescope.md) and `private: true`. Harness packages declare `@deepseek-ai/cordis` in `peerDependencies`/`devDependencies`. Upstream SHAs live in [vendor/README.md](vendor/README.md); update via the sync procedure there. The npm dependency `@earendil-works/pi-ai` carries a maintained pnpm patch (`patches/@earendil-works__pi-ai@1.3.0.patch`, fork extensions marked `fork(quota-reset)`); regenerate patches by editing a pristine copy and diffing — never hand-write hunks against the installed tree.

## Editing these instructions

`CLAUDE.md` symlinks `AGENTS.md` at root and in `packages/`; edit the real file. Keep each rule self-contained while linking detail docs. When the project gains a new upstream source, a new bundle artifact, or a new verification rig, document it here in the same turn — and per the documentation contract above, in `docs/dslrh/` when it changes shipped behavior.
