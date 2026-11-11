/**
 * [blocker] แจ้งเตือนแชทใหม่แนบเลขบนไอคอนของผู้รับแต่ละคน (2026-11-11)
 * นับจากผู้รับชุดเดียวกับที่ได้แจ้งเตือน (shopAudience) · นับล้มก็ยังส่งแจ้งเตือน
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    shop: {
      findMany: vi.fn(async (args: { where: { id: { in: string[] } } }) =>
        args.where.id.in.map((id) => ({
          id, userId: 'owner1', kind: 'BUSINESS', vertical: 'ONLINE_SALES',
          members: [{ userId: 'owner1', role: 'OWNER', roles: [] }, { userId: 'staff1', role: 'ADMIN', roles: ['CHAT'] }],
        })),
      ),
    },
    shopNotificationPref: { findMany: vi.fn(async () => [] as { userId: string }[]) },
    user: { findMany: vi.fn(async () => [] as { id: string; chatPushSound: string }[]) },
  },
}))
vi.mock('@/services/chat.service', () => ({ getConversationToastPreview: vi.fn() }))
vi.mock('@/services/app-push.service', () => ({ pushToUsers: vi.fn() }))
vi.mock('@/services/app-badge.service', () => ({ appBadgeCounts: vi.fn() }))

const { pushNewChatMessage, pushChatSendFailed } = await import('@/services/seller-push.service')
const { getConversationToastPreview } = await import('@/services/chat.service')
const { pushToUsers } = await import('@/services/app-push.service')
const { appBadgeCounts } = await import('@/services/app-badge.service')

const preview = (id: string) => ({
  conversationId: id, senderName: 'สมชาย', senderAvatarUrl: null, preview: 'สวัสดีครับ',
  channel: 'MESSENGER', channelName: 'เพจ', lastMessageAt: new Date('2026-11-11T03:00:00Z'),
})

beforeEach(() => {
  vi.mocked(pushToUsers).mockClear()
  vi.mocked(appBadgeCounts).mockReset()
})

describe('pushNewChatMessage — เลขบนไอคอน', () => {
  it('[blocker] นับให้ผู้รับทุกคน แล้วส่ง map ต่อให้ pushToUsers', async () => {
    const counts = new Map([['owner1', 4], ['staff1', 1]])
    vi.mocked(appBadgeCounts).mockResolvedValueOnce(counts)
    vi.mocked(getConversationToastPreview).mockResolvedValueOnce(preview('c-badge-1') as never)
    await pushNewChatMessage({ shopId: 'shop1', conversationId: 'c-badge-1' })
    expect([...(vi.mocked(appBadgeCounts).mock.calls[0][0] as string[])].sort()).toEqual(['owner1', 'staff1'])
    const opts = vi.mocked(pushToUsers).mock.calls.map((c) => c[4])
    expect(opts.length).toBeGreaterThan(0)
    for (const o of opts) expect(o?.badgeByUser).toBe(counts)
  })

  it('นับได้ map ว่าง (ล้มทุกคน) = ยังส่งแจ้งเตือนตามปกติ', async () => {
    vi.mocked(appBadgeCounts).mockResolvedValueOnce(new Map())
    vi.mocked(getConversationToastPreview).mockResolvedValueOnce(preview('c-badge-2') as never)
    await pushNewChatMessage({ shopId: 'shop1', conversationId: 'c-badge-2' })
    expect(vi.mocked(pushToUsers)).toHaveBeenCalled()
  })
})

describe('แจ้งเตือนอื่นไม่แนบเลข (เครื่องคงเลขเดิม)', () => {
  it('ส่งไม่สำเร็จ: ไม่นับ ไม่ส่ง badgeByUser', async () => {
    await pushChatSendFailed({ shopId: 'shop1', conversationId: 'c-badge-3', failureReason: 'UNKNOWN' } as never)
    expect(vi.mocked(appBadgeCounts)).not.toHaveBeenCalled()
    for (const c of vi.mocked(pushToUsers).mock.calls) expect(c[4]?.badgeByUser).toBeUndefined()
  })
})
