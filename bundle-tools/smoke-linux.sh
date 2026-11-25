#!/bin/bash
# Boot a Linux bundle tree the way a user does, and check what a structural
# check cannot: that the launch chain serves the UI, and that a settings
# change written to the profile layer is the one that takes effect.
#
#   smoke-linux.sh <tree-dir>
#
# The tree's own ./dsh-gui starts the server and hands the token URL to the
# "browser" -- a stub here, which loads that URL and exits as a closed window
# would; the launcher then has to stop the server and exit cleanly. The
# shipped dsh-home is copied to a scratch directory first: the tree itself is
# not modified, so this runs on a freshly extracted archive. Windows cannot
# execute on this host; verify-trees.sh is its check.
set -euo pipefail

TREE="$(cd -- "${1:?usage: smoke-linux.sh <tree-dir>}" && pwd)"
SCRATCH="$(mktemp -d /tmp/dslrh-smoke-XXXXXX)"
PORT="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
STUB="$SCRATCH/stub-browser.sh"
SERVER_PATTERN="$TREE/app/lib/bin.js web --no-open --port $PORT"
export STUB_ARGS="$SCRATCH/browser-args.txt" STUB_CODE="$SCRATCH/browser-http.txt"

failures=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
cleanup() {
  # Only a server this run started: the pattern carries this run's port.
  for pid in $(pgrep -f -- "$SERVER_PATTERN" || true); do kill "$pid" 2>/dev/null || true; done
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

cat > "$STUB" <<'EOF'
#!/bin/bash
# Stands in for the bundled browser: records the launch arguments, loads the
# URL the server handed over, then exits as a closed window would. The token
# URL answers with a redirect that relies on the cookie it sets, so keep a
# cookie jar like a browser would.
printf '%s\n' "$@" > "$STUB_ARGS"
url="${*: -1}"
code="$(curl -s -L -c "$STUB_JAR" -b "$STUB_JAR" -o /dev/null -w '%{http_code}' --max-time 60 "$url" || true)"
printf '%s\n' "${code:-000}" > "$STUB_CODE"
sleep 2
EOF
chmod +x "$STUB"
cp -a "$TREE/dsh-home" "$SCRATCH/home"

# ---- the windowed launcher, end to end --------------------------------
set +e
DSH_HOME="$SCRATCH/home" DSH_GUI_BROWSER="$STUB" STUB_JAR="$SCRATCH/cookies.txt" \
  timeout 120 "$TREE/dsh-gui" --port "$PORT" > "$SCRATCH/launcher.out" 2>&1
status=$?
set -e

if [ "$status" -eq 0 ]; then pass "./dsh-gui exits cleanly once the browser window is closed"
else fail "./dsh-gui exited with status $status (124 = it never finished)"; fi
if grep -q "dsh web: http://127.0.0.1:$PORT/" "$SCRATCH/home/gui.log" 2>/dev/null; then pass "the server reported its token URL to the launcher"
else fail "the server never reported its token URL (gui.log)"; fi
code="$(cat "$STUB_CODE" 2>/dev/null || true)"
if [ "$code" = 200 ]; then pass "the UI loads over the token URL (HTTP 200)"
else fail "the UI did not load over the token URL (HTTP ${code:-none})"; fi
if grep -q "dsh-gui error" "$SCRATCH/launcher.out"; then fail "the launcher logged: $(grep -m1 'dsh-gui error' "$SCRATCH/launcher.out")"
else pass "the launcher logged no error"; fi
sleep 1
if pgrep -f -- "$SERVER_PATTERN" > /dev/null; then fail "the server outlived the launcher"
else pass "the server stopped with the launcher"; fi

# ---- settings land where they take effect ------------------------------
# dsh reads dsh-home/cordis.patch.yml (the TOP of the home) as a layer that
# outranks the profile's own patch, so the shipped profile must live under
# dsh-home/profiles/web/ and nothing may sit at the top.
if [ -e "$SCRATCH/home/cordis.patch.yml" ]; then fail "dsh-home/cordis.patch.yml exists: it outranks every profile-layer setting"
else pass "no patch file at the top of dsh-home"; fi
dump() { DSH_HOME="$SCRATCH/home" "$TREE/node/bin/node" "$TREE/app/lib/bin.js" --profile web --dump-config 2> "$SCRATCH/dump.err"; }
dump > "$SCRATCH/before.yml"
if grep -q "provider: slr-runtime" "$SCRATCH/before.yml"; then pass "the shipped SLR Runtime provider is configured"
else fail "the shipped SLR Runtime provider is not in the effective config"; fi

# What the Settings UI does when the user picks another default model.
sed -i '/^- id: agent-default-model$/,/^- id:/{s|^[[:space:]]*model: .*$|    model: USER-PICKED.gguf|}' \
  "$SCRATCH/home/profiles/web/cordis.patch.yml"
dump > "$SCRATCH/after.yml"
if grep -A6 '^- id: agent-default-model$' "$SCRATCH/after.yml" | grep -q "model: USER-PICKED.gguf"; then
  pass "a default-model change in the profile layer is the effective one"
else
  fail "the profile-layer default model was overridden -- effective: $(grep -A6 '^- id: agent-default-model$' "$SCRATCH/after.yml" | grep 'model:' | head -1)"
fi

if [ "$failures" -eq 0 ]; then echo "smoke-linux: $TREE passed every check"
else echo "smoke-linux: $TREE FAILED $failures check(s)" >&2; fi
exit "$((failures > 0))"
