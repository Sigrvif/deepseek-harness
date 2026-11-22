---
name: test-driven-development
description: Use when adding or changing behavior in a project with a test framework - write one failing test first, watch it fail, make it pass, then refactor
metadata:
  stage: execute
---

# Test-Driven Development

Write the test before the code. Not a test plan — one small failing test
that pins the exact behavior this step is supposed to produce.

## The loop

1. Write the smallest test that fails for the right reason: it describes
   the behavior you are about to add, nothing more.
2. Run it. Read the failure. If it fails for some other reason than the
   missing behavior, fix that first.
3. Write the smallest code that makes the test pass. Resist doing more.
4. Run the suite for the files you touched. Green? Refactor with the
   tests as your net, or move to the next step.

## When the loop doesn't fit

- Pure scaffolding, config, or text with no observable behavior: no
  test, and one line saying why there is none.
- The behavior is visible only through a running app: test the seam
  under it — a function, a handler, a state transition. If there is
  truly no seam, that is a design finding; surface it instead of
  skipping silently.
- The framework makes a test absurdly expensive: say so, choose the
  cheapest honest check, and name what it does not cover.

## Rules

- Never write implementation to "test later". The failing run is the
  evidence that the test can fail.
- One behavior per test; name the test after the behavior.
- A bug fix starts by writing the failing test that reproduces it —
  systematic-debugging's reproduction step already got you halfway.
- Green means the suite you actually ran. Quote its summary line when
  you report the step done (verification-before-completion).
