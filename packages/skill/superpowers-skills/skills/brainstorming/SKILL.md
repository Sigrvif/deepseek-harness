---
name: brainstorming
description: Use when the user asks for something new to be built or designed and the request leaves real choices open - clarifies what they want, settles the approach, writes a short SPEC.md
---

# Brainstorming

Models build the wrong thing confidently. This skill is how you find out
what the user actually wants before you build — and write it down so
neither of you loses it later in a long session.

## First: is this trivial?

One clear action with no open choices ("make the button red", "add a
README section") is not brainstorming work. Do it. This skill is for
requests where what or how is genuinely open: a new page, tool, script,
document, or feature with real choices to make.

## Look before asking

If there is existing material — files in the folder, a SPEC.md from
earlier work, something built before — read it first. Never ask a question
the material already answers.

## The conversation

1. Say back what you understood they want, in two or three sentences, so
   they can correct you immediately.
2. Ask one question at a time — the single one whose answer would most
   change what you build. Wait for the answer before the next. Plain
   words, no process talk.
3. Once the shape is clear, list two or three ways to build it, one line
   each, and recommend one. Let them pick.
4. At any point they can say "just go": then skip the rest of this skill
   and build it, stating any significant choice you make on their behalf
   in one line as you go.

A concrete proposal they can correct beats an interrogation. When they're
stuck, suggest something specific rather than asking open-ended questions.

## Write the spec

When the approach is settled, write `SPEC.md` in the working folder —
unless they prefer another name or place, or the task is small enough that
the conversation itself was the spec. Keep it under a screenful, in plain
language:

- **Goal** — what they want and why, one or two lines.
- **Approach** — the option chosen, one line.
- **Requirements** — the concrete, checkable points, one line each.
- **Non-goals** — what NOT to do; the traps you could fall into.

Show it to them and ask "does this match what you want?". Their approval
or correction is the green light — then switch to working-in-steps and
build.

## While the spec exists

- A later change request updates SPEC.md first (with their agreement),
  then the work.
- If they say "this isn't what I asked for", re-read SPEC.md before
  replying — either the work drifted from it, or the spec needs updating,
  and the file says which.
