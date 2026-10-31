# @deepseek-ai/dsh-client-ui-fork-auto-skills

fork(superpowers): the "Auto Superpowers" Switch row on the General
settings page. Reads and writes the `superpowers-bootstrap` namespace
through the shared configForms service; ships en/zh copy (other languages
fall back to English).

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- The row renders the host default (on) until the namespace's first accepted value arrives; an unavailable host composition leaves the switch non-functional.
