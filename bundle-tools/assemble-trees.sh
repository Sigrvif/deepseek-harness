#!/bin/bash
# Assemble both DSLRH bundle trees from their canonical sources, verify each
# one, and only then let them replace the previous trees.
#
#   assemble-trees.sh [all|windows|linux]        (default all)
#
# Sources, each overridable through the environment:
#   DEPLOY        the hoisted pnpm deploy of @deepseek-ai/dsh with
#                 hoist-parity.py already applied
#   OUT           directory that holds the trees
#   LINUX_BASE    tree supplying node/, browser/ and examples/ for Linux
#   WINDOWS_BASE  tree supplying node/, browser/ and examples/ for Windows
#   WIN32_SRC     node_modules holding the win32 natives (the previous
#                 Windows tree)
# Everything else is a file of this repository.
#
# Windows is assembled first: its native swap reads the win32 binaries from
# the previous Windows tree, so that tree must still be in place. Neither
# tree is replaced until every requested tree has passed verify-trees.sh.
#
# Do not assemble a tree by hand. The 2.4.36 trees were, and shipped a dead
# Windows GUI launcher, a profile one directory level too high on both
# platforms, and a scratch script out of the deploy directory.
set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd -- "$HERE/.." && pwd)"
WHICH="${1:-all}"
case "$WHICH" in all|windows|linux) ;; *) echo "assemble-trees: expected all, windows or linux, got '$WHICH'" >&2; exit 2 ;; esac

OUT="${OUT:-/workspaces/devpod/DSH}"
DEPLOY="${DEPLOY:-$OUT/.deploy-hoisted}"
LINUX_BASE="${LINUX_BASE:-$OUT/dsh-linux-x64/DSLRH-Linux}"
WINDOWS_BASE="${WINDOWS_BASE:-$OUT/dsh-windows-x64}"
WIN32_SRC="${WIN32_SRC:-$OUT/DSLRH-Windows/app/node_modules}"
STAGING="$OUT/.staging"
VERSION="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["dshFork"]["version"])' "$REPO/package.json")"

[ -f "$DEPLOY/lib/bin.js" ] || { echo "assemble-trees: $DEPLOY is not a dsh deploy (no lib/bin.js)" >&2; exit 1; }

# The fork's one LibreWolf change. The Linux base carries it already; the
# pristine upstream Windows bundle ships the preference as false. A no-op
# when it is already applied; verify-trees.sh is what proves it landed.
patch_librewolf_cfg() {
  sed -i 's|^pref("devtools.debugger.remote-enabled", false); // default, but subject to branding so keep it$|pref("devtools.debugger.remote-enabled", true); // fork(local-test): the automation rig drives this browser over WebDriver BiDi|' "$1"
}

assemble() {
  local platform="$1" stage="$2" base="$3" f
  [ -d "$base/node" ] && [ -d "$base/browser" ] && [ -d "$base/examples" ] \
    || { echo "assemble-trees: $base does not hold node/, browser/ and examples/" >&2; exit 1; }
  echo "==> assembling $stage ($platform)"
  rm -rf "$stage"
  mkdir -p "$stage/app" "$stage/dsh-home/profiles/web" "$stage/examples"

  # The program: the deploy, and nothing else from its directory.
  cp -a "$DEPLOY/." "$stage/app/"

  # Runtime and browser come from the base trees; the GUI launcher is the
  # repository's (it accepts this deploy's app/lib/bin.js entry).
  cp -a "$base/node" "$base/browser" "$stage/"
  cp -a "$base/examples/." "$stage/examples/"
  cp "$REPO/bundle/browser/gui-launcher.js" "$stage/browser/gui-launcher.js"
  case "$platform" in
    linux) patch_librewolf_cfg "$stage/browser/librewolf/usr/bin/librewolf.cfg" ;;
    windows) patch_librewolf_cfg "$stage/browser/librewolf/LibreWolf/librewolf.cfg" ;;
  esac

  # The shipped home sits at the template's own depth: dsh reads a
  # cordis.patch.yml at the TOP of dsh-home as a layer that outranks the
  # profile's own patch.
  cp -a "$REPO/bundle/dsh-home-template/profiles/web/." "$stage/dsh-home/profiles/web/"

  cp "$REPO/bundle/README.md" "$REPO/bundle/VERSION.txt" "$REPO/LICENSE" "$REPO/THIRD_PARTY_NOTICES.md" "$stage/"
  rm -rf "$stage/docs"; cp -a "$REPO/docs" "$stage/docs"

  if [ "$platform" = linux ]; then
    for f in dsh dsh-gui; do
      cp "$REPO/bundle/launchers/$f" "$stage/$f"
      chmod +x "$stage/$f"
    done
  else
    # cmd.exe needs CRLF whatever the checkout's line endings are.
    for f in dsh.cmd dsh-gui.cmd; do
      tr -d '\r' < "$REPO/bundle/launchers/$f" | sed 's/$/\r/' > "$stage/$f"
    done
    bash "$HERE/swap-win32-natives.sh" "$WIN32_SRC" "$stage/app/node_modules"
  fi

  bash "$HERE/verify-trees.sh" "$stage" "$platform" "$VERSION"
}

mkdir -p "$STAGING"
case "$WHICH" in
  all) assemble windows "$STAGING/DSLRH-Windows" "$WINDOWS_BASE"; assemble linux "$STAGING/DSLRH-Linux" "$LINUX_BASE" ;;
  windows) assemble windows "$STAGING/DSLRH-Windows" "$WINDOWS_BASE" ;;
  linux) assemble linux "$STAGING/DSLRH-Linux" "$LINUX_BASE" ;;
esac

# Everything requested passed: swap the trees in. The previous ones go under
# .staging first so a failed move leaves them in place.
for name in $(ls -d "$STAGING"/DSLRH-* | xargs -n1 basename); do
  if [ -d "$OUT/$name" ]; then mv "$OUT/$name" "$STAGING/previous-$name"; fi
  mv "$STAGING/$name" "$OUT/$name"
  echo "==> $OUT/$name replaced"
done
rm -rf "$STAGING"
echo "assemble-trees: done (next: smoke-linux.sh on DSLRH-Linux, then pack)"
