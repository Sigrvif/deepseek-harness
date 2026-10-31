/** fork(quota-reset): provider wall-clock reset parsing and timezone conversion. */
import { describe, expect, it } from 'vitest'
import { ACCOUNT_QUOTA_EXCEEDED_CODE, QUOTA_EXCEEDED_CODE } from '../src/error.ts'
import {
  formatDuration,
  formatResetLocal,
  isResetEligibleCode,
  parseQuotaResetAt,
  wallTimeToEpochMs,
} from '../src/quota-reset.ts'

/** 2026-10-31T12:00:00Z. */
const NOW = Date.parse('2026-10-31T12:00:00Z')

describe('parseQuotaResetAt', () => {
  it('interprets a GLM-style wall clock in the provider timezone', () => {
    // 2026-11-01 02:00:00 in UTC+8 is 2026-10-31T18:00:00Z — six hours out.
    const reset = parseQuotaResetAt(
      'Your request has exceeded the usage limit. Please retry after 2026-11-01 02:00:00.',
      'Asia/Shanghai',
      NOW,
    )
    expect(reset).toBeDefined()
    expect(reset!.resetAtMs).toBe(Date.parse('2026-10-31T18:00:00Z'))
    expect(reset!.delayMs).toBe(6 * 60 * 60 * 1000)
    expect(reset!.timeZone).toBe('Asia/Shanghai')
  })

  it('defaults to UTC when no timezone is configured', () => {
    const reset = parseQuotaResetAt('quota resets at 2026-10-31 13:30:00', undefined, NOW)
    expect(reset).toBeDefined()
    expect(reset!.resetAtMs).toBe(Date.parse('2026-10-31T13:30:00Z'))
    expect(reset!.timeZone).toBe('UTC')
  })

  it('accepts ISO-T, slash dates, and missing seconds', () => {
    for (const text of [
      'reset at 2026-11-01T02:30:00 (UTC+8)',
      'quota refreshes 2026/11/1 02:30',
    ]) {
      const reset = parseQuotaResetAt(text, 'Asia/Shanghai', NOW)
      expect(reset).toBeDefined()
      expect(reset!.resetAtMs).toBe(Date.parse('2026-10-31T18:30:00Z'))
    }
  })

  it('accepts unix epoch candidates, seconds and milliseconds', () => {
    const seconds = Math.floor(NOW / 1000) + 3600
    const fromSeconds = parseQuotaResetAt(`rate limited until ${seconds}`, 'UTC', NOW)
    expect(fromSeconds).toBeDefined()
    expect(fromSeconds!.resetAtMs).toBe(NOW + 3600_000)
    const fromMs = parseQuotaResetAt(`rate limited until ${NOW + 1800_000}`, 'UTC', NOW)
    expect(fromMs).toBeDefined()
    expect(fromMs!.resetAtMs).toBe(NOW + 1800_000)
  })

  it('prefers the keyword-affinity date over an unrelated one', () => {
    const reset = parseQuotaResetAt(
      'Request 2026-10-31 09:00:00 was rejected. Your quota resets at 2026-11-01 02:00:00.',
      'Asia/Shanghai',
      NOW,
    )
    expect(reset).toBeDefined()
    expect(reset!.resetAtMs).toBe(Date.parse('2026-10-31T18:00:00Z'))
  })

  it('rejects dates without reset wording nearby', () => {
    expect(parseQuotaResetAt('model GPT-x was trained on 2026-01-01 00:00:00 data', 'UTC', NOW))
      .toBeUndefined()
  })

  it('rejects resets outside the seven-day horizon', () => {
    expect(parseQuotaResetAt('resets at 2027-01-01 00:00:00', 'UTC', NOW)).toBeUndefined()
  })

  it('clamps a just-passed reset to the minimum delay', () => {
    const reset = parseQuotaResetAt('resets at 2026-10-31 11:59:30', 'UTC', NOW)
    expect(reset).toBeDefined()
    expect(reset!.resetAtMs).toBe(Date.parse('2026-10-31T11:59:30Z'))
    expect(reset!.delayMs).toBe(1000)
  })

  it('infers the provider clock offset from an embedded request id (real GLM copy)', () => {
    // The exact wording from a real usage-limit screenshot: the request id
    // embeds the provider wall clock (2026-10-31 05:19:40 UTC+8), the true
    // request instant is 2026-10-30T21:19:40Z, the reset wall clock is
    // 08:00:19 → 2026-10-31T00:00:19Z, ~2h40m out.
    const message = '[1308][Usage limit reached for 5 hour. Your limit will reset at 2026-10-31 08:00:19][20261031051940b1b4e7600d0a1b2c3]'
    const now = Date.parse('2026-10-30T21:19:45Z')
    const inferred = parseQuotaResetAt(message, undefined, now)
    expect(inferred).toBeDefined()
    expect(inferred!.resetAtMs).toBe(Date.parse('2026-10-31T00:00:19Z'))
    expect(inferred!.timeZone).toBe('UTC+08:00 (inferred)')
    expect(inferred!.delayMs).toBe(9634_000)
    // The configured zone wins over inference.
    const configured = parseQuotaResetAt(message, 'Asia/Shanghai', now)
    expect(configured!.resetAtMs).toBe(inferred!.resetAtMs)
    expect(configured!.timeZone).toBe('Asia/Shanghai')
  })

  it('infers a zero offset for a UTC provider and handles half-hour zones', () => {
    const request = Date.parse('2026-10-30T21:44:50Z')
    const utc = parseQuotaResetAt(
      '[1308][Usage limit reached for 5 hour. Your limit will reset at 2026-10-30 21:45:00][20261030214450b1b4e7600d0a1b2c3]',
      undefined, request + 3000,
    )
    expect(utc!.resetAtMs).toBe(Date.parse('2026-10-30T21:45:00Z'))
    expect(utc!.timeZone).toBe('UTC+00:00 (inferred)')
    const ist = parseQuotaResetAt(
      '[1308][Usage limit reached for 5 hour. Your limit will reset at 2026-10-31 03:15:30][20261031031450b1b4e7600d0a1b2c3]',
      undefined, request + 3000,
    )
    expect(ist!.resetAtMs).toBe(Date.parse('2026-10-30T21:45:30Z'))
    expect(ist!.timeZone).toBe('UTC+05:30 (inferred)')
  })

  it('reads Chinese reset copy', () => {
    const reset = parseQuotaResetAt('您的配额已用尽，将于 2026-11-01 02:00:00 重置。', 'Asia/Shanghai', NOW)
    expect(reset).toBeDefined()
    expect(reset!.resetAtMs).toBe(Date.parse('2026-10-31T18:00:00Z'))
  })
})

