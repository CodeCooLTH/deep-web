/**
 * findConversationShopForUser — หาว่าเธรดแชทเป็นของร้านไหน "ในบรรดาร้านที่ user เข้าถึงได้"
 *
 * บั๊กที่คุมไว้ (หัวหน้ารายงาน 2026-08-06): ผู้ขายถือ 2 ร้าน ผูก Facebook Page คนละเพจไว้
 * คนละร้าน → push ของทั้งสองร้านลงเครื่องเดียวกัน แต่ payload มีแค่ /inbox/{conversationId}
 * ไม่มี shopId → กด noti ของร้าน B ตอน active ร้าน A แล้วขึ้น "ไม่พบบทสนทนานี้"
 *
 * 🛑 Hard Rule 13 — mock prisma ล้วน ไม่แตะฐานจริง (dev DB = prod DB ตัวเดียวกัน)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/shop-context', () => ({
  canAccessShop: vi.fn(),
  listAccessibleShopIds: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { listAccessibleShopIds } from '@/lib/shop-context'
import { findConversationShopForUser } from '@/services/chat.service'

const USER_ID = 'user-1'
const CONV_ID = 'conv-1'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findConversationShopForUser', () => {
  it('เจอเธรดในร้านที่เข้าถึงได้ → คืนข้อมูลร้านเจ้าของ', async () => {
    vi.mocked(listAccessibleShopIds).mockResolvedValue(['shop-a', 'shop-b'])
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue({
      shopId: 'shop-b',
      shop: { shopName: 'ร้าน B', logo: 'logo-b', kind: 'BUSINESS' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const result = await findConversationShopForUser(CONV_ID, USER_ID)

    expect(result).toEqual({
      shopId: 'shop-b',
      shopName: 'ร้าน B',
      logo: 'logo-b',
      kind: 'BUSINESS',
    })
  })

  it('🛑 scope สิทธิ์อยู่ใน WHERE ตั้งแต่ query แรก ไม่ใช่ post-check', async () => {
    vi.mocked(listAccessibleShopIds).mockResolvedValue(['shop-a', 'shop-b'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null as any)

    await findConversationShopForUser(CONV_ID, USER_ID)

    const where = vi.mocked(prisma.conversation.findFirst).mock.calls[0][0]?.where as {
      id: string
      shopId: { in: string[] }
    }
    // เธรดของร้านที่ไม่มีสิทธิ์ต้องไม่ถูกอ่านขึ้นมาเลย (feedback_rsc_dal_authz)
    expect(where.id).toBe(CONV_ID)
    expect(where.shopId).toEqual({ in: ['shop-a', 'shop-b'] })
  })

  it('ไม่มีเธรด หรือ มีแต่อยู่ร้านที่ไม่มีสิทธิ์ → คืน null เหมือนกัน (กัน enumeration)', async () => {
    vi.mocked(listAccessibleShopIds).mockResolvedValue(['shop-a'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null as any)

    expect(await findConversationShopForUser(CONV_ID, USER_ID)).toBeNull()
  })

  it('ไม่มีร้านเลย → คืน null โดยไม่ยิง query ต่อ', async () => {
    vi.mocked(listAccessibleShopIds).mockResolvedValue([])

    expect(await findConversationShopForUser(CONV_ID, USER_ID)).toBeNull()
    expect(prisma.conversation.findFirst).not.toHaveBeenCalled()
  })

  it('ร้าน PERSONAL ก็รองรับ — kind ส่งกลับตามจริง ไม่ hardcode BUSINESS', async () => {
    vi.mocked(listAccessibleShopIds).mockResolvedValue(['shop-personal'])
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue({
      shopId: 'shop-personal',
      shop: { shopName: 'ร้านส่วนตัว', logo: null, kind: 'PERSONAL' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const result = await findConversationShopForUser(CONV_ID, USER_ID)

    expect(result?.kind).toBe('PERSONAL')
    expect(result?.logo).toBeNull()
  })
})
