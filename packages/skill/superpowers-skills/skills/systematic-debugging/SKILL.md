---
name: systematic-debugging
description: Use when something fails or behaves unexpectedly, before proposing any fix - read the error, reproduce it, change one thing at a time
metadata:
  stage: execute
---

# Systematic Debugging

Understand the failure before fixing it. Guess-fixing is how a one-line bug
becomes a pile of stacked changes that each hide the last.

## Before any fix

1. **Read the whole error.** Stack trace, line numbers, error code — not
   just the first line. Errors usually name the file and the actual
   problem.
2. **Reproduce it.** Run the failing thing yourself and watch it fail. If
   you can't make it happen, you also can't tell whether you fixed it.
3. **Look at what changed.** What was touched last around the failure —
   the file just edited, the new input, the different environment?

## Finding the cause

- Trace the bad value backward: where does it come from, who produced it,
  who passed it along? Fix it where it originates, not where it explodes.
- Compare with something similar that works. The difference between the
  two is usually the bug.
- State the cause in one sentence ("X is null because Y runs before Z").
  If you can't finish that sentence, you don't have the cause yet — keep
  reading, don't start editing.

## Fixing

1. Make one change — the smallest one that addresses the cause. No
   drive-by improvements, no "while I'm here" refactors.
2. Re-run and read the real output. Fixed? Also re-run whatever else the
   change could have touched.
3. Not fixed? Set the guess aside, form the next hypothesis from the new
   output, and try that instead. **After three failed attempts, stop.**
   Re-read the goal (SPEC.md if one exists), reconsider the approach, and
   tell the user what you tried and what you learned. A fourth guess
   stacked on three failures is how sessions wreck working code.

## Verifying

The bug is fixed when the original reproduction passes — the real
symptom, not a related one — and nothing else broke. Follow
verification-before-completion before saying "fixed".