describe('wallTimeToEpochMs', () => {
  it('converts named-zone wall clocks', () => {
    expect(wallTimeToEpochMs(2026, 11, 1, 2, 0, 0, 'Asia/Shanghai'))
      .toBe(Date.parse('2026-10-31T18:00:00Z'))
    expect(wallTimeToEpochMs(2026, 10, 31, 12, 0, 0, 'UTC')).toBe(NOW)
  })

  it('folds a 24 hour reading into the next day', () => {
    expect(wallTimeToEpochMs(2026, 10, 31, 24, 0, 0, 'UTC'))
      .toBe(Date.parse('2026-11-01T00:00:00Z'))
  })

  it('rejects unknown zones and impossible readings', () => {
    expect(wallTimeToEpochMs(2026, 13, 1, 0, 0, 0, 'UTC')).toBeUndefined()
    expect(wallTimeToEpochMs(2026, 10, 31, 25, 0, 0, 'UTC')).toBeUndefined()
    expect(wallTimeToEpochMs(2026, 10, 31, 12, 0, 0, 'Not/AZone')).toBeUndefined()
  })
})

describe('helpers', () => {
  it('formats coarse durations', () => {
    expect(formatDuration(45_000)).toBe('45s')
    expect(formatDuration(18 * 60_000 + 30_000)).toBe('18m 30s')
    expect(formatDuration(2 * 3600_000 + 13 * 60_000)).toBe('2h 13m')
    expect(formatDuration(5 * 3600_000)).toBe('5h')
    expect(formatDuration(3 * 86_400_000 + 4 * 3600_000)).toBe('3d 4h')
  })

  it('renders resets in the server-local zone', () => {
    const text = formatResetLocal(Date.parse('2026-10-31T18:00:00Z'), NOW)
    expect(text).toMatch(/in 6h/)
  })

  it('names the reset-eligible codes', () => {
    expect(isResetEligibleCode('RATE_LIMIT')).toBe(true)
    expect(isResetEligibleCode(QUOTA_EXCEEDED_CODE)).toBe(true)
    expect(isResetEligibleCode(ACCOUNT_QUOTA_EXCEEDED_CODE)).toBe(true)
    expect(isResetEligibleCode('TRANSPORT')).toBe(false)
  })
})
