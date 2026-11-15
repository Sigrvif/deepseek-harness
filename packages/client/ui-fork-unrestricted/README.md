# @deepseek-ai/dsh-client-ui-fork-unrestricted

The "Unrestricted mode" Switch row on the General settings page (after the
Auto Superpowers row): reads/writes the `unrestricted-mode` namespace's
volatile `enabled` field through the shared configForms service. Default off;
flipping takes effect on the next request without restarting the harness.
See `packages/prompt/unrestricted-mode` for the fusion this controls.
