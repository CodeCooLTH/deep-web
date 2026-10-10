// 00066 T6 [blocker] — cron เตือน: จอง/ปล่อยจอง/สมาชิก/รวมต่อคน/payload ไม่มีโน้ต
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  findMany: vi.fn(), updateMany: vi.fn(), shopFind: vi.fn(), push: vi.fn(), preview: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    customerFollowUp: { findMany: m.findMany, updateMany: m.updateMany },
    shop: { findMany: m.shopFind },
  },
}))
vi.mock('@/services/app-push.service', () => ({ pushToUsersWithStatus: m.push }))
vi.mock('@/services/chat.service', () => ({ getConversationToastPreview: m.preview }))

import { runFollowUpReminders } from './follow-up-reminder.service'

const NOW = new Date('2026-09-29T03:00:00Z')
const DUE = new Date('2026-09-29T02:59:00Z')
const team = (extra: { userId: string; role: string; roles: string[] }[], over: Record<string, unknown> = {}) => ({
  id: 's1', userId: 'owner', kind: 'BUSINESS', vertical: 'ONLINE_SALES',
  members: [{ userId: 'owner', role: 'OWNER', roles: [] }, ...extra],
  ...over,
})
const row = (o: Record<string, unknown> = {}) => ({
  id: 'f1', shopId: 's1', conversationId: 'c1', title: 'โทรหา', dueAt: DUE, allDay: false,
  assigneeUserId: 'u1', remindedFor: null, remindedAt: null, status: 'OPEN', ...o,
})

beforeEach(() => {
  vi.resetAllMocks()
  m.updateMany.mockResolvedValue({ count: 1 })
  // 00071 S-13: ผู้รับต้องถือ H1 — ร้านทีม (BUSINESS) owner = OWNER, u1 = ผู้ดูแลที่มีบทบาทตอบแชท
  m.shopFind.mockResolvedValue([team([{ userId: 'u1', role: 'ADMIN', roles: ['CHAT'] }])])
  m.push.mockResolvedValue('SENT')
  m.preview.mockResolvedValue({ senderName: 'คุณเอ' })
})

describe('runFollowUpReminders [blocker]', () => {
  it('จอง count 0 ⇒ ไม่ส่ง', async () => {
    m.findMany.mockResolvedValue([row()])
    m.updateMany.mockResolvedValue({ count: 0 })
    const r = await runFollowUpReminders(NOW)
    expect(m.push).not.toHaveBeenCalled()
    expect(r.reserved).toBe(0)
  })

  it('จองด้วย dueAt/status ใน where และ remindedFor=fireAt', async () => {
    m.findMany.mockResolvedValue([row()])
    await runFollowUpReminders(NOW)
    const arg = m.updateMany.mock.calls[0][0]
    expect(arg.where.dueAt).toEqual(DUE)
    expect(arg.where.status).toBe('OPEN')
    expect(arg.data.remindedFor).toEqual(DUE)
    expect(arg.data.remindedAt).toEqual(NOW)
  })

  it('FAILED ⇒ ปล่อยจอง (คืนค่าเดิม)', async () => {
    const prev = new Date('2026-09-28T02:00:00Z')
    m.findMany.mockResolvedValue([row({ remindedFor: prev, remindedAt: prev })])
    m.push.mockResolvedValue('FAILED')
    const r = await runFollowUpReminders(NOW)
    expect(r.failed).toBe(1)
    const release = m.updateMany.mock.calls[1][0]
    expect(release.where.remindedFor).toEqual(DUE)
    expect(release.data.remindedFor).toEqual(prev)
  })

  it('NO_TOKEN ⇒ คงจอง (ไม่เรียกปล่อย)', async () => {
    m.findMany.mockResolvedValue([row()])
    m.push.mockResolvedValue('NO_TOKEN')
    const r = await runFollowUpReminders(NOW)
    expect(r.noToken).toBe(1)
    expect(m.updateMany).toHaveBeenCalledTimes(1)
  })

  it('ผู้รับผิดชอบหลุดทีม ⇒ ไม่ส่ง รายการอื่นยังส่ง', async () => {
    m.findMany.mockResolvedValue([row(), row({ id: 'f2', assigneeUserId: 'gone', conversationId: 'c2' })])
    const r = await runFollowUpReminders(NOW)
    expect(r.droppedNonMember).toBe(1)
    expect(m.push).toHaveBeenCalledTimes(1)
    expect(m.push.mock.calls[0][0]).toEqual(['u1'])
  })

  it('เจ้าของร้านส่วนตัว (PERSONAL ไม่มีแถว ShopMember) ก็ได้รับ', async () => {
    m.shopFind.mockResolvedValue([team([], { kind: 'PERSONAL', members: [] })])
    m.findMany.mockResolvedValue([row({ assigneeUserId: 'owner' })])
    await runFollowUpReminders(NOW)
    expect(m.push).toHaveBeenCalledTimes(1)
  })

  it('00071: ผู้รับผิดชอบที่เหลือแค่ BILLING/TECHNICIAN (ไม่ถือ H1) ⇒ ไม่ส่ง · MANAGER/CHAT ยังส่ง', async () => {
    m.shopFind.mockResolvedValue([
      team([
        { userId: 'bill', role: 'ADMIN', roles: ['BILLING'] },
        { userId: 'tech', role: 'ADMIN', roles: ['TECHNICIAN'] },
        { userId: 'mgr', role: 'ADMIN', roles: ['MANAGER'] },
      ], { vertical: 'SERVICE_QUEUE' }),
    ])
    m.findMany.mockResolvedValue([
      row({ id: 'f1', assigneeUserId: 'bill' }),
      row({ id: 'f2', assigneeUserId: 'tech', conversationId: 'c2' }),
      row({ id: 'f3', assigneeUserId: 'mgr', conversationId: 'c3' }),
    ])
    const r = await runFollowUpReminders(NOW)
    expect(r.droppedNonMember).toBe(2)
    expect(m.push).toHaveBeenCalledTimes(1)
    expect(m.push.mock.calls[0][0]).toEqual(['mgr'])
  })

  it('รวม 1 push ต่อคนต่อร้าน · หลายใบ ⇒ url หน้ารวม', async () => {
    m.findMany.mockResolvedValue([row(), row({ id: 'f2', conversationId: 'c2' })])
    await runFollowUpReminders(NOW)
    expect(m.push).toHaveBeenCalledTimes(1)
    expect(m.push.mock.calls[0][4]).toEqual({ subtitle: undefined })
    expect(m.push.mock.calls[0][3].url).toContain('/follow-ups?mine=1')
  })

  it('ใบเดียว ⇒ url ห้อง และ payload ไม่มีโน้ต/เบอร์', async () => {
    m.findMany.mockResolvedValue([row({ note: 'โทร 0812345678', phone: '0812345678' })])
    await runFollowUpReminders(NOW)
    const [, title, body, data, opt] = m.push.mock.calls[0]
    expect(data.url).toBe('/inbox/c1')
    expect(JSON.stringify([title, body, data, opt])).not.toMatch(/0812345678|โทร 08/)
  })

  it('ยังไม่ถึงเวลา/จองไว้แล้ว ⇒ ไม่จอง ไม่ส่ง', async () => {
    m.findMany.mockResolvedValue([row({ remindedFor: DUE })])
    const r = await runFollowUpReminders(NOW)
    expect(r.due).toBe(0)
    expect(m.push).not.toHaveBeenCalled()
  })
})
