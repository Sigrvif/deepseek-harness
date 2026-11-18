#!/usr/bin/env python3
"""Bring the hoisted deploy up to parity with the verified symlinked tree.

The hoisted `pnpm deploy` aborts partway (ERR_PNPM_IGNORED_BUILDS after the
koffi build) and misses packages the composition needs: two vendor packages
deployed as real dirs and the src/ trees of packages whose package.json
exposes ./src exports.

fork(2.4.30): missing pieces are now taken from the WORKSPACE build output
first -- the previous behavior copied whole packages from the previous Linux
bundle, which silently shipped stale code whenever a changed package fell
into the backfill set (bash-local in 2.4.30). The previous bundle
(payload-current) remains the fallback for packages absent from the
workspace.
"""
import json
import os
import shutil

REPO = '/workspaces/devpod/DSH/dsh-fork'
CUR = '/workspaces/devpod/DSH/DSLRH-Linux/app/node_modules/@deepseek-ai'
HOI = '/workspaces/devpod/DSH/.deploy-hoisted/node_modules/@deepseek-ai'
SKIP = {'node_modules'}
COPY_ENTRIES = {'lib', 'src', 'locale', 'package.json', 'README.md', 'README.zh.md', 'README.i18n.yaml'}


def workspace_packages():
    """Map @deepseek-ai package names to their workspace directories."""
    found = {}
    for group in sorted(os.listdir(os.path.join(REPO, 'packages'))):
        gdir = os.path.join(REPO, 'packages', group)
        if not os.path.isdir(gdir):
            continue
        for entry in sorted(os.listdir(gdir)):
            manifest = os.path.join(gdir, entry, 'package.json')
            if not os.path.isfile(manifest):
                continue
            try:
                name = json.load(open(manifest, encoding='utf-8')).get('name', '')
            except OSError:
                continue
            if name.startswith('@deepseek-ai/'):
                found[name] = os.path.join(gdir, entry)
    return found


WORKSPACE = workspace_packages()


def copy_workspace_pkg(src, dst):
    """Copy a workspace package's build payload into the deploy tree."""
    os.makedirs(dst, exist_ok=True)
    for entry in sorted(os.listdir(src)):
        if entry in SKIP or entry not in COPY_ENTRIES:
            continue
        s = os.path.join(src, entry)
        d = os.path.join(dst, entry)
        if os.path.isdir(s):
            shutil.copytree(s, d, symlinks=False)
        else:
            shutil.copy2(s, d)


added = 0
added_prev = 0
# 1. Packages present in the verified tree but absent from the deploy.
for name in sorted(os.listdir(CUR)):
    dst = os.path.join(HOI, name)
    full = f'@deepseek-ai/{name}'
    if not os.path.isdir(os.path.join(CUR, name)) or os.path.isdir(dst):
        continue
    if full in WORKSPACE:
        copy_workspace_pkg(WORKSPACE[full], dst)
        print(f'added package (workspace): {name}')
        added += 1
    else:
        shutil.copytree(os.path.join(CUR, name), dst, symlinks=False, ignore=shutil.ignore_patterns(*SKIP))
        print(f'added package (previous bundle): {name}')
        added_prev += 1

patched = 0
patched_prev = 0
# 2. Root-entry parity for packages present in both: anything the verified
# tree carries (src/, locale/, extra files) that the deploy omitted. The
# workspace copy wins for entries it has, so a changed package's src/ never
# arrives stale from the previous bundle.
for name in sorted(os.listdir(CUR)):
    src_old = os.path.join(CUR, name)
    dst = os.path.join(HOI, name)
    full = f'@deepseek-ai/{name}'
    ws = WORKSPACE.get(full)
    if not os.path.isdir(src_old) or not os.path.isdir(dst):
        continue
    for entry in os.listdir(src_old):
        if entry in SKIP:
            continue
        d = os.path.join(dst, entry)
        if os.path.exists(d):
            continue
        s_ws = os.path.join(ws, entry) if ws is not None and os.path.exists(os.path.join(ws, entry)) else None
        if s_ws is not None:
            if os.path.isdir(s_ws):
                shutil.copytree(s_ws, d, symlinks=False)
            else:
                shutil.copy2(s_ws, d)
            patched += 1
        else:
            s = os.path.join(src_old, entry)
            if os.path.isdir(s):
                shutil.copytree(s, d, symlinks=False)
            else:
                shutil.copy2(s, d)
            patched_prev += 1
print(f'packages added: {added} workspace + {added_prev} previous-bundle; '
      f'root entries patched: {patched} workspace + {patched_prev} previous-bundle')
