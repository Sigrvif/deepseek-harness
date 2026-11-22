---
name: working-in-steps
description: Use when doing multi-step or multi-file work - turn the spec into a todo list, work it one verified step at a time, and check the result against SPEC.md before calling it done
metadata:
  stage: execute
---

# Working in Steps

Small verified steps, checked against the spec, delivered as files. That is
the whole method.

## Start

1. If SPEC.md exists for this work, read it first — it is the goal. If it
   doesn't exist and the work is non-trivial, use brainstorming to write
   one with the user.
2. Turn the work into a short todo list with `todo_write`: one step per
   item, each ending in something you can check — a file written, a
   command that runs, an output that matches.
3. Work the steps in order, one at a time. Finish one before starting the
   next. Update the todo list as you go.

## Each step

- Make the smallest change that satisfies the step. `edit` the file; don't
  rewrite it. Change what exists instead of scaffolding something new.
- Verify the step by running it: run the script, re-read the file, execute
  the command and look at the output. Reviewing your own diff in your head
  is not verification.
- A failing step is a bug: switch to systematic-debugging. One change,
  re-run, read the actual output. Three failed attempts in a row — stop,
  re-read SPEC.md, reconsider the approach before touching anything again.
- For a behavior change or a bug fix, follow test-driven-development: the
  failing test comes first. If the project has a test suite, run it after
  your changes.

## Updates to earlier work

When the user asks to change something you (or an earlier session) built:
find those files and edit them. Do not regenerate everything from scratch,
and do not create a v2 next to v1 unless asked. If the change contradicts
SPEC.md, update SPEC.md first (with their agreement), then the work.

## Before claiming done

1. Re-read SPEC.md — or the original request, if there is no spec.
2. Check every requirement and non-goal against what was actually built,
   by looking at the files and running the result, not by remembering
   writing them.
3. Only then report, following verification-before-completion.

A check that fails means it isn't done. Fix it and check again.
