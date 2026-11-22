---
name: verification-before-completion
description: Use when about to claim anything is done, fixed, or working - run the real command now and quote its output; evidence before claims
metadata:
  stage: execute
---

# Verification Before Completion

No "done", "fixed", or "it works" without evidence from this session.
Models claim success from memory; memory is where the bug came from. Run
the thing, then report what it actually printed.

## The check

1. Name the command or inspection that proves the claim.
2. Run it now — the real, full command, not a related one.
3. Read the output. Check the exit code. Count the failures.
4. Report the claim together with the evidence: the command and its actual
   output. If you can't run it, say that instead of claiming it.

## What common claims need

| Claim | Evidence |
|---|---|
| "Tests pass" | the test command's summary line, from this session |
| "The script works" | you ran it, and quote its output |
| "The bug is fixed" | the original reproduction, now passing |
| "The file is updated" | you re-read the file after writing it |
| "All requirements met" | SPEC.md's points checked one by one |

## Rules

- "Should work", "probably", and "I'm confident" are not evidence.
- A passing check from earlier counts only if nothing changed since.
- If verification fails, report the failure plainly, with its output. A
  stated failure is useful; a hidden one is a lie.
- Partial success is reported as partial: name what works and what
  doesn't.
