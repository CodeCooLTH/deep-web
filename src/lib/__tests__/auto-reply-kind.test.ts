import { describe, it, expect } from 'vitest'
import { isBotReplyKind, isSystemNoticeKind } from '@/lib/auto-reply-constants'

describe('auto-reply kind helpers', () => {
  it('บอท = AUTO, AUTO_TEST เท่านั้น', () => {
    expect(isBotReplyKind('AUTO')).toBe(true)
    expect(isBotReplyKind('AUTO_TEST')).toBe(true)
    expect(isBotReplyKind('AUTO_NOTICE')).toBe(false)
    expect(isBotReplyKind(null)).toBe(false)
    expect(isBotReplyKind(undefined)).toBe(false)
  })
  it('system notice = AUTO_NOTICE เท่านั้น', () => {
    expect(isSystemNoticeKind('AUTO_NOTICE')).toBe(true)
    expect(isSystemNoticeKind('AUTO')).toBe(false)
    expect(isSystemNoticeKind(null)).toBe(false)
  })
})
