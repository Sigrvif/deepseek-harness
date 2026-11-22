---
name: dispatching-parallel-agents
description: Use when several genuinely independent tasks could run at once - one focused subagent each, dispatched together, then verify their work yourself
metadata:
  stage: execute
---

# Dispatching Parallel Agents

Subagents run with fresh context and cannot see this conversation. Used
well, they do independent work in parallel without flooding your own
context. Used badly, they guess confidently and you copy their mistakes
into the project.

## When

- Two or more tasks that are genuinely independent: different files,
  different questions, no shared state. Translating five separate files;
  extracting the license terms of three libraries; summarizing four long
  documents.
- Not when tasks touch the same files, depend on each other's results, or
  boil down to "understand the system" — that is one agent, or you.

## How

1. One subagent per task. Dispatch them together — multiple `subagent`
   calls in one response — so they run concurrently.
2. Make each prompt self-contained: exact file paths, exact error text,
   exact expected output. The agent cannot ask you what you meant; what it
   needs must already be in the prompt.
3. Give each a narrow scope and a defined result: "Edit only `<path>`:
   change X to Y. Report what you changed and anything that blocked you."
4. Say what not to touch. An agent without a boundary rewrites the
   neighborhood.

## After they return

- Read each report with suspicion. Verify the important claims yourself:
  open the file, run the result. Agents report success enthusiastically.
- Two agents edited the same file? Reconcile by hand — that was a dispatch
  mistake; don't repeat it.
- Their work still gets verified like any other work
  (verification-before-completion) before anything is called done.
