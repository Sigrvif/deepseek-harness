/**
 * Quota-reset detection for provider failure messages.
 *
 * Usage-window providers (e.g. 5-hour coding-plan quotas) write the reset
 * moment into the error text, typically as a wall-clock time in the
 * PROVIDER's timezone without naming it (GLM writes UTC+8 times). When a
 * failure classifies as rate-limit or quota, this module extracts the reset
 * moment, interprets it via a per-provider IANA timezone, and returns the
 * delay the harness should wait. Provider `Retry-After` headers, when the
 * adapter carries them, remain authoritative and are preferred by callers.
 *
 * @module @deepseek-ai/dsh-llm/quota-reset
 */

import { ACCOUNT_QUOTA_EXCEEDED_CODE, QUOTA_EXCEEDED_CODE } from './error.ts'

/** Hard acceptance window: a parsed reset further than this out is noise. */
const MAX_RESET_HORIZON_MS = 7 * 24 * 60 * 60 * 1000
/** Clock-skew grace: a reset this far in the past is treated as "now". */
const PAST_GRACE_MS = 60 * 1000
/** Minimum returned delay so a clamped past reset still yields one wait. */
const MIN_DELAY_MS = 1000
/** Keyword-affinity search radius around a candidate. */
const KEYWORD_RADIUS_CHARS = 120

/** A parsed quota reset: the absolute moment and the delay from `now`. */
export interface QuotaReset {
  /** Epoch milliseconds the quota is expected to reset. */
  readonly resetAtMs: number
  /** Milliseconds from `now` until the reset; never below one second. */
  readonly delayMs: number
  /** The IANA timezone the wall-clock time was interpreted in. */
  readonly timeZone: string
}

const RESET_KEYWORDS = [
  'reset', 'resets', 'resettled', 'refresh', 'renew', 'renewed',
  'retry', 'try again', 'available again', 'until', 'after',
  'limit will lift', 'window',
  '重置', '重试', '请在', '恢复', '刷新', '配额',
] as const

