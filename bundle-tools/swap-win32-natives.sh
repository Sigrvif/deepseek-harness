#!/bin/bash
# Swap the Linux-gated native packages in a freshly deployed (hoisted) app
# tree for the proven win32 counterparts, and drop the Linux ones.
#
#   swap-win32-natives.sh [source] [destination]
#
# source       node_modules holding the win32 binaries. The default is the
#              previous Windows tree, which is why that tree has to stay in
#              place until the new one is assembled.
# destination  node_modules of the tree being assembled. The default is the
#              Windows tree itself; assemble-trees.sh passes its staging tree.
#
# Each destination package is removed first, so a copy can never land inside
# a copy of itself. @img/colour is deliberately absent from the list: it is
# platform-neutral JavaScript the deploy already ships, and copying it over
# the existing directory nested one more copy per release (20 deep in the
# 2.4.36 Windows tree).
set -e
SRC="${1:-/workspaces/devpod/DSH/DSLRH-Windows/app/node_modules}"
DST="${2:-/workspaces/devpod/DSH/DSLRH-Windows/app/node_modules}"
for p in "@img/sharp-win32-x64" "@koromix/koffi-win32-x64" \
         "@vscode/ripgrep-win32-x64" "sherpa-onnx-win-x64" \
         "node-addon-require-builtin-win32-x64-msvc"; do
  [ -d "$SRC/$p" ] || { echo "swap-win32-natives: $SRC/$p not found -- re-fetch the win32 artifact for $p" >&2; exit 1; }
  rm -rf "$DST/$p"
  cp -a "$SRC/$p" "$DST/$p"
done
for p in "@img/sharp-linux-x64" "@img/sharp-libvips-linux-x64" \
         "@koromix/koffi-linux-x64" "@vscode/ripgrep-linux-x64" \
         "sherpa-onnx-linux-x64" "node-addon-require-builtin-linux-x64-gnu" \
         "@deepseek-ai/node-addon-system-linux-x64"; do
  rm -rf "$DST/$p"
done
echo "win32 natives in place; Linux natives removed"
