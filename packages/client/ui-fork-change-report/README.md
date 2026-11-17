# @deepseek-ai/dsh-client-ui-fork-change-report

The General-settings row for the fork's per-turn change-report toggle
(`Settings → General → Change reports`). Writes the `enabled` volatile toggle
of `@deepseek-ai/dsh-change-report` through the shared `configForms` service
under the `change-report` namespace; **on by default**, matching the host
schema default. See the host package README for what the toggle controls.
