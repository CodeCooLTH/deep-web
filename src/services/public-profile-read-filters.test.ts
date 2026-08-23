import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * [blocker] feature 00053 — ตัวกรอง `showOnProfile` ต้องเป็น opt-in (TC-D4) และ fallback ของ
 * `getShopPageLayout` ต้องเป็น `showPrices:false` (TC-A1)
 *
 * 🛑 ทำไมสองเรื่องนี้อยู่ไฟล์เดียวกัน: ทั้งคู่คือ "ค่าที่ถูกเมื่อไม่มีใครสั่งอะไร" ซึ่งเป็นจุดที่
 * พังแล้วไม่มีอะไรฟ้อง — กรองเกินไปหนึ่งที่ = ร้านขายของที่ซ่อนไม่ได้ทั้งระบบ · fallback ผิดทาง
 * = ฟีเจอร์ไม่มีผลกับร้านส่วนใหญ่ที่ไม่มีแถว ShopPageLayout เลย
 */
vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: { findMany: vi.fn() },
    shopPageLayout: { findUnique: vi.fn() },
  },
}))

// pin.service ลาก wallet.service มาด้วย (ซื้อช่องปักหมุด) — ไม่เกี่ยวกับเทสนี้ ตัดทิ้ง
vi.mock('@/services/wallet.service', () => ({ deductCredit: vi.fn() }))
// shop-page-layout.service ลาก channel-chat.service (mirror รูป) + storage มาด้วย
vi.mock('@/services/channel-chat.service', () => ({ mirrorRemoteImage: vi.fn() }))
vi.mock('@/lib/storage', () => ({ getFileUrl: vi.fn() }))
vi.mock('@/lib/shop-context', () => ({ canAccessShop: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getProductsByShop } from './product.service'
import { getPinnedProducts } from './pin.service'
import { getShopPageLayout } from './shop-page-layout.service'

const SHOP = 'shop-1'
const whereOfLastFindMany = () => (prisma.product.findMany as any).mock.calls.at(-1)[0].where

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma.product.findMany as any).mockResolvedValue([])
})

describe('[blocker] getProductsByShop — publicOnly เป็น opt-in', () => {
  it('ไม่ส่ง opts → ไม่มีเงื่อนไข showOnProfile เลย (POS/แชท/ประมูลต้องเห็นของครบ)', async () => {
    await getProductsByShop(SHOP)
    expect(whereOfLastFindMany()).not.toHaveProperty('showOnProfile')
  })

  it('ส่ง opts อื่นโดยไม่มี publicOnly → ยังไม่กรอง', async () => {
    await getProductsByShop(SHOP, 10, { excludePinned: true })
    expect(whereOfLastFindMany()).not.toHaveProperty('showOnProfile')
  })

  it('publicOnly:true → กรองเฉพาะรายการที่ร้านเลือกให้โชว์', async () => {
    await getProductsByShop(SHOP, 48, { excludePinned: true, publicOnly: true })
    expect(whereOfLastFindMany()).toMatchObject({ showOnProfile: true, isActive: true, pinnedAt: null })
  })
})

describe('[blocker] getPinnedProducts — publicOnly เป็น opt-in', () => {
  it('ไม่ส่ง opts → ไม่กรอง (ตัวจัดหน้าร้านฝั่ง seller ต้องเห็นครบ)', async () => {
    await getPinnedProducts(SHOP)
    expect(whereOfLastFindMany()).not.toHaveProperty('showOnProfile')
  })

  it('publicOnly:true → กรอง และยังคงเงื่อนไขปักหมุดเดิมไว้ครบ', async () => {
    await getPinnedProducts(SHOP, { publicOnly: true })
    expect(whereOfLastFindMany()).toMatchObject({
      shopId: SHOP,
      isActive: true,
      showOnProfile: true,
    })
    expect(whereOfLastFindMany().pinnedAt).toEqual({ not: null })
  })
})

describe('[blocker] getShopPageLayout — fallback ของสองค่ากลับทิศกัน', () => {
  it('ไม่มีแถว → isPublished:true แต่ showPrices:false', async () => {
    ;(prisma.shopPageLayout.findUnique as any).mockResolvedValue(null)
    await expect(getShopPageLayout(SHOP)).resolves.toEqual({
      isPublished: true,
      tabOrder: [],
      showPrices: false,
    })
  })

  it('มีแถว → อ่านค่าจากแถวตรง ๆ ไม่ถูก fallback ทับ', async () => {
    ;(prisma.shopPageLayout.findUnique as any).mockResolvedValue({
      isPublished: false,
      tabOrder: ['items'],
      showPrices: true,
    })
    await expect(getShopPageLayout(SHOP)).resolves.toEqual({
      isPublished: false,
      tabOrder: ['items'],
      showPrices: true,
    })
  })

  it('อ่านคอลัมน์ showPrices มาจริง (select ต้องมี ไม่งั้นค่าที่ได้เป็น undefined เงียบ ๆ)', async () => {
    ;(prisma.shopPageLayout.findUnique as any).mockResolvedValue(null)
    await getShopPageLayout(SHOP)
    expect((prisma.shopPageLayout.findUnique as any).mock.calls[0][0].select).toMatchObject({
      showPrices: true,
    })
  })
})
