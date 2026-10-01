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

/**
 * [blocker] ตั๋วขากลับจาก Custom Tab (Android) ผูก nonce — เดินทางผ่าน deepseller:// ที่แอปอื่นดักได้
 * ใครถือแต่ตั๋วต้องแลกไม่ได้ (สเปก 2026-10-01-android-oauth-custom-tabs)
 */
describe('[blocker] mobile-ticket — ผูก nonce', () => {
  const base = { tid: 't2', uid: 'user-1', purpose: 'enter' as const, exp: Date.now() + 60_000 }
  const NONCE = 'n'.repeat(43)

  it('ตั๋วผูก nonce: nonce ตรง = ผ่าน · ผิด/ไม่ส่ง = ไม่ผ่าน', async () => {
    const { hashNonce, nonceMatches } = await import('./mobile-ticket')
    const p = { ...base, nh: hashNonce(NONCE) }
    expect(nonceMatches(p, NONCE)).toBe(true)
    expect(nonceMatches(p, 'x'.repeat(43))).toBe(false)
    expect(nonceMatches(p, null)).toBe(false)
    expect(nonceMatches(p, '')).toBe(false)
  })

  it('ตั๋วที่ไม่ผูก (ของเดิม: แอปผู้ซื้อ / Apple native) ผ่านเหมือนเดิม', async () => {
    const { nonceMatches } = await import('./mobile-ticket')
    expect(nonceMatches(base, null)).toBe(true)
  })

  it('nh อยู่ในส่วนที่เซ็น — ถอดออกแล้วลายเซ็นพัง', async () => {
    const { signTicket, verifyTicket, hashNonce } = await import('./mobile-ticket')
    const token = signTicket({ ...base, nh: hashNonce(NONCE) })
    const [b64, sig] = token.split('.')
    const stripped = JSON.parse(Buffer.from(b64, 'base64url').toString())
    delete stripped.nh
    const forged = `${Buffer.from(JSON.stringify(stripped)).toString('base64url')}.${sig}`
    expect(verifyTicket(forged, 'enter')).toBeNull()
    expect(verifyTicket(token, 'enter')?.nh).toBe(hashNonce(NONCE))
  })
})
