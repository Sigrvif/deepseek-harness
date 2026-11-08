---
name: using-superpowers
description: Use when starting any task - check the skill catalog and invoke matching skills before acting, and know when skills are overkill
---

# Using Superpowers

Skills are short instruction files for common workflows. The session's skill
catalog lists every available skill with a one-line description.

## Before starting a task

1. Look at the task. If it names or clearly matches a skill in the catalog,
   call the `skill` tool with that exact name and follow what it says.
2. If several skills match, load all of them, then start.
3. If nothing matches, just do the task — no skill is needed.

Announce in one line ("Using systematic-debugging for this bug"), then act.

## When NOT to load skills

- The ask is one clear action: rename a file, change a color, answer a
  question, tweak one value. Just do it.
- The user is adding detail to work already underway. Continue that work;
  don't restart it with a skill pass.
- The user said how to work. Their instruction beats any skill.

Loading a process skill for a small task is the same mistake as loading no
skill for a big one: it adds steps the task doesn't need.

## Tool names (dsh)

| Skills say | dsh tool |
|---|---|
| "invoke / load a skill" | `skill` (the exact name from the catalog) |
| "track steps / todos" | `todo_write` |
| "dispatch a subagent" | `subagent` (follow up with `send_message`) |

A skill the user invoked directly is already in the conversation as
instructions — don't call `skill` for it again.
