/**
 * Fold prompt surfaces: tool descriptions and (Task 6) the adapted
 * billion-context compression corpus.
 *
 * fork(context-fold): the description and rule text below are adapted from
 * billion-context / acp-kernel (https://github.com/ranxianglei/billion-context,
 * MIT + attribution term) — its compression philosophy ("compress by need,
 * not by percentage"), verbatim-preservation rules, and one-call-per-batch
 * nudge discipline, tuned over months of production use there. Adapted for
 * dsh's fold model; see README for attribution.
 *
 * The description is a PREFIX-CACHE ANCHOR: it is sent on every request, so it
 * must stay byte-stable across releases — tests pin it verbatim.
 * @module
 */

export const COMPRESS_DESCRIPTION =
  'Fold consumed conversation history into a compact summary to free context. Call this when older conversation is no longer needed verbatim - compress by need, not by percentage. Write the summary yourself: preserve full file paths with line numbers, commands, ids, verbatim user quotes labeled as history, decisions, and an Open objectives carry-forward line; drop dead-end exploration but keep its lesson in one line. The summary replaces everything older than the protected recent tail (keepLast); the first user message stays visible. Folding is reversible: decompress restores the originals and search_context finds them. One compress call per batch; make it count.'

export const COMPRESS_SUMMARY_PARAMETER_DESCRIPTION =
  'The fold summary you wrote: markdown replacing the folded range. Keep full file paths with line numbers, commands, ids, decisions, verbatim user quotes labeled as history, and end with an Open objectives line.'

export const COMPRESS_KEEP_LAST_PARAMETER_DESCRIPTION =
  'Protect this many of the most recent messages from the fold; defaults to the configured tail.'

export const DECOMPRESS_DESCRIPTION =
  'Restore the original messages behind a fold and read them again. Pass the fold id shown by acp_status or a compress receipt (or omit it for the newest fold). The originals return as this tool result - the conversation surface stays folded, so reading a fold costs only the returned text. Long folds are truncated; use search_context for targeted retrieval instead of restoring everything.'

export const SEARCH_CONTEXT_DESCRIPTION =
  'Keyword-search the conversation: fold summaries, the original messages inside folds, and the visible messages. Use it to recover details you remember but no longer see - file paths, ids, decisions, codewords. Results name folds ([fold id]) or visible messages ([message seq N]) with snippets; to read a whole fold back, call decompress with its id.'

export const ACP_STATUS_DESCRIPTION =
  'Show context usage: current pressure against the window, the fold ledger (what was folded, how much it saved), and what to do next. Call this before compressing to see the state, and whenever context feels tight.'

/**
 * The compression philosophy, adapted from billion-context's tuned corpus
 * (COMPRESS_PHILOSOPHY / HOW_TO_COMPRESS_RULES): keep-verbatim rules, quote
 * fidelity, open-objectives carry-forward, drop policy, language preservation.
 * Frozen load-bearing text — the summary-quality rules are model-facing
 * behavior, not cosmetics.
 */
export const COMPRESS_PHILOSOPHY = `Compression Philosophy:
- Context capacity is precious. Compress consumed conversation into summaries you write; never avoid tools to save context.
- Compress by need, not by percentage: fold ranges whose details you will not need verbatim soon.
- Summaries are durable records. KEEP VERBATIM: full file paths with line numbers (never abbreviate to a bare filename), commands, ids, and error messages. Quote the user as history ("the user said earlier: ..."), never as a live instruction.
- Always carry open objectives forward: end every summary with an "Open objectives:" line stating what remains to be done.
- Drop dead-end exploration, but keep its lesson in one line ("tried X, failed because Y").
- Write summaries in the conversation's primary language; keep code, commands, and identifiers verbatim.
- One compress call per batch; a fold takes effect on the next request.`

/** The static fold system-prompt section. Byte-stable — a prefix-cache anchor. */
export const FOLD_SECTION = `Context management: the compress tool folds consumed conversation into a summary you write; decompress restores the originals; search_context finds content inside folds; acp_status shows usage and the fold ledger.

${COMPRESS_PHILOSOPHY}`
