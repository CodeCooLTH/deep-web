import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * [blocker] POST /api/login/apple-native — สมัครด้วย Apple ในแอป iOS ตั้งแต่ 1.0.3 (2026-10-11)
 * เรียก route จริง · mock เฉพาะการตรวจโทเคน / ฐานข้อมูล / ตัวสร้างบัญชี
 */
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined) }),
}))
const verify = vi.fn()
vi.mock('@/lib/apple/identity-token', () => ({ verifyAppleIdentityToken: (...a: unknown[]) => verify(...a) }))
const findUnique = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: { authAccount: { findUnique: (...a: unknown[]) => findUnique(...a) } } }))
const upsert = vi.fn()
vi.mock('@/lib/auth', () => ({ upsertAppleNativeUser: (...a: unknown[]) => upsert(...a) }))
vi.mock('@/lib/mobile-ticket', () => ({ createMobileTicket: async (userId: string) => `ticket-for-${userId}` }))

const { POST } = await import('../route')

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15'
const req = (userAgent: string, body: Record<string, unknown> = { identityToken: 'jwt' }) =>
  new Request('https://seller.deepthailand.app/api/login/apple-native', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': userAgent },
    body: JSON.stringify(body),
  })
const json = async (r: Response) => (await r.json()) as { ok: boolean; reason?: string; ticket?: string }

beforeEach(() => {
  jar.clear()
  jar.set('deep_apple_nonce', 'nonce-123')
  jar.set('deep_shell', 'app')
  verify.mockReset().mockResolvedValue({ ok: true, claims: { sub: 'apple-sub-1', email: 'a@b.com' } })
  findUnique.mockReset().mockResolvedValue(null)
  upsert.mockReset().mockResolvedValue('new-user-1')
})

describe('ยังไม่เคยผูก Apple ID นี้', () => {
  it('🛑 แอป iOS รุ่นบนสโตร์ (DeepSellerApp/1.0) → NO_ACCOUNT · ไม่สร้างบัญชี', async () => {
    const r = await json(await POST(req(`${IOS} DeepSellerApp/1.0`)))
    expect(r).toEqual({ ok: false, reason: 'NO_ACCOUNT' })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('🛑 build เก่าที่มีแต่คุกกี้ ไม่มีเลขรุ่น → NO_ACCOUNT', async () => {
    const r = await json(await POST(req(IOS)))
    expect(r.reason).toBe('NO_ACCOUNT')
    expect(upsert).not.toHaveBeenCalled()
  })

  it('แอป iOS 1.0.3 → สร้างบัญชีพร้อมชื่อจาก Apple + อีเมลจากโทเคน แล้วได้ตั๋ว', async () => {
    const r = await json(
      await POST(
        req(`${IOS} DeepSellerApp/1.0.3`, {
          identityToken: 'jwt',
          fullName: { givenName: ' สมชาย ', familyName: 'ใจดี' },
          email: 'spoofed@evil.com',
        }),
      ),
    )
    expect(r).toEqual({ ok: true, ticket: 'ticket-for-new-user-1' })
    expect(upsert).toHaveBeenCalledWith({ sub: 'apple-sub-1', verifiedEmail: 'a@b.com', name: 'สมชาย ใจดี' })
  })

  it('แอป iOS 1.0.3 ที่ Apple ไม่ส่งชื่อ (อนุญาตไปแล้วก่อนหน้า) → ยังสร้างได้ ชื่อเป็น null', async () => {
    await POST(req(`${IOS} DeepSellerApp/1.0.3`))
    expect(upsert).toHaveBeenCalledWith({ sub: 'apple-sub-1', verifiedEmail: 'a@b.com', name: null })
  })
})

describe('มีบัญชีอยู่แล้ว', () => {
  it('ล็อกอินได้ทุกรุ่นเหมือนเดิม ไม่สร้างซ้ำ', async () => {
    findUnique.mockResolvedValue({ userId: 'u-old', user: { deletedAt: null } })
    for (const v of ['1.0', '1.0.3']) {
      const r = await json(await POST(req(`${IOS} DeepSellerApp/${v}`)))
      expect(r, v).toEqual({ ok: true, ticket: 'ticket-for-u-old' })
    }
    expect(upsert).not.toHaveBeenCalled()
  })

  it('🛑 บัญชีที่ถูกลบ → NO_ACCOUNT แม้รุ่นที่สมัครได้ (5.1.1(v) ห้ามปลุกบัญชีที่ผู้ใช้สั่งลบ)', async () => {
    findUnique.mockResolvedValue({ userId: 'u-del', user: { deletedAt: new Date() } })
    const r = await json(await POST(req(`${IOS} DeepSellerApp/1.0.3`)))
    expect(r.reason).toBe('NO_ACCOUNT')
    expect(upsert).not.toHaveBeenCalled()
  })
})

it('ชื่อยาวผิดปกติ → 400 (ไม่สร้างบัญชี)', async () => {
  const res = await POST(
    req(`${IOS} DeepSellerApp/1.0.3`, { identityToken: 'jwt', fullName: { givenName: 'ก'.repeat(61) } }),
  )
  expect(res.status).toBe(400)
  expect(upsert).not.toHaveBeenCalled()
})
