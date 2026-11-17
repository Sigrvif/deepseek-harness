/**
 * The turn's change report as the model reads it: one line per file with its
 * display path and line counts (or its `detected`/`binary`/`oversized`
 * marker), the complete totals, and nothing else. English by design — this is
 * model-facing context in the job-sentinel style, not user-facing copy.
 * @module
 */

import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { WorkspaceChangesSummary } from '@deepseek-ai/dsh-workspace-changes'

/** Longest file list rendered before the remainder folds into one line. */
export const REPORT_FILE_CAP = 20

/**
 * Render one summary as the notice text.
 * @param summary - the announced summary.
 * @returns the plain-text report.
 */
export function reportText(summary: WorkspaceChangesSummary): string {
  const lines = [`Change report for turn ${summary.turn} of this session's workspace:`]
  for (const file of summary.files.slice(0, REPORT_FILE_CAP)) {
    const counts = file.observed === true ? 'detected'
      : file.binary === true ? 'binary'
        : file.oversized === true ? 'oversized'
          : `+${file.added}/-${file.deleted}`
    lines.push(`- ${file.display} (${counts})`)
  }
  if (summary.files.length > REPORT_FILE_CAP) lines.push(`… and ${summary.files.length - REPORT_FILE_CAP} more.`)
  lines.push(`Total: ${summary.total} file${summary.total === 1 ? '' : 's'} changed, +${summary.added}/-${summary.deleted} net.`)
  return lines.join('\n')
}

/**
 * Build the durable notice message.
 * @param summary - the announced summary.
 * @returns a user-role message carrying the `change-report` source.
 */
export function reportMessage(summary: WorkspaceChangesSummary): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text: reportText(summary) }],
    source: {
      kind: 'change-report',
      form: 'notice',
      summary: `${summary.total} file${summary.total === 1 ? '' : 's'} changed in turn ${summary.turn}`,
    },
  })
}