/** Calendar wall-clock candidates: `2026-11-01 02:00(:30)?`, `2026-11-01T02:00`, `2026/11/01 02:00:30`. */
const CALENDAR_CANDIDATE =
  /(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?/gu

/** Unix-epoch candidates: milliseconds (13 digits) or seconds (10 digits), not inside longer digit or decimal runs. */
const EPOCH_CANDIDATE = /(?<![\w:.])(1\d{12}|1\d{9})(?![\w.])/gu

/**
 * Embedded request clocks: a `YYYYMMDDHHmmss` run at the head of a provider
 * request id (GLM writes `20261031051940b1b4e7600d0…`). Digit runs inside
 * longer ids match deliberately and are validated as a real date near `now`
 * before use.
 */
const REQUEST_CLOCK_CANDIDATE = /(20\d{12})/g

/** Provider clock offsets are quantized to zone granularity. */
const OFFSET_QUANTIZE_MS = 15 * 60 * 1000
/** Real-world zone offsets stay within ±14 hours. */
const MAX_OFFSET_MS = 14 * 3600 * 1000

/**
 * Whether a failed model request is the quota/rate-limit family whose reset
 * moment the parser should look for.
 * @param code - the classified harness failure code.
 * @returns whether the code names a usage-window exhaustion.
 */
export function isResetEligibleCode(code: string): boolean {
  return code === 'RATE_LIMIT' || code === QUOTA_EXCEEDED_CODE || code === ACCOUNT_QUOTA_EXCEEDED_CODE
}

/**
 * Parse a quota reset moment out of a provider failure message.
 *
 * Calendar wall clocks are the provider's local time, interpreted in this
 * order: the configured `timeZone` (IANA name) wins; without one, the
 * offset is INFERRED from an embedded request clock — a `YYYYMMDDHHmmss`
 * run in a request id whose date sits within two days of `now` gives the
 * provider's wall clock for a request whose true instant the harness knows,
 * so the offset is simple arithmetic (quantized to 15 minutes, ±14h bound);
 * with neither, times are read as UTC (which errs toward waiting longer, a
 * provider ahead of UTC only makes the harness wait more, never less than
 * the reset). Unix-epoch candidates are timezone-free. The winning
 * candidate is the keyword-affinity match inside the acceptance window
 * (a past reset within one minute of grace clamps to an immediate retry);
 * everything else is noise and yields undefined.
 * @param message - the provider failure text.
 * @param timeZone - the provider's IANA timezone, when configured.
 * @param now - epoch milliseconds the delay is measured from (approximates the request instant).
 * @returns the reset moment, or undefined when no credible reset is named.
 */
export function parseQuotaResetAt(
  message: string,
  timeZone: string | undefined,
  now: number = Date.now(),
): QuotaReset | undefined {
  const keywords = keywordPositions(message)
  // The wall-clock interpretation the calendar candidates share.
  let zone = timeZone ?? 'UTC'
  let inferredOffsetMs: number | undefined
  if (timeZone === undefined) {
    inferredOffsetMs = inferOffsetMs(message, now)
    if (inferredOffsetMs !== undefined) zone = formatInferredZone(inferredOffsetMs)
  }
  const candidates: { index: number; resetAtMs: number }[] = []
  for (const match of message.matchAll(CALENDAR_CANDIDATE)) {
    const parts = {
      year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
      hour: Number(match[4]), minute: Number(match[5]), second: match[6] === undefined ? 0 : Number(match[6]),
    }
    const parsed = inferredOffsetMs !== undefined
      ? asUtcWithOffset(parts, inferredOffsetMs)
      : wallTimeToEpochMs(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second, zone)
    if (parsed !== undefined) candidates.push({ index: match.index, resetAtMs: parsed })
  }
  for (const match of message.matchAll(EPOCH_CANDIDATE)) {
    const value = Number(match[1])
    // The digit shapes pin the unit: 13-digit runs are milliseconds
    // (1.0e12–2.0e12 spans 2001–2033), 10-digit runs are seconds.
    const parsed = value >= 100_000_000_000 ? value : value * 1000
    candidates.push({ index: match.index, resetAtMs: parsed })
  }
  let winner: { index: number; resetAtMs: number; distance: number } | undefined
  for (const candidate of candidates) {
    const delay = candidate.resetAtMs - now
    if (delay < -PAST_GRACE_MS || delay > MAX_RESET_HORIZON_MS) continue
    const distance = keywordDistance(candidate.index, keywords)
    if (distance > KEYWORD_RADIUS_CHARS) continue
    if (winner === undefined || distance <= winner.distance) winner = { ...candidate, distance }
  }
  if (winner === undefined) return undefined
  const delayMs = Math.max(MIN_DELAY_MS, winner.resetAtMs - now)
  return { resetAtMs: winner.resetAtMs, delayMs, timeZone: zone }
}

interface WallClock {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
}

/** Interpret a wall clock as UTC shifted by a known provider offset. */
function asUtcWithOffset(parts: WallClock, offsetMs: number): number | undefined {
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31
    || parts.hour < 0 || parts.hour > 24 || parts.minute < 0 || parts.minute > 59
    || parts.second < 0 || parts.second > 59) return undefined
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - offsetMs
}

/**
 * Infer the provider clock's UTC offset from an embedded request clock: the
 * id's wall clock minus the request's true instant (approximated by `now`,
 * the failure arriving seconds after the request), quantized to zone
 * granularity. Runs that are not a real date near `now` are ignored.
 * @param message - the provider failure text.
 * @param now - epoch milliseconds approximating the request instant.
 * @returns the inferred offset, or undefined when no credible clock is embedded.
 */
function inferOffsetMs(message: string, now: number): number | undefined {
  for (const match of message.matchAll(REQUEST_CLOCK_CANDIDATE)) {
    const run = match[1] as string
    const year = Number(run.slice(0, 4))
    const month = Number(run.slice(4, 6))
    const day = Number(run.slice(6, 8))
    const hour = Number(run.slice(8, 10))
    const minute = Number(run.slice(10, 12))
    const second = Number(run.slice(12, 14))
    if (month < 1 || month > 12 || day < 1 || day > 31
      || hour > 23 || minute > 59 || second > 59) continue
    const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)
    if (Math.abs(wallAsUtc - now) > 2 * 86_400_000) continue
    const offset = Math.round((wallAsUtc - now) / OFFSET_QUANTIZE_MS) * OFFSET_QUANTIZE_MS
    if (Math.abs(offset) > MAX_OFFSET_MS) continue
    return offset
  }
  return undefined
}

