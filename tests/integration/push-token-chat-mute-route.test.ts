/**
 * [blocker] `PATCH /api/seller/push-token` — ปุ่มลำโพงหน้าแชทปิดเสียงแจ้งเตือนเด้งของเครื่องนั้น
 * (00018 ส่วนขยาย 2026-10-14 · docs/20 - Features/00018 - Facebook Chat Integration/EXTENSIONS-2026-10-14-mute-chat-push-per-device.md)
 *
 * route จริง + Postgres จริง (ไม่ mock prisma) — mock แค่ session
 * ต้องรันด้วย local Docker Postgres เท่านั้น (Hard Rule 13) · ลบเฉพาะ user ที่เทสสร้าง (PushToken cascade ตาม)
 */
import { describe, it, expect, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { prisma, deleteTestData } from '../setup'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { getServerSession } from 'next-auth'
import { PATCH, POST } from '@/app/api/seller/push-token/route'

const userIds: string[] = []
const n = Date.now().toString().slice(-7)

async function mkUser(tag: string) {
  const u = await prisma.user.create({
    data: { phone: `08${tag}${n}`.slice(0, 10), displayName: `mute ${tag}`, username: `mute${tag}${n}` },
  })
  userIds.push(u.id)
  return u
}
const tokenOf = (tag: string) => `ExponentPushToken[mute-${tag}-${n}]`
const asUser = (id: string | null) =>
  vi.mocked(getServerSession).mockResolvedValue((id ? { user: { id } } : null) as never)
const req = (method: string, body: unknown) =>
  new NextRequest('http://seller.deepth.local/api/seller/push-token', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const mutedOf = async (token: string) =>
  (await prisma.pushToken.findUnique({ where: { token }, select: { chatSoundMuted: true } }))?.chatSoundMuted

afterAll(async () => {
  await deleteTestData({ userIds })
})

describe('[blocker] PATCH /api/seller/push-token — chatSoundMuted ต่อเครื่อง', () => {
  it('ค่าเริ่มของแถวใหม่ = false (ทุกเครื่องมีเสียงเหมือนเดิม)', async () => {
    const u = await mkUser('1')
    asUser(u.id)
    const t = tokenOf('a')
    expect((await POST(req('POST', { token: t, platform: 'ios' }))).status).toBe(200)
    expect(await mutedOf(t)).toBe(false)
  })

  it('เจ้าของ token ปิด/เปิดได้ · เครื่องอื่นของบัญชีเดียวกันไม่เปลี่ยน', async () => {
    const u = await mkUser('2')
    asUser(u.id)
    const phone1 = tokenOf('b1')
    const phone2 = tokenOf('b2')
    await POST(req('POST', { token: phone1, platform: 'ios' }))
    await POST(req('POST', { token: phone2, platform: 'ios' }))

    expect((await PATCH(req('PATCH', { token: phone1, chatSoundMuted: true }))).status).toBe(200)
    expect(await mutedOf(phone1)).toBe(true)
    expect(await mutedOf(phone2)).toBe(false)

    await PATCH(req('PATCH', { token: phone1, chatSoundMuted: false }))
    expect(await mutedOf(phone1)).toBe(false)
  })

  it('แก้ token ของคนอื่นไม่ได้ (where token + userId)', async () => {
    const owner = await mkUser('3')
    const other = await mkUser('4')
    const t = tokenOf('c')
    asUser(owner.id)
    await POST(req('POST', { token: t, platform: 'ios' }))

    asUser(other.id)
    expect((await PATCH(req('PATCH', { token: t, chatSoundMuted: true }))).status).toBe(200)
    expect(await mutedOf(t)).toBe(false)
  })

  it('ไม่สร้างแถวใหม่เมื่อ token ยังไม่ลงทะเบียน', async () => {
    const u = await mkUser('5')
    asUser(u.id)
    const t = tokenOf('d')
    expect((await PATCH(req('PATCH', { token: t, chatSoundMuted: true }))).status).toBe(200)
    expect(await prisma.pushToken.findUnique({ where: { token: t } })).toBeNull()
  })

  it('POST ซ้ำ (แอปลงทะเบียนทุก 5 นาที) ไม่ล้างค่าที่ปิดไว้', async () => {
    const u = await mkUser('6')
    asUser(u.id)
    const t = tokenOf('e')
    await POST(req('POST', { token: t, platform: 'android' }))
    await PATCH(req('PATCH', { token: t, chatSoundMuted: true }))
    await POST(req('POST', { token: t, platform: 'android' }))
    expect(await mutedOf(t)).toBe(true)
  })

  it('ไม่ล็อกอิน 401 · body ผิด 400', async () => {
    asUser(null)
    expect((await PATCH(req('PATCH', { token: tokenOf('f'), chatSoundMuted: true }))).status).toBe(401)
    const u = await mkUser('7')
    asUser(u.id)
    expect((await PATCH(req('PATCH', { token: 'junk', chatSoundMuted: true }))).status).toBe(400)
    expect((await PATCH(req('PATCH', { token: tokenOf('f'), chatSoundMuted: 'yes' }))).status).toBe(400)
    expect((await PATCH(req('PATCH', { token: tokenOf('f') }))).status).toBe(400)
  })
})
