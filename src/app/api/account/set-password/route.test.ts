import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn(), update: vi.fn() } } }))
vi.mock('@/lib/otp', () => ({ verifyOtp: vi.fn() }))
import { prisma } from '@/lib/prisma'
import { verifyOtp } from '@/lib/otp'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://seller.deepth.local/api/account/set-password', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('POST /api/account/set-password', () => {
  beforeEach(() => vi.clearAllMocks())

  it('400 on invalid body', async () => {
    const res = await POST(req({ phone: 'x', otp: '1', password: 'weak' }) as any)
    expect(res.status).toBe(400)
  })
  it('401 on bad OTP', async () => {
    ;(verifyOtp as any).mockReturnValue(false)
    const res = await POST(req({ phone: '0812345678', otp: '000000', password: 'Abcd123!' }) as any)
    expect(res.status).toBe(401)
  })
  it('404 when phone has no account', async () => {
    ;(verifyOtp as any).mockReturnValue(true)
    ;(prisma.user.findUnique as any).mockResolvedValue(null)
    const res = await POST(req({ phone: '0812345678', otp: '123456', password: 'Abcd123!' }) as any)
    expect(res.status).toBe(404)
  })
  it('200 sets passwordHash on success', async () => {
    ;(verifyOtp as any).mockReturnValue(true)
    ;(prisma.user.findUnique as any).mockResolvedValue({ id: 'u1' })
    ;(prisma.user.update as any).mockResolvedValue({ id: 'u1' })
    const res = await POST(req({ phone: '0812345678', otp: '123456', password: 'Abcd123!' }) as any)
    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }))
  })
})
