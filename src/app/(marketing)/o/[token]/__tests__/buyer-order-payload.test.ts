import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { BUYER_ORDER_DIR, stripComments } from '@/lib/__tests__/helpers/buyer-order-sources'

/**
 * [blocker] payload ที่ page.tsx ส่งลง client (flight) — feature 00068 B2 (TFR-012)
 *
 * page.tsx เป็น RSC ที่ประกอบจาก Prisma จริง เรียกในเทสหน่วยไม่ได้ จึงสแกนซอร์สที่ตัด
 * คอมเมนต์แล้ว (แบบเดียวกับเทสพี่น้องในโฟลเดอร์นี้) — ด่านนี้ล็อกจุดที่ PII/secret รั่วได้จริง
 */
const src = stripComments(readFileSync(join(BUYER_ORDER_DIR, 'page.tsx'), 'utf8'))

describe('page.tsx payload allow-list', () => {
  it('ShopChannel select ได้ 5 คีย์เท่านั้น (accessTokenEnc ห้ามหลุด)', () => {
    const m = src.match(/prisma\.shopChannel\.findMany\(\{[\s\S]*?select:\s*\{([^}]*)\}/)
    expect(m, 'ไม่พบ shopChannel.findMany select').not.toBeNull()
    const keys = m![1].split(',').map((k) => k.split(':')[0].trim()).filter(Boolean).sort()
    expect(keys).toEqual(['avatarUrl', 'externalId', 'followerCount', 'name', 'provider'])
    expect(src).not.toMatch(/shopChannel\.findMany\(\{[^)]*include:/)
  })

  it('พัสดุผ่าน buildBuyerShipmentView ตัวเดียว ไม่ประกอบเองซ้ำใน page', () => {
    expect(src).toContain('...buildBuyerShipmentView(order)')
    expect(src).not.toMatch(/order\.shipments\??\.\[0\]/)
  })

  it('money.depositReceived มาจาก computeOrderMoney (m) ไม่ตีความจาก depositAgreed', () => {
    expect(src).toContain('depositReceived: m.depositReceived')
  })

  it('ปกร้านส่งเป็น variant lg ผ่านตัวช่วยกลาง ไม่ส่งต้นฉบับเป็นฟิลด์ใหม่', () => {
    expect(src).toContain("coverImageLg: variantUrlOf(order.shop.coverImage, 'lg')")
  })

  it('ธงใหม่ derive ที่ server: hasPayoutAccount / isNewShop', () => {
    expect(src).toContain('hasPayoutAccount: order.payoutSnapshot != null')
    expect(src).toContain('isNewShop: confirmedCount <= 0')
    // completedOrders คงความหมาย null = ไม่รู้/ยังไม่มีประวัติ
    expect(src).toContain('completedOrders: confirmedCount > 0 ? confirmedCount : null')
  })

  it('ไม่ spread order ทั้งก้อนลง payload (PII: buyerContact/shippingAddress)', () => {
    expect(src).not.toMatch(/\.\.\.order[,\s}]/)
  })
})
