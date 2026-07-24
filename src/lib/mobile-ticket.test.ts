import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'test-secret-abcdef1234567890'
})

describe('mobile-ticket (HMAC pure layer)', () => {
  const payload = { tid: 't1', uid: 'user-123', purpose: 'enter' as const, exp: Date.now() + 60_000 }

  it('sign → verify คืน payload เดิม (purpose ตรง)', async () => {
    const { signTicket, verifyTicket } = await import('./mobile-ticket')
    const token = signTicket(payload)
    expect(verifyTicket(token, 'enter')).toEqual(payload)
  })

  it('purpose ไม่ตรง → null', async () => {
    const { signTicket, verifyTicket } = await import('./mobile-ticket')
    expect(verifyTicket(signTicket(payload), 'exchange')).toBeNull()
  })

  it('tamper / มั่ว / ว่าง → null', async () => {
    const { signTicket, verifyTicket } = await import('./mobile-ticket')
    const token = signTicket(payload)
    expect(verifyTicket(token.slice(0, -3) + 'zzz', 'enter')).toBeNull()
    expect(verifyTicket('not-a-token', 'enter')).toBeNull()
    expect(verifyTicket('', 'enter')).toBeNull()
    expect(verifyTicket(null, 'enter')).toBeNull()
  })

  it('หมดอายุ → null', async () => {
    const { signTicket, verifyTicket } = await import('./mobile-ticket')
    const expired = { ...payload, exp: Date.now() - 1 }
    expect(verifyTicket(signTicket(expired), 'enter')).toBeNull()
  })
})
