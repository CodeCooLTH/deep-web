import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * [blocker] feature 00053 — สวิตช์ "แสดงบนหน้าร้าน" รายตัว (TC-D2, TC-D6)
 *
 * เทสชั้นนี้ตอบสองคำถามที่ไม่มี gate อื่นในโปรเจกต์ตอบได้:
 *   1. การซ่อนรายการ **ไม่แตะ** `pinnedAt`/`isActive` (ถ้าแตะ = ซ่อนแล้วหมุดหายถาวร ผู้ใช้กู้เองไม่ได้)
 *   2. คำสั่งเขียน scope ด้วย `shopId` ใน `where` เสมอ (ไม่ใช่ดึงมาแล้วเทียบทีหลัง)
 * ทั้งสองข้อเป็นเรื่อง "รูปร่างของ query" ซึ่ง tsc/build/grep มองไม่เห็นเลย
 */
vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: { updateMany: vi.fn(), findMany: vi.fn() },
    room: { updateMany: vi.fn(), findMany: vi.fn() },
    serviceResource: { updateMany: vi.fn(), findMany: vi.fn() },
  },
}))

vi.mock('@/lib/shop-context', () => ({ canAccessShop: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { canAccessShop } from '@/lib/shop-context'
import { listProfileVisibilityItems, setProfileItemVisibility } from './profile-visibility.service'

const SHOP = 'shop-1'
const ACTOR = 'user-1'

beforeEach(() => {
  vi.clearAllMocks()
  ;(canAccessShop as any).mockResolvedValue(true)
})

describe('[blocker] setProfileItemVisibility', () => {
  it('เขียนเฉพาะ showOnProfile — ห้ามแตะ pinnedAt/isActive', async () => {
    ;(prisma.product.updateMany as any).mockResolvedValue({ count: 1 })

    await setProfileItemVisibility(SHOP, ACTOR, 'PRODUCT', 'p-1', false)

    const arg = (prisma.product.updateMany as any).mock.calls[0][0]
    expect(Object.keys(arg.data)).toEqual(['showOnProfile'])
    expect(arg.data.showOnProfile).toBe(false)
    expect(arg.data).not.toHaveProperty('pinnedAt')
    expect(arg.data).not.toHaveProperty('isActive')
  })

  it('scope ด้วย shopId ใน where เสมอ (ไม่ใช่ where: { id } ลอย ๆ)', async () => {
    ;(prisma.product.updateMany as any).mockResolvedValue({ count: 1 })

    await setProfileItemVisibility(SHOP, ACTOR, 'PRODUCT', 'p-1', true)

    const arg = (prisma.product.updateMany as any).mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'p-1', shopId: SHOP })
  })

  it('kind เลือกตารางปลายทางถูกตัว และไม่แตะตารางอื่นเลย', async () => {
    ;(prisma.room.updateMany as any).mockResolvedValue({ count: 1 })
    await setProfileItemVisibility(SHOP, ACTOR, 'ROOM', 'r-1', false)
    expect(prisma.room.updateMany).toHaveBeenCalledTimes(1)
    expect(prisma.product.updateMany).not.toHaveBeenCalled()
    expect(prisma.serviceResource.updateMany).not.toHaveBeenCalled()

    vi.clearAllMocks()
    ;(canAccessShop as any).mockResolvedValue(true)
    ;(prisma.serviceResource.updateMany as any).mockResolvedValue({ count: 1 })
    await setProfileItemVisibility(SHOP, ACTOR, 'SERVICE', 's-1', false)
    expect(prisma.serviceResource.updateMany).toHaveBeenCalledTimes(1)
    expect(prisma.room.updateMany).not.toHaveBeenCalled()
  })

  it('count = 0 (ไม่มีรายการ หรือเป็นของร้านอื่น) → NOT_FOUND', async () => {
    ;(prisma.product.updateMany as any).mockResolvedValue({ count: 0 })
    await expect(setProfileItemVisibility(SHOP, ACTOR, 'PRODUCT', 'p-x', false)).rejects.toThrow(
      'NOT_FOUND',
    )
  })

  it('ไม่มีสิทธิ์ในร้าน → FORBIDDEN และไม่ยิงคำสั่งเขียนเลย', async () => {
    ;(canAccessShop as any).mockResolvedValue(false)
    await expect(setProfileItemVisibility(SHOP, ACTOR, 'PRODUCT', 'p-1', false)).rejects.toThrow(
      'FORBIDDEN',
    )
    expect(prisma.product.updateMany).not.toHaveBeenCalled()
  })
})

describe('listProfileVisibilityItems', () => {
  beforeEach(() => {
    ;(prisma.room.findMany as any).mockResolvedValue([])
    ;(prisma.serviceResource.findMany as any).mockResolvedValue([])
  })

  it('นับ visibleCount จากสถานะจริง และไม่คืนกลุ่มที่ร้านไม่มีของเลย', async () => {
    ;(prisma.product.findMany as any).mockResolvedValue([
      { id: 'p1', name: 'A', images: ['f1'], showOnProfile: true, pinnedAt: new Date() },
      { id: 'p2', name: 'B', images: [], showOnProfile: false, pinnedAt: null },
    ])

    const groups = await listProfileVisibilityItems(SHOP, ACTOR)

    expect(groups).toHaveLength(1) // ไม่มีการ์ดกลุ่มห้องพัก/บริการที่ว่างเปล่า
    expect(groups[0].kind).toBe('PRODUCT')
    expect(groups[0].visibleCount).toBe(1)
    expect(groups[0].items[0]).toMatchObject({ id: 'p1', imageFileId: 'f1', pinned: true })
    expect(groups[0].items[1]).toMatchObject({ id: 'p2', imageFileId: null, pinned: false })
  })

  it('ดึงเฉพาะรายการที่ยังเปิดขาย — ของที่ปิดขายไปแล้วไม่มีวันโชว์อยู่แล้ว การนับรวมจะทำให้ตัวนับโกหก', async () => {
    ;(prisma.product.findMany as any).mockResolvedValue([])
    await listProfileVisibilityItems(SHOP, ACTOR)
    for (const model of ['product', 'room', 'serviceResource'] as const) {
      expect((prisma[model].findMany as any).mock.calls[0][0].where).toMatchObject({
        shopId: SHOP,
        isActive: true,
      })
    }
  })

  it('ไม่มีสิทธิ์ → FORBIDDEN ก่อนแตะฐานข้อมูล', async () => {
    ;(canAccessShop as any).mockResolvedValue(false)
    await expect(listProfileVisibilityItems(SHOP, ACTOR)).rejects.toThrow('FORBIDDEN')
    expect(prisma.product.findMany).not.toHaveBeenCalled()
  })
})
