/**
 * [blocker] ด่านบทบาทระดับ service ของแชท/คอมเมนต์ (00071 P3 · S-13)
 *
 * route ชั้นนอกตรวจครั้งหนึ่งแล้ว — ที่นี่พิสูจน์ "ชั้นลึก": service ที่รับ conversationId/commentId จาก client
 * ต้องตรวจเองด้วยบทบาทสด (assertParticipant / canAccessShopWith) · ผู้ซื้อ (buyerUserId) ไม่ถูกกระทบ ·
 * ไม่ส่ง cap = ฝั่งร้านถูกปฏิเสธ (ไม่มีค่าตั้งต้นที่เปิด)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const member = vi.hoisted(() => ({ roles: ['CHAT'] as string[], vertical: 'SERVICE_QUEUE' }))
const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), update: vi.fn() },
  shop: { findUnique: vi.fn() },
  chatMessage: { findMany: vi.fn(async () => []) },
  pageComment: { findUnique: vi.fn() },
  autoReplyLog: { findMany: vi.fn(async () => []) },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/services/product.service', () => ({ getProductById: vi.fn() }))

import { getMessages, markRead } from '@/services/chat.service'
import { setCommentResolved, replyToComment } from '@/services/page-comment.service'
import { ForbiddenRoleError } from '@/lib/shop-capability'

beforeEach(() => {
  vi.clearAllMocks()
  member.roles = ['CHAT']
  member.vertical = 'SERVICE_QUEUE'
  db.conversation.findUnique.mockResolvedValue({ id: 'c1', shopId: 's1', buyerUserId: 'buyer-1', channel: 'MESSENGER' })
  db.conversation.update.mockResolvedValue({})
  db.shop.findUnique.mockImplementation(async () => ({
    userId: 'owner', kind: 'BUSINESS', vertical: member.vertical, deletedAt: null,
    members: [{ role: 'ADMIN', roles: member.roles }],
  }))
  db.chatMessage.findMany.mockResolvedValue([])
  db.pageComment.findUnique.mockResolvedValue({
    id: 'cm1',
    post: { channel: { shopId: 's1', id: 'ch1', externalId: 'p1' } },
  })
})

describe('getMessages / markRead — assertParticipant (H1)', () => {
  it('ผู้ซื้อเจ้าของเธรดผ่านโดยไม่ต้องมี cap', async () => {
    await expect(getMessages('c1', 'buyer-1')).resolves.toBeTruthy()
    await expect(markRead('c1', 'buyer-1', 'BUYER')).resolves.toBeUndefined()
  })

  it('CHAT ผ่านเมื่อส่ง cap H1', async () => {
    await expect(getMessages('c1', 'staff', { shopCap: 'H1' })).resolves.toBeTruthy()
    await expect(markRead('c1', 'staff', 'SHOP', 'H1')).resolves.toBeUndefined()
  })

  it.each([['BILLING'], ['TECHNICIAN']])('%s → ForbiddenRoleError (FORBIDDEN_ROLE) และไม่อ่านข้อความ/ไม่อัปเดตอ่านแล้ว', async (role) => {
    member.roles = [role]
    const e1 = await getMessages('c1', 'staff', { shopCap: 'H1' }).catch((e) => e)
    expect(e1).toBeInstanceOf(ForbiddenRoleError)
    expect(e1.message).toBe('FORBIDDEN') // ตัวเดิมที่ mapper เดิมจับด้วยข้อความยังทำงาน
    const e2 = await markRead('c1', 'staff', 'SHOP', 'H1').catch((e) => e)
    expect(e2).toBeInstanceOf(ForbiddenRoleError)
    expect(db.chatMessage.findMany).not.toHaveBeenCalled()
    expect(db.conversation.update).not.toHaveBeenCalled()
  })

  it('ไม่ส่ง cap → ฝั่งร้านถูกปฏิเสธ แม้เป็นเจ้าของ-ระดับ (fail-closed)', async () => {
    await expect(getMessages('c1', 'staff')).rejects.toBeInstanceOf(ForbiddenRoleError)
  })

  it('ถอดบทบาทกลางทาง → คำขอถัดไปถูกปฏิเสธ (อ่านสด)', async () => {
    await expect(getMessages('c1', 'staff', { shopCap: 'H1' })).resolves.toBeTruthy()
    member.roles = ['BILLING']
    await expect(getMessages('c1', 'staff', { shopCap: 'H1' })).rejects.toBeInstanceOf(ForbiddenRoleError)
  })
})

describe('page-comment service — cap เป็นของผู้เรียก (H2)', () => {
  it('setCommentResolved: BILLING → ForbiddenRoleError ก่อนเขียนอะไร', async () => {
    member.roles = ['BILLING']
    await expect(
      setCommentResolved({ commentId: 'cm1', actorUserId: 'staff', resolved: true, reason: 'MANUAL', cap: 'H2' }),
    ).rejects.toBeInstanceOf(ForbiddenRoleError)
  })

  it('replyToComment: มีผู้ใช้จริงแต่ไม่ส่ง cap → ปฏิเสธ · BILLING ส่ง cap ก็ปฏิเสธ', async () => {
    await expect(
      replyToComment({ commentId: 'cm1', message: 'สวัสดี', actorUserId: 'staff' }),
    ).rejects.toBeInstanceOf(ForbiddenRoleError)
    member.roles = ['BILLING']
    await expect(
      replyToComment({ commentId: 'cm1', message: 'สวัสดี', actorUserId: 'staff', cap: 'H2' }),
    ).rejects.toBeInstanceOf(ForbiddenRoleError)
  })
})
