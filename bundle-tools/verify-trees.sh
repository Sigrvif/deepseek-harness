#!/bin/bash
# Verify a DSLRH bundle tree against what its launchers actually resolve.
#
#   verify-trees.sh <tree-dir> <linux|windows> [expected-version]
#
# Read-only: run it on an assembled staging tree and again on a freshly
# extracted archive. Every check runs; the exit status is non-zero if any
# failed, and each failure names what is wrong. A tree that passes still has
# to boot (smoke-linux.sh does that where the host can); this is the floor
# that the 2.4.36 trees fell through — an unpatched GUI launcher and a
# misplaced profile shipped because nothing looked.
set -u

TREE="${1:?usage: verify-trees.sh <tree-dir> <linux|windows> [expected-version]}"
PLATFORM="${2:?usage: verify-trees.sh <tree-dir> <linux|windows> [expected-version]}"
WANT_VERSION="${3:-}"
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd -- "$HERE/.." && pwd)"
TEMPLATE="$REPO/bundle/dsh-home-template"
NM="$TREE/app/node_modules"

failures=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }

# exists <label> <path relative to the tree>
exists() {
  if [ -e "$TREE/$2" ]; then pass "$1"; else fail "$1 -- missing $2"; fi
}

# contains <label> <file relative to the tree> <fixed string>
contains() {
  if [ -f "$TREE/$2" ] && grep -qF -- "$3" "$TREE/$2"; then pass "$1"
  else fail "$1 -- $2 does not contain: $3"; fi
}

# packages <label> <directory|absent> <package>...
packages() {
  local label="$1" want="$2" bad="" p
  shift 2
  for p in "$@"; do
    case "$want" in
      directory) [ -d "$NM/$p" ] || bad="$bad $p" ;;
      absent) [ -e "$NM/$p" ] && bad="$bad $p" ;;
    esac
  done
  if [ -z "$bad" ]; then pass "$label"; else fail "$label --$bad"; fi
}

case "$PLATFORM" in
  linux)
    LAUNCHERS="dsh dsh-gui"
    NODE="node/bin/node"
    BROWSER_BIN="browser/librewolf/AppRun"
    CFG="browser/librewolf/usr/bin/librewolf.cfg"
    OWN_NATIVES="@img/sharp-linux-x64 @img/sharp-libvips-linux-x64 @koromix/koffi-linux-x64 @vscode/ripgrep-linux-x64 sherpa-onnx-linux-x64 node-addon-require-builtin-linux-x64-gnu @deepseek-ai/node-addon-system-linux-x64"
    OTHER_NATIVES="@img/sharp-win32-x64 @koromix/koffi-win32-x64 @vscode/ripgrep-win32-x64 sherpa-onnx-win-x64 node-addon-require-builtin-win32-x64-msvc"
    ;;
  windows)
    LAUNCHERS="dsh.cmd dsh-gui.cmd"
    NODE="node/node.exe"
    BROWSER_BIN="browser/librewolf/LibreWolf/librewolf.exe"
    CFG="browser/librewolf/LibreWolf/librewolf.cfg"
    OWN_NATIVES="@img/sharp-win32-x64 @img/colour @koromix/koffi-win32-x64 @vscode/ripgrep-win32-x64 sherpa-onnx-win-x64 node-addon-require-builtin-win32-x64-msvc"
    OTHER_NATIVES="@img/sharp-linux-x64 @img/sharp-libvips-linux-x64 @koromix/koffi-linux-x64 @vscode/ripgrep-linux-x64 sherpa-onnx-linux-x64 node-addon-require-builtin-linux-x64-gnu @deepseek-ai/node-addon-system-linux-x64"
    ;;
  *) echo "verify-trees: unknown platform '$PLATFORM' (expected linux or windows)" >&2; exit 2 ;;
esac

# The launch chain, file by file: each launcher's entry, and the entry the
# GUI launcher hands the server.
exists "deploy entry app/lib/bin.js" app/lib/bin.js
exists "runtime $NODE" "$NODE"
exists "browser launcher browser/gui-launcher.js" browser/gui-launcher.js
exists "bundled browser $BROWSER_BIN" "$BROWSER_BIN"
contains "gui-launcher.js accepts the deploy entry app/lib/bin.js" \
  browser/gui-launcher.js "path.join(bundleRoot, 'app', 'lib', 'bin.js')"
if [ -f "$REPO/bundle/browser/gui-launcher.js" ]; then
  if cmp -s "$REPO/bundle/browser/gui-launcher.js" "$TREE/browser/gui-launcher.js"; then
    pass "gui-launcher.js is the repository copy (bundle/browser/gui-launcher.js)"
  else
    fail "browser/gui-launcher.js differs from bundle/browser/gui-launcher.js"
  fi
fi
# The launchers export this as the bundled skill root.
if [ -n "$(ls -A "$NM/@deepseek-ai/dsh-superpowers-skills/skills" 2>/dev/null)" ]; then
  pass "bundled skills root is present"
