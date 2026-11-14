# Bundle assembly tools

Both bundles share ONE recipe: a hoisted pnpm deploy of the fork's CLI
(`@deepseek-ai/dsh`) becomes `app/` on both platforms; Windows additionally
swaps the platform-gated native packages for their proven win32
counterparts. Run everything after `pnpm run build` in
`/workspaces/devpod/DSH/dsh-fork`.

Refresh flow (identical for both platforms):

1. `pnpm --filter @deepseek-ai/dsh deploy --prod --config.auto-install-peers=true --config.node-linker=hoisted /workspaces/devpod/DSH/.deploy-hoisted`
   (the ignored-build warning for dsh-subprocess-local is expected; the
   spawn helper is prebuilt inside the tree).
2. `python3 hoist-parity.py` — the deploy misses a few vendor packages and
   the src/ trees of ./src-exporting packages; this copies them from the
   current verified bundle (which is why the previous bundle folders must
   still exist when refreshing). Verify the deploy is actually fresh before
   continuing (a silently skipped deploy step once shipped stale archives):
   check the mtime of a just-built file, e.g.
   `ls -la .deploy-hoisted/node_modules/@deepseek-ai/dsh-client-ui-context-editor/lib/client.js`
   against the workspace `lib/` copy.
3. Linux: copy `.deploy-hoisted/.` into `DSLRH-Linux/app/`, reset
   `dsh-home` to pristine (profiles/web only), boot-check
   (`./node/bin/node app/lib/bin.js web --no-open`), pack
   `7za a -t7z -mx=9 dslrh-linux-x64-v<version>.7z DSLRH-Linux`.
4. Windows: copy `.deploy-hoisted/.` into `DSLRH-Windows/app/`, run
   `./swap-win32-natives.sh` (needs the previous Windows tree as the win32
   binary source; re-fetch win32 artifacts for any native dependency that
   bumped versions upstream), point `dsh.cmd` at `app\lib\bin.js`, reset
   `dsh-home`, pack
   `7za a -t7z -mx=9 dslrh-windows-x64-v<version>.7z DSLRH-Windows`.
5. Verify: extract each archive to a scratch dir and boot it (Linux boots
   for real; Windows gets structural checks — bin.js, gated packages, CRLF
   launchers, node.exe).

The flat trees contain no symlinks, so `.7z` round-trips safely on both
platforms. Do not ship a symlinked pnpm closure via 7z — 7-Zip dereferences
the links while packing and cannot restore them on extraction (verified
broken in the 2.0.0 cycle).

## Canonical bundle sources (repo copies)

The hand-authored files of each bundle tree live in this repository, so a
checkout alone can reproduce a bundle; the trees are downstream copies:

- `bundle/launchers/` → tree root (`dsh`, `dsh-gui`, `dsh.cmd`, `dsh-gui.cmd`)
- `bundle/dsh-home-template/profiles/web/` → `dsh-home/profiles/web/`
  (the "reset to pristine" step above). The template deliberately omits
  `dsh-home/.credentials.yaml` and `dsh-home/.anonymous-user-id`: the
  harness mints both at first boot, so no secrets enter version control.
- `bundle/README.md` and `bundle/VERSION.txt` → tree root (edit the repo
  copy and re-copy into both trees together, as before).
- `LICENSE` and `THIRD_PARTY_NOTICES.md` (repo root, upstream files) → tree
  root, so every archive states its own terms (since 2.4.18).

After editing a launcher or the SLR preset patch, update the repo copy and
the two trees together.
