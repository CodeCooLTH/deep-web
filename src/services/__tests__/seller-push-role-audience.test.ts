/**
 * [blocker] ผู้รับ push ตามบทบาท (00071 P3 S-13)
 *
 * เดิม shopAudience = "เจ้าของ + สมาชิกทุกคน" ⇒ ผู้ดูแลที่เหลือแต่บทบาทเปิดบิล/ฝ่ายช่างได้เสียงเตือนแชทที่เปิดอ่านไม่ได้ (403)
 *  · pushNewChatMessage / pushChatSendFailed → ต้องเป็นคนที่ถือ H1 (เจ้าของ ผู้ดูแล ตอบแชท)
 *  · pushChannelDisconnected (ข่าวสถานะช่องทาง) → ต้องเป็นคนที่ "แก้ได้" = H3 (เจ้าของ ผู้ดูแล) — ผู้ตอบแชทเปิดหน้าตั้งค่าไม่ได้
 * mock ที่ prisma ล้วน — userIdsHoldingCap/effectiveRoles เป็นของจริง
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const staffRef = vi.hoisted(() => ({ rows: [] as { userId: string; roles: string[] }[], vertical: 'SERVICE_QUEUE' }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    shop: {
      findMany: vi.fn(async (args: { where: { id: { in: string[] } } }) => {
        // นับ query: ผู้รับต้องมาจาก query เดียวต่อการคัด (ไม่ใช่ shop + member แยกแล้วค่อยคัดทีหลัง)
        return args.where.id.in.map((id) => ({
          id, userId: 'owner1', kind: 'BUSINESS', vertical: staffRef.vertical,
          members: [
            { userId: 'owner1', role: 'OWNER', roles: [] },
            ...staffRef.rows.map((r) => ({ userId: r.userId, role: 'ADMIN', roles: r.roles })),
          ],
        }))
      }),
    },
    shopNotificationPref: { findMany: vi.fn(async () => [] as { userId: string }[]) },
    user: { findMany: vi.fn(async () => [] as { id: string; chatPushSound: string }[]) },
  },
}))
vi.mock('@/services/chat.service', () => ({ getConversationToastPreview: vi.fn() }))
vi.mock('@/services/app-push.service', () => ({ pushToUsers: vi.fn() }))

const { pushNewChatMessage, pushChannelDisconnected } = await import('@/services/seller-push.service')
const { getConversationToastPreview } = await import('@/services/chat.service')
const { pushToUsers } = await import('@/services/app-push.service')
const { prisma } = await import('@/lib/prisma')

const preview = (id: string) => ({
  conversationId: id, senderName: 'สมชาย', senderAvatarUrl: null, preview: 'สวัสดีครับ',
  channel: 'MESSENGER', channelName: 'เพจ', lastMessageAt: new Date('2026-10-10T03:00:00Z'),
})

beforeEach(() => {
  vi.mocked(pushToUsers).mockClear()
  vi.mocked(prisma.shop.findMany).mockClear()
  staffRef.vertical = 'SERVICE_QUEUE'
  staffRef.rows = [
    { userId: 'mgr', roles: ['MANAGER'] },
    { userId: 'chat', roles: ['CHAT'] },
    { userId: 'bill', roles: ['BILLING'] },
    { userId: 'tech', roles: ['TECHNICIAN'] },
  ]
})

describe('shopAudience (pushNewChatMessage) — H1', () => {
  it('[blocker] ได้เฉพาะเจ้าของ/MANAGER/CHAT · BILLING และ TECHNICIAN ไม่ได้รับ · query เดียว', async () => {
    vi.mocked(getConversationToastPreview).mockResolvedValueOnce(preview('c-role-1') as never)
    await pushNewChatMessage({ shopId: 'shop1', conversationId: 'c-role-1' })
    const audience = vi.mocked(pushToUsers).mock.calls.flatMap(([u]) => u as string[])
    expect([...audience].sort()).toEqual(['chat', 'mgr', 'owner1'])
    expect(audience).not.toContain('bill')
    expect(audience).not.toContain('tech')
    expect(vi.mocked(prisma.shop.findMany)).toHaveBeenCalledTimes(1)
  })

  it('ร้านที่ขายบริการไม่ได้: BILLING ถูกตัดทิ้งอยู่แล้ว ⇒ ผู้ดูแล [BILLING] ล้วนไม่ได้รับ', async () => {
    staffRef.vertical = 'ONLINE_SALES'
    staffRef.rows = [{ userId: 'bill', roles: ['BILLING'] }]
    vi.mocked(getConversationToastPreview).mockResolvedValueOnce(preview('c-role-2') as never)
    await pushNewChatMessage({ shopId: 'shop1', conversationId: 'c-role-2' })
    const audience = vi.mocked(pushToUsers).mock.calls.flatMap(([u]) => u as string[])
    expect(audience).toEqual(['owner1'])
  })
})

describe('shopSystemAlertAudience (pushChannelDisconnected) — H3', () => {
  it('[blocker] ได้เฉพาะเจ้าของ + MANAGER · CHAT/BILLING/TECHNICIAN ไม่ได้รับข่าวที่ตัวเองแก้ไม่ได้', async () => {
    await pushChannelDisconnected({ shopId: 'shop1', channelName: 'เพจ', channelLabel: 'Messenger' })
    const audience = vi.mocked(pushToUsers).mock.calls.flatMap(([u]) => u as string[])
    expect([...audience].sort()).toEqual(['mgr', 'owner1'])
    expect(vi.mocked(prisma.shop.findMany)).toHaveBeenCalledTimes(1)
  })
})