else
  fail "bundled skills root is missing or empty: app/node_modules/@deepseek-ai/dsh-superpowers-skills/skills"
fi

# The fork's one LibreWolf change; the pristine upstream Windows bundle
# ships the line as false.
contains "librewolf.cfg keeps the fork devtools line" "$CFG" \
  'pref("devtools.debugger.remote-enabled", true); // fork(local-test)'

# The shipped home is the template, at the template's depth. dsh reads a
# cordis.patch.yml at the TOP of dsh-home as a home-level patch that
# outranks the profile's own, so profile files one level too high silently
# undo settings changes (2.4.36).
if [ -d "$TEMPLATE" ] && [ -d "$TREE/dsh-home" ]; then
  if diff -r "$TEMPLATE" "$TREE/dsh-home" > /dev/null 2>&1; then
    pass "dsh-home is the shipped template (profiles/web only, no secrets)"
  else
    fail "dsh-home is not the shipped template (expected exactly dsh-home/profiles/web/*):"
    diff -r -q "$TEMPLATE" "$TREE/dsh-home" 2>&1 | sed 's/^/        /'
  fi
elif [ ! -d "$TREE/dsh-home/profiles/web" ]; then
  fail "dsh-home/profiles/web is missing"
fi

# What ships beside the program.
for f in README.md VERSION.txt LICENSE THIRD_PARTY_NOTICES.md examples/slr-runtime-provider.patch.yml; do
  exists "ships $f" "$f"
done
if [ -d "$TREE/docs" ] && [ -n "$(ls -A "$TREE/docs")" ]; then pass "ships docs/"
else fail "docs/ is missing or empty"; fi
if [ -n "$WANT_VERSION" ]; then
  contains "VERSION.txt names package $WANT_VERSION" VERSION.txt "package $WANT_VERSION ("
fi

# Launchers: the files cmd.exe and bash need, in the line-ending form each
# one requires.
if [ "$PLATFORM" = windows ]; then
  for f in $LAUNCHERS; do
    if [ ! -f "$TREE/$f" ]; then fail "$f is missing"
    elif LC_ALL=C grep -q $'[^\r]$' "$TREE/$f"; then fail "$f has a line without CRLF"
    else pass "$f is CRLF"; fi
  done
else
  for f in $LAUNCHERS; do
    if [ ! -f "$TREE/$f" ]; then fail "$f is missing"
    elif grep -q $'\r' "$TREE/$f"; then fail "$f contains CR"
    elif [ ! -x "$TREE/$f" ]; then fail "$f is not executable"
    else pass "$f is LF and executable"; fi
  done
fi

# Native modules: exactly this platform's set (swap-win32-natives.sh's lists).
packages "this platform's native modules are present" directory $OWN_NATIVES
packages "no native module of the other platform ships" absent $OTHER_NATIVES

# 7z cannot restore symlinks, so no package directory may be one. The one
# kind of link a deploy does contain is pnpm's POSIX .bin shims; 7z turns
# them into plain files, as every release has shipped.
links="$(find "$TREE" -type l 2>/dev/null | grep -v '/node_modules/\.bin/' || true)"
if [ -z "$links" ]; then pass "no symlinks outside node_modules/.bin shims"
else fail "symlinks outside node_modules/.bin (a linked package closure cannot be packed):"; echo "$links" | sed 's/^/        /'; fi

# No package copied into itself: cp -a of a package over a directory that
# already exists nests a copy (the Windows swap did this to @img/colour once
# per release).
nested=""
for p in "@img/sharp-win32-x64" "@img/colour" "@koromix/koffi-win32-x64" "@vscode/ripgrep-win32-x64" \
         "sherpa-onnx-win-x64" "node-addon-require-builtin-win32-x64-msvc"; do
  [ -d "$NM/$p/$(basename "$p")" ] && nested="$nested $p/$(basename "$p")"
done
if [ -z "$nested" ]; then pass "no native package is nested inside itself"; else fail "package copied into itself:$nested"; fi

# app/ holds the deployed CLI package and nothing else: a scratch file left
# in the deploy directory ships verbatim (2.4.36 carried app/probe/).
stray=""
while IFS= read -r name; do
  case "$name" in
    lib|node_modules|package.json|pnpm-lock.yaml|pnpm-workspace.yaml|README.*|LICENSE) ;;
    *) stray="$stray $name" ;;
  esac
done < <(ls -A "$TREE/app" 2>/dev/null)
if [ -z "$stray" ]; then pass "app/ holds only the deployed package"; else fail "stray entries in app/:$stray"; fi

if [ "$failures" -eq 0 ]; then
  echo "verify-trees: $TREE ($PLATFORM) passed every check"
else
  echo "verify-trees: $TREE ($PLATFORM) FAILED $failures check(s)" >&2
fi
exit "$((failures > 0))"
