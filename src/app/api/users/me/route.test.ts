import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Regression test — privilege escalation ผ่าน PATCH /api/users/me
 *
 * บั๊กเดิม (อยู่บน prod): route อ่าน `await request.json()` แล้วส่ง body ดิบเข้า
 * `prisma.user.update({ data })` ตรง ๆ ผ่าน updateProfile() — TS type `{displayName?, username?,
 * avatar?}` กรองอะไรไม่ได้ตอน runtime เพราะ body เป็น any → user ที่ล็อกอินคนไหนก็ได้ยิง
 * {"isAdmin": true} แล้วกลายเป็นแอดมินระบบ (และเซ็ต trustScore/passwordHash/phone ทับกฎ
 * phone-immutable ได้ด้วย). guardApi ใน proxy.ts กันไม่ได้ — request มาจาก origin ตัวเองและมี
 * session จริง
 *
 * ทดสอบว่า field นอก allow-list ไม่มีทางไปถึง prisma และ GET ไม่คืน passwordHash
 *
 * mock Prisma ทั้งหมด — ห้ามต่อ DB จริง (Hard Rule 13: dev DB เคย = prod DB)
 */

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

// vi.hoisted: vi.mock ถูก hoist ขึ้นก่อน const ปกติ → ถ้าใช้ const ธรรมดาจะชน TDZ
const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { GET, PATCH } from './route'
import { getServerSession } from 'next-auth'

const USER_ID = 'user-1'

function patchReq(body: unknown) {
  return new NextRequest('http://seller.deepth.local/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: USER_ID } } as never)
  prismaMock.user.findFirst.mockResolvedValue(null) // username ว่างเสมอ (ไม่มีคนจอง)
  prismaMock.user.update.mockResolvedValue({ id: USER_ID, displayName: 'ชื่อใหม่' })
})

describe('PATCH /api/users/me — allow-list', () => {
  it('ไม่ส่ง isAdmin ต่อเข้า prisma แม้ client ยัดมาใน body', async () => {
    const res = await PATCH(patchReq({ displayName: 'ชื่อใหม่', isAdmin: true }))

    expect(res.status).toBe(200)
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1)
    const arg = prismaMock.user.update.mock.calls[0][0]
    expect(arg.data).not.toHaveProperty('isAdmin')
    expect(arg.data.displayName).toBe('ชื่อใหม่')
  })

  it.each(['trustScore', 'passwordHash', 'phone', 'email', 'successfulBidCount', 'isShop'])(
    'ไม่ส่ง %s ต่อเข้า prisma',
    async (field) => {
      await PATCH(patchReq({ displayName: 'ชื่อใหม่', [field]: 'x' }))

      const arg = prismaMock.user.update.mock.calls[0][0]
      expect(arg.data).not.toHaveProperty(field)
    },
  )

  it('body ที่มีแต่ field นอก allow-list → 400 และไม่แตะ DB เลย', async () => {
    const res = await PATCH(patchReq({ isAdmin: true }))

    expect(res.status).toBe(400)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('username ผิดรูปแบบ → 400', async () => {
    const res = await PATCH(patchReq({ username: 'ชื่อไทย!' }))

    expect(res.status).toBe(400)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('username ซ้ำ user อื่น → 409', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'someone-else' })

    const res = await PATCH(patchReq({ username: 'taken_name' }))

    expect(res.status).toBe(409)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('avatar ที่ไม่ใช่ /api/files/ หรือ https → 400 (กัน javascript:/data: หลุดเข้า src)', async () => {
    const res = await PATCH(patchReq({ avatar: 'javascript:alert(1)' }))

    expect(res.status).toBe(400)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('avatar: null = ลบรูป — ผ่านได้', async () => {
    const res = await PATCH(patchReq({ avatar: null }))

    expect(res.status).toBe(200)
    expect(prismaMock.user.update.mock.calls[0][0].data.avatar).toBeNull()
  })

  it('ไม่มี session → 401 ไม่แตะ DB', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never)

    const res = await PATCH(patchReq({ displayName: 'ชื่อใหม่' }))

    expect(res.status).toBe(401)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })
})

describe('GET /api/users/me', () => {
  it('ไม่ select passwordHash ออกมา', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID, displayName: 'ฉัน', shops: [], userBadges: [] })

    const res = await GET()
    const body = await res.json()

    expect(body).not.toHaveProperty('passwordHash')
    const arg = prismaMock.user.findUnique.mock.calls[0][0]
    expect(arg.select).toBeDefined()
    expect(arg.select).not.toHaveProperty('passwordHash')
  })
})