/** Label an inferred offset the way zones are named ("UTC+08:00 (inferred)"). */
function formatInferredZone(offsetMs: number): string {
  const minutes = Math.round(offsetMs / 60_000)
  const sign = minutes < 0 ? '-' : '+'
  const absolute = Math.abs(minutes)
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')} (inferred)`
}

/**
 * Render a reset moment in the SERVER's local time and zone name, for
 * failure messages ("resets 2026-11-01 19:00 (+01:00), in 2h 13m").
 * @param resetAtMs - epoch milliseconds of the reset.
 * @param now - epoch milliseconds the remaining duration is measured from.
 * @returns the human-readable local rendering.
 */
export function formatResetLocal(resetAtMs: number, now: number = Date.now()): string {
  const at = new Date(resetAtMs)
  const when = at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  const offset = formatOffset(at)
  return `${when} ${offset}, in ${formatDuration(resetAtMs - now)}`
}

/**
 * Render a coarse human duration ("45s", "18m 30s", "2h 13m", "5h", "3d 4h").
 * @param ms - non-negative duration in milliseconds.
 * @returns the human-readable duration.
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  if (minutes > 0) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  return `${seconds}s`
}

/**
 * Convert one wall-clock reading in a named timezone to epoch milliseconds,
 * handling DST by resolving the offset around the target instant (the
 * standard two-pass fixup; ambiguous fall-back times resolve to the earlier
 * instant, which is the right choice for a reset that already passed).
 * @param year - full year.
 * @param month - 1-based month.
 * @param day - day of month.
 * @param hour - hour 0-23 (a 24 reading from hour12 output folds into the next day).
 * @param minute - minute.
 * @param second - second.
 * @param timeZone - IANA timezone name.
 * @returns epoch milliseconds, or undefined when the timezone is unknown or the reading is not a real calendar time.
 */
export function wallTimeToEpochMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): number | undefined {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)
    || !Number.isInteger(hour) || !Number.isInteger(minute) || !Number.isInteger(second)) return undefined
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 24
    || minute < 0 || minute > 59 || second < 0 || second > 59) return undefined
  try {
    // Date.UTC folds an hour-24 reading into the next day on its own; the
    // two-pass offset fixup then resolves the zone around that instant.
    const probe = timezoneOffsetMs(Date.UTC(year, month - 1, day, hour, minute, second), timeZone)
    if (probe === undefined) return undefined
    const first = Date.UTC(year, month - 1, day, hour, minute, second) - probe
    const second_ = timezoneOffsetMs(first, timeZone)
    if (second_ === undefined) return undefined
    return Date.UTC(year, month - 1, day, hour, minute, second) - second_
  } catch {
    return undefined
  }
}

function timezoneOffsetMs(epochMs: number, timeZone: string): number | undefined {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(epochMs))
    const read = (type: string): number => Number(parts.find(part => part.type === type)?.value)
    const asUtc = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour') % 24, read('minute'), read('second'))
    return asUtc - epochMs
  } catch (error) {
    // An unknown zone throws RangeError; everything else is a genuine failure.
    if (error instanceof RangeError) return undefined
    throw error
  }
}

function keywordPositions(message: string): number[] {
  const positions: number[] = []
  const lowered = message.toLowerCase()
  for (const keyword of RESET_KEYWORDS) {
    let from = 0
    for (;;) {
      const at = lowered.indexOf(keyword, from)
      if (at < 0) break
      positions.push(at)
      from = at + keyword.length
    }
  }
  return positions
}

function keywordDistance(index: number, positions: number[]): number {
  let best = KEYWORD_RADIUS_CHARS + 1
  for (const at of positions) best = Math.min(best, Math.abs(index - at))
  return best
}

function formatOffset(at: Date): string {
  const minutes = -at.getTimezoneOffset()
  if (minutes === 0) return 'UTC'
  const sign = minutes > 0 ? '+' : '-'
  const absolute = Math.abs(minutes)
  return `(UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')})`
}
