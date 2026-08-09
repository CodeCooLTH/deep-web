import { beforeEach, describe, expect, it, vi } from 'vitest'

// ไม่แตะฐานข้อมูลจริง (Hard Rule 13) — ทั้งไฟล์ทดสอบ "กติกาการตัดสิน" ไม่ใช่ SQL
vi.mock('@/lib/prisma', () => ({
  prisma: {
    shop: { findMany: vi.fn() },
    shopNotificationPref: { findMany: vi.fn(), upsert: vi.fn() },
  },
}))
vi.mock('@/lib/shop-context', () => ({ listAccessibleShopIds: vi.fn() }))

const { listShopNotificationPrefs, setShopChatNotification } = await import(
  '@/services/notification-pref.service'
)
const { prisma } = await import('@/lib/prisma')
const { listAccessibleShopIds } = await import('@/lib/shop-context')

/**
 * Prisma type ของ findMany อ้างอิง "แถวเต็ม" เสมอ แต่ service เรียกด้วย `select` จึงได้ subset
 * ของคอลัมน์เท่านั้น — TypeScript มองไม่เห็นความต่างนี้ผ่าน mock. cast ไว้ที่เดียวพร้อมเหตุผล
 * ดีกว่าโปรย `as any` กระจายทั้งไฟล์แล้วกลืน type error จริงไปด้วยโดยไม่รู้ตัว
 */
const selected = <T,>(rows: T[]) => rows as never

const SHOPS = [
  { id: 'shopA', shopName: 'BT Premium', logo: null, kind: 'BUSINESS' },
  { id: 'shopB', shopName: 'ร้านบีที', logo: null, kind: 'PERSONAL' },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listAccessibleShopIds).mockResolvedValue(['shopA', 'shopB'])
  vi.mocked(prisma.shop.findMany).mockResolvedValue(selected(SHOPS))
  vi.mocked(prisma.shopNotificationPref.findMany).mockResolvedValue(selected([]))
})

describe('listShopNotificationPrefs', () => {
  it('[blocker] ไม่มีแถว = เปิด — ผู้ใช้เดิมทุกคนต้องไม่เงียบหลัง migrate', () => {
    // ถ้าวันหนึ่งมีคนกลับกติกาเป็น opt-in โดยไม่ backfill ทุกคนจะเงียบพร้อมกันโดยไม่มีอะไรบอก
    return listShopNotificationPrefs('u1').then((rows) => {
      expect(rows.every((r) => r.chatEnabled)).toBe(true)
      expect(rows).toHaveLength(2)
    })
  })

  it('มีแถวที่ปิดไว้ → ร้านนั้นเท่านั้นที่ปิด', async () => {
    vi.mocked(prisma.shopNotificationPref.findMany).mockResolvedValue(
      selected([{ shopId: 'shopA', chatEnabled: false }]),
    )

    const rows = await listShopNotificationPrefs('u1')
    expect(rows.find((r) => r.shopId === 'shopA')?.chatEnabled).toBe(false)
    expect(rows.find((r) => r.shopId === 'shopB')?.chatEnabled).toBe(true)
  })

  it('แถวที่ chatEnabled=true ต้องไม่ถูกตีเป็นปิด', async () => {
    // เคยกดปิดแล้วกดเปิดกลับ → แถวยังอยู่แต่ค่าเป็น true; ตรรกะที่เช็คแค่ "มีแถวไหม" จะพังตรงนี้
    vi.mocked(prisma.shopNotificationPref.findMany).mockResolvedValue(
      selected([{ shopId: 'shopA', chatEnabled: true }]),
    )

    const rows = await listShopNotificationPrefs('u1')
    expect(rows.find((r) => r.shopId === 'shopA')?.chatEnabled).toBe(true)
  })

  it('ไม่มีร้านเลย → คืนอาร์เรย์ว่าง ไม่ query ต่อ', async () => {
    vi.mocked(listAccessibleShopIds).mockResolvedValue([])

    expect(await listShopNotificationPrefs('u1')).toEqual([])
    expect(prisma.shop.findMany).not.toHaveBeenCalled()
  })
})

describe('setShopChatNotification', () => {
  it('ร้านที่ตัวเองเข้าถึงได้ → upsert แล้วคืน true', async () => {
    expect(await setShopChatNotification('u1', 'shopA', false)).toBe(true)
    expect(prisma.shopNotificationPref.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_shopId: { userId: 'u1', shopId: 'shopA' } } }),
    )
  })

  it('[blocker] ร้านที่ไม่มีสิทธิ์ → คืน false และห้ามเขียนลงตาราง', async () => {
    // ถ้าไม่ตรวจ ใครก็ยิง shopId ของร้านคนอื่นมาสร้างแถวทิ้งไว้ในตารางเราได้
    expect(await setShopChatNotification('u1', 'shop-ของคนอื่น', false)).toBe(false)
    expect(prisma.shopNotificationPref.upsert).not.toHaveBeenCalled()
  })
})
