# Bundle assembly tools

Both bundles share ONE recipe: a hoisted pnpm deploy of the fork's CLI
(`@deepseek-ai/dsh`) becomes `app/` on both platforms; Windows additionally
swaps the platform-gated native packages for their proven win32
counterparts. The trees are assembled and checked by the scripts in this
directory. Run everything after `pnpm run build` in
`/workspaces/devpod/DSH/dsh-fork`.

**Do not assemble a tree by hand, and do not rebuild one from the pristine
upstream bundles.** The 2.4.36 trees were, and shipped a Windows GUI
launcher that exited before the server started, the profile files one
directory level too high on both platforms (which silently undid settings
changes), and a scratch script out of the deploy directory. Nothing looked,
because the recipe lived only in this page and in memory.

Refresh flow:

1. `pnpm --filter @deepseek-ai/dsh deploy --prod --config.auto-install-peers=true --config.node-linker=hoisted /workspaces/devpod/DSH/.deploy-hoisted`
   (the ignored-build warning for dsh-subprocess-local is expected; the
   spawn helper is prebuilt inside the tree). Keep scratch files out of
   `.deploy-hoisted` — everything in it ships as `app/`.
2. `python3 hoist-parity.py` — the deploy aborts partway (ERR_PNPM_IGNORED
   after ~325 of 352 fork packages; the abort is chronic and benign) and
   misses packages plus the src/ trees of ./src-exporting packages. Since
   2.4.30 the script backfills from the WORKSPACE build output first, so a
   changed package never ships stale; the previous Linux bundle
   (`DSLRH-Linux`, still in place at this step) remains the fallback for
   packages absent from the workspace (vendored natives). Verify freshness
   anyway before continuing — grep a marker of each changed package in
   `.deploy-hoisted` (the 2.4.30 cycle shipped a stale bash-local because
   the old script backfilled it from the 2.4.29 bundle).
3. `./assemble-trees.sh` — builds both trees in
   `/workspaces/devpod/DSH/.staging/`, runs `verify-trees.sh` on each, and
   only then replaces `DSLRH-Linux/` and `DSLRH-Windows/`. Windows goes
   first: its native swap reads the win32 binaries from the previous Windows
   tree, so that tree must still be in place.
4. `./smoke-linux.sh /workspaces/devpod/DSH/DSLRH-Linux` — boots the tree
   through its own `./dsh-gui` and checks that settings land where they take
   effect.
5. Pack: `7za a -t7z -mx=9 dslrh-linux-x64-v<version>.7z DSLRH-Linux` and the
   same for `dslrh-windows-x64-v<version>.7z DSLRH-Windows`.
6. Verify the archives, not just the trees: extract each to a scratch
   directory and run `verify-trees.sh` on the extracted folder (Linux also
   gets `smoke-linux.sh`). This host cannot execute Windows; the Windows
   checks are structural plus the byte-identity of `browser/gui-launcher.js`
   with the repository copy — the file the 2.4.36 archive got wrong.

## What the scripts check

`verify-trees.sh <tree> <linux|windows> [version]` is read-only and runs
every check:

- the launch chain, file by file: `app/lib/bin.js`, the runtime, both
  launchers, `browser/gui-launcher.js`, the bundled browser — and that the
  GUI launcher accepts the deploy entry and is the repository's copy;
- the bundled skills root the launchers export;
- `librewolf.cfg` keeps the fork's `devtools.debugger.remote-enabled` line;
- `dsh-home` is exactly the shipped template: `dsh-home/profiles/web/*` and
  nothing else. dsh reads a `cordis.patch.yml` at the **top** of `dsh-home`
  as a home-level patch that outranks the profile's own, so profile files
  one level too high undo settings changes (the 2.4.36 defect);
- launchers in the line-ending form each shell needs, and executable where
  that applies;
- exactly this platform's native modules, none of the other platform's, and
  no package copied into itself;
- no symlinks except pnpm's POSIX `node_modules/.bin` shims, which 7-Zip
  dereferences into plain files;
- `app/` holds only the deployed package, and the root carries README,
  VERSION, licences, examples and `docs/`;
- `VERSION.txt` names the expected version (the repository's
  `dshFork.version` when run from `assemble-trees.sh`).

`smoke-linux.sh <tree>` copies the tree's `dsh-home` to a scratch directory
and runs the real `./dsh-gui` with a stub browser: the server must report
its token URL, the UI must load over it, and the launcher must stop the
server and exit cleanly when the "window" closes. It then changes the
default model in the profile layer — what the Settings UI does — and reads
it back from `--dump-config`: the change must be the effective one.

## Canonical bundle sources (repo copies)

The hand-authored files of each bundle tree live in this repository, so a
checkout alone can reproduce a bundle; the trees are downstream copies:

- `bundle/launchers/` → tree root (`dsh`, `dsh-gui`, `dsh.cmd`, `dsh-gui.cmd`)
- `bundle/browser/gui-launcher.js` → `browser/gui-launcher.js`. The fork's
  copy accepts the deploy closure's `app/lib/bin.js` (the npm-tree layout
  stays as the fallback), mirrors `gui.log` to the console, and on Windows
  waits until no LibreWolf process holds the profile before stopping the
  server. The pristine upstream bundles carry the unpatched file, which
  knows only `app/node_modules/@deepseek-ai/dsh/lib/bin.js`; both platforms
  ship this same file.
- `bundle/dsh-home-template/profiles/web/` → `dsh-home/profiles/web/`
  (this is the "reset to pristine" step). The template deliberately omits
  `dsh-home/.credentials.yaml` and `dsh-home/.anonymous-user-id`: the
  harness mints both at first boot, so no secrets enter version control.
- `bundle/README.md` and `bundle/VERSION.txt` → tree root (edit the repo
  copy and re-copy into both trees together, as before).
- `LICENSE` and `THIRD_PARTY_NOTICES.md` (repo root, upstream files) → tree
  root, so every archive states its own terms (since 2.4.18).
- `docs/` → tree root.

After editing a launcher or the SLR preset patch, update the repo copy; the
next `assemble-trees.sh` carries it into both trees.

## Sources that are not in the repository

- `node/`, `browser/` and `examples/` come from the two base trees next to
  the bundles: `dsh-linux-x64/DSLRH-Linux` (Linux) and `dsh-windows-x64`
  (Windows) — Node.js v24.22.1, LibreWolf 158.0.1-2 and the SLR example
  patch. `assemble-trees.sh` overlays `gui-launcher.js` from the repository
  and applies the one-line `librewolf.cfg` change; the Linux base already
  carries both, the pristine Windows base carries neither.
- The win32 natives come from the previous Windows tree
  (`DSLRH-Windows/app/node_modules`). Re-fetch the win32 artifact for any
  native dependency that bumped versions upstream; `swap-win32-natives.sh`
  refuses to run when a source package is missing.

The flat trees contain no package-directory symlinks, so `.7z` round-trips
safely on both platforms. Do not ship a symlinked pnpm closure via 7z — 7-Zip
dereferences the links while packing and cannot restore them on extraction
(verified broken in the 2.0.0 cycle).
