#!/bin/bash
# Swap the Linux-gated native packages in a freshly deployed (hoisted) app
# tree for the proven win32 counterparts, and drop the Linux ones. Run AFTER
# copying the hoisted deploy into DSLRH-Windows/app, with the previous
# Windows tree still present as the source of the win32 binaries.
set -e
# ${1:-} = source of the win32 binaries (a dir mirroring node_modules,
# e.g. the /tmp copy saved before replacing app/); defaults to the previous
# bundle tree when it still exists.
SRC="${1:-/workspaces/devpod/DSH/DSLRH-Windows/app/node_modules}"
DST="/workspaces/devpod/DSH/DSLRH-Windows/app/node_modules"
for p in "@img/sharp-win32-x64" "@img/colour" "@koromix/koffi-win32-x64" \
         "@vscode/ripgrep-win32-x64" "sherpa-onnx-win-x64" \
         "node-addon-require-builtin-win32-x64-msvc"; do
  cp -a "$SRC/$p" "$DST/$p"
done
for p in "@img/sharp-linux-x64" "@img/sharp-libvips-linux-x64" \
         "@koromix/koffi-linux-x64" "@vscode/ripgrep-linux-x64" \
         "sherpa-onnx-linux-x64" "node-addon-require-builtin-linux-x64-gnu" \
         "@deepseek-ai/node-addon-system-linux-x64"; do
  rm -rf "$DST/$p"
done
echo "win32 natives in place; Linux natives removed"
