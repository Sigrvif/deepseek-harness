#!/usr/bin/env python3
"""Bring the hoisted deploy up to parity with the verified symlinked tree.

The hoisted `pnpm deploy` misses the same pieces the legacy recipe patched by
hand: two vendor packages deployed as real dirs and the src/ trees of
packages whose package.json exposes ./src exports. Copy them in from the
current verified Linux bundle (payload-current at the same build commit).
"""
import os
import shutil
import sys

CUR = '/workspaces/devpod/DSH/DSLRH-Linux/app/node_modules/@deepseek-ai'
HOI = '/workspaces/devpod/DSH/.deploy-hoisted/node_modules/@deepseek-ai'
SKIP = {'node_modules'}

# 1. Packages present in the verified tree but absent from the deploy.
added = 0
for name in sorted(os.listdir(CUR)):
    src = os.path.join(CUR, name)
    dst = os.path.join(HOI, name)
    if not os.path.isdir(src) or os.path.isdir(dst):
        continue
    shutil.copytree(src, dst, symlinks=False, ignore=shutil.ignore_patterns(*SKIP))
    print(f'added package: {name}')
    added += 1

# 2. Root-entry parity for packages present in both: anything the verified
# tree carries (src/, locale/, extra files) that the deploy omitted.
patched = 0
for name in sorted(os.listdir(CUR)):
    src = os.path.join(CUR, name)
    dst = os.path.join(HOI, name)
    if not os.path.isdir(src) or not os.path.isdir(dst):
        continue
    for entry in os.listdir(src):
        if entry in SKIP:
            continue
        s = os.path.join(src, entry)
        d = os.path.join(dst, entry)
        if os.path.exists(d):
            continue
        if os.path.isdir(s):
            shutil.copytree(s, d, symlinks=False)
        else:
            shutil.copy2(s, d)
        patched += 1
print(f'packages added: {added}, root entries patched: {patched}')
