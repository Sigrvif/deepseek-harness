# DSLRH documentation

This folder is the systematic documentation of the DSLRH package (DeepSeek Local Runtime Harness): what it is, what the model can do through it, what it does to the machine it runs on, where its data lives, and exactly how it differs from upstream DeepSeek Harness.

It exists because the package's settings alone do not tell the whole story — the command sandbox that upstream quietly wrote into Windows project folders in early versions was found the hard way. Every file below was written from a full source audit of the shipped composition (v2.4.7) and is kept current with it: when behavior changes, the matching file changes in the same release.

| File | Answers |
|---|---|
| [01-what-it-is.md](01-what-it-is.md) | What are the pieces, how does it boot, what is a profile/preset/patch layer, who can connect? |
| [02-model-surface.md](02-model-surface.md) | Which tools, slash commands, and skills can the model use, and what shapes every request? |
| [03-host-and-network.md](03-host-and-network.md) | Which processes run, which files are written outside the package, which network endpoints are reachable — and what guards exist? |
| [04-data-and-settings.md](04-data-and-settings.md) | Where is everything stored, what does each settings toggle do, which environment variables are read? |
| [05-fork-changes.md](05-fork-changes.md) | Every deliberate difference from upstream, why it exists, and the known limitations. |

The top-level [README](../../README.md) stays operational: starting, connecting to SLR Runtime, troubleshooting, upgrading. This folder is the reference behind it.

Conventions: "DSH_HOME" means the package's `dsh-home/` folder unless stated otherwise; "$DSH_HOME" in paths marks the value of the `DSH_HOME` variable. Source references name packages, not file paths inside the bundle.
