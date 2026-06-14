import { describe, it, expect, beforeAll } from 'vitest'

// app-token.ts throw ตอน import ถ้าไม่มี NEXTAUTH_SECRET → set ก่อน dynamic import
beforeAll(() => {
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'test-secret-abcdef1234567890'
})

describe('app-token (HMAC Bearer)', () => {
  it('sign → verify คืน userId เดิม', async () => {
    const { signAppToken, verifyAppToken } = await import('./app-token')
    const token = signAppToken('user-123')
    expect(verifyAppToken(token)).toBe('user-123')
  })

  it('token ถูกแก้ (tamper) → null', async () => {
    const { signAppToken, verifyAppToken } = await import('./app-token')
    const token = signAppToken('user-123')
    expect(verifyAppToken(token.slice(0, -3) + 'zzz')).toBeNull()
  })

  it('token มั่ว / ว่าง → null', async () => {
    const { verifyAppToken } = await import('./app-token')
    expect(verifyAppToken('not-a-token')).toBeNull()
    expect(verifyAppToken('')).toBeNull()
    expect(verifyAppToken(null)).toBeNull()
    expect(verifyAppToken(undefined)).toBeNull()
  })
})
