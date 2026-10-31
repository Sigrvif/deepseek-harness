# DSH Tool Mapping

Skills speak in actions ("invoke the skill", "dispatch a subagent", "create a todo"). In dsh these resolve to the surfaces below.

| Action skills request | DSH equivalent |
| --- | --- |
| Invoke a skill | Call the `skill` tool with the exact name from the session's available-skills catalog. The catalog message lists every skill with a one-line description; the tool returns the full `<skill_content>` block. |
| Task tracking ("create a todo", "mark complete") | Use the `todo_write` tool. |
| Dispatch a subagent | Use the `subagent` tool; steer or follow up with `send_message`, stop with `interrupt_agent`. |
| Plan for user approval | Use plan mode and `exit_plan_mode` when the session runs in it. |

## Notes

- A skill the user invoked directly already appears in the conversation as a `<skill_content>` block; follow it and do not call the `skill` tool again for that skill.
- The `skill` tool loads instructions only; it does not execute anything. After loading, follow the skill's steps with the ordinary tools.
- Superpowers' `references/` paths inside a skill directory resolve against that skill's base directory, which dsh reports in the `<skill_resources>` hint of every loaded skill.
