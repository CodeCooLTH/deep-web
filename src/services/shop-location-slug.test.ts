// shop-location-slug.test.ts — ล็อกกฎ 2 ข้อของ shop.service ที่เพิ่ม/แข็งขึ้นเมื่อ 2026-08-14
//
// (1) updateShop รับพิกัดได้แล้ว แต่ต้องเป็น "คู่" และอยู่ในกรอบประเทศไทย
//     ก่อนหน้านี้ไม่มีทางไหนในระบบแก้พิกัดร้านได้เลย (ทั้งฐาน prod จึงไม่มีร้านไหนมีหมุดสักร้าน)
//     การเปิดทางเขียนใหม่มาพร้อมความเสี่ยงใหม่: ค่าที่ผิดชนิดของความจริงอย่าง 0,0 หรือ lat/lng
//     สลับกัน จะผ่านด่าน `!= null` ไปนอนในฐานได้เงียบ ๆ แล้วโผล่เป็นหมุดกลางอ่าวกินีบนโปรไฟล์
//     สาธารณะของร้าน
//
// (2) setShopSlug ปฏิเสธการเขียนทับ slug เดิม
//     กฎ "ตั้งได้ครั้งเดียว" ถูกเขียนไว้ 3 ที่มาตลอด (คอมเมนต์ใน route, ข้อความบนจอ, กล่องยืนยัน)
//     แต่ไม่เคยมีโค้ดบรรทัดไหนบังคับ — สิ่งเดียวที่กันอยู่คือ UI ไม่ render ช่องกรอกให้เห็น
//     ยิง POST ตรง ๆ เขียนทับได้ และลิงก์ที่ลูกค้าบุ๊กมาร์กไว้จะตายเงียบ
//     (docs/conventions/rule-must-be-enforced-not-described.md)

import { describe, expect, it, vi, beforeEach } from 'vitest'

const shopUpdate = vi.fn()
const shopFindUnique = vi.fn()
const shopFindUniqueOrThrow = vi.fn()
const shopFindFirst = vi.fn()
const userFindFirst = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    shop: {
      update: (...a: unknown[]) => shopUpdate(...a),
      findUnique: (...a: unknown[]) => shopFindUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => shopFindUniqueOrThrow(...a),
      findFirst: (...a: unknown[]) => shopFindFirst(...a),
    },
    user: { findFirst: (...a: unknown[]) => userFindFirst(...a) },
  },
}))

const { updateShop, setShopSlug } = await import('./shop.service')

beforeEach(() => {
  shopUpdate.mockReset().mockResolvedValue({ id: 's1' })
  shopFindUnique.mockReset()
  shopFindUniqueOrThrow.mockReset().mockResolvedValue({ id: 's1' })
  shopFindFirst.mockReset().mockResolvedValue(null)
  userFindFirst.mockReset().mockResolvedValue(null)
})

/** ค่าที่ prisma.shop.update ถูกเรียกด้วยจริงในครั้งล่าสุด */
const lastUpdateData = () => shopUpdate.mock.calls.at(-1)?.[0]?.data as Record<string, unknown>

describe('updateShop — พิกัดร้าน', () => {
  it('[blocker] พิกัดที่ถูกต้องต้องถูกเขียนลงฐานจริง ไม่ใช่ถูกกรองทิ้ง', async () => {
    await updateShop('s1', { latitude: 13.7563, longitude: 100.5018 })
    expect(lastUpdateData()).toMatchObject({ latitude: 13.7563, longitude: 100.5018 })
  })

  it('[blocker] มาตัวเดียว → GEO_PAIR_REQUIRED (หมุดที่มีแต่ละติจูดวางบนแผนที่ไม่ได้)', async () => {
    await expect(updateShop('s1', { latitude: 13.75 })).rejects.toThrow('GEO_PAIR_REQUIRED')
    await expect(updateShop('s1', { longitude: 100.5 })).rejects.toThrow('GEO_PAIR_REQUIRED')
    expect(shopUpdate).not.toHaveBeenCalled()
  })

  it('[blocker] 0,0 ต้องไม่ผ่าน — เป็นค่าตั้งต้นของตัวแปรที่ลืมเซ็ต ไม่ใช่ตำแหน่งร้านไทย', async () => {
    await expect(updateShop('s1', { latitude: 0, longitude: 0 })).rejects.toThrow('GEO_OUT_OF_RANGE')
    expect(shopUpdate).not.toHaveBeenCalled()
  })

  it('[blocker] lat/lng สลับกันต้องไม่ผ่าน (100.5, 13.75 = นอกกรอบทั้งคู่)', async () => {
    await expect(updateShop('s1', { latitude: 100.5, longitude: 13.75 })).rejects.toThrow(
      'GEO_OUT_OF_RANGE',
    )
  })

  it('ไม่ส่งพิกัดมาเลย → อัปเดตฟิลด์อื่นได้ตามปกติ ไม่ไปยุ่งกับหมุดเดิม', async () => {
    await updateShop('s1', { shopName: 'ร้านใหม่' })
    const data = lastUpdateData()
    expect(data).toMatchObject({ shopName: 'ร้านใหม่' })
    expect('latitude' in data).toBe(false)
    expect('longitude' in data).toBe(false)
  })

  it('ยังกันฟิลด์นอก allow-list เหมือนเดิม — userId/slug/kind ห้ามหลุดเข้า update', async () => {
    await updateShop('s1', {
      shopName: 'ร้าน',
      // ค่าที่ผู้ใช้ยัดมาใน body ได้เพราะ route ส่ง request.json() ดิบเข้ามา
      ...({ userId: 'attacker', slug: 'stolen', kind: 'BUSINESS', deletedAt: 'x' } as object),
    })
    const data = lastUpdateData()
    expect(data).toEqual({ shopName: 'ร้าน' })
  })
})

describe('setShopSlug — ตั้งได้ครั้งเดียว', () => {
  it('[blocker] ร้านที่มี slug แล้ว ห้ามเขียนทับด้วยค่าใหม่', async () => {
    shopFindUnique.mockResolvedValue({ slug: 'my-shop' })
    await expect(setShopSlug('s1', 'other-shop')).rejects.toThrow('SLUG_ALREADY_SET')
    expect(shopUpdate).not.toHaveBeenCalled()
  })

  it('ตั้งค่าเดิมซ้ำ = ผ่านแบบไม่เขียนอะไร (กดปุ่มซ้ำ/เน็ตกระตุกต้องไม่กลายเป็น error)', async () => {
    shopFindUnique.mockResolvedValue({ slug: 'my-shop' })
    await expect(setShopSlug('s1', 'my-shop')).resolves.toBeTruthy()
    expect(shopUpdate).not.toHaveBeenCalled()
  })

  it('ร้านที่ยังไม่มี slug → ตั้งได้ตามปกติ', async () => {
    shopFindUnique.mockResolvedValue({ slug: null })
    await setShopSlug('s1', 'brand-new')
    expect(lastUpdateData()).toMatchObject({ slug: 'brand-new' })
  })

  it('ยังกัน slug ที่มีคนใช้แล้วเหมือนเดิม — ด่านเดิมต้องไม่หายไปกับด่านใหม่', async () => {
    shopFindUnique.mockResolvedValue({ slug: null })
    shopFindFirst.mockResolvedValue({ id: 'other-shop' }) // isSlugAvailable → false
    await expect(setShopSlug('s1', 'taken-one')).rejects.toThrow('SLUG_UNAVAILABLE')
    expect(shopUpdate).not.toHaveBeenCalled()
  })
})
