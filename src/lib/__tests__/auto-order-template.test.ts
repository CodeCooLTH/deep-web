import { describe, it, expect } from 'vitest'

import {
  AUTO_ORDER_TEMPLATE,
  DEFAULT_TRIGGER_PHRASE,
} from '@/app/(paces)/seller/(dashboard)/settings/auto-reply/order-agent/template'
import { parseAutoOrderMessage, matchesTriggerPhrase } from '@/lib/auto-order-parser'
import { computeItemsTotal, deriveDraftReasons } from '@/lib/auto-order-reasons'

/**
 * 🛑 [blocker] แม่แบบที่หน้าจอบอกให้ผู้ขายพิมพ์ตาม **ต้องผ่านตัวแกะได้จริง**
 *
 * เทมเพลตที่ตัวเองอ่านไม่ผ่าน = happy path ของทั้งฟีเจอร์ไม่มีวันสำเร็จ และผู้ขายจะโทษตัวเอง
 * ว่าพิมพ์ผิดทั้งที่พิมพ์ตามทุกตัวอักษร — เคยเกิดจริงตอน A3 (สูตรเทียบยอดลืมหักส่วนลด
 * ทำให้ตัวอย่างของฟีเจอร์เองได้ TOTAL_MISMATCH ทุกครั้ง)
 */
describe('แม่แบบสรุปคำสั่งซื้อ (00061 BR-ACO-11)', () => {
  const parsed = parseAutoOrderMessage(AUTO_ORDER_TEMPLATE)

  it('[blocker] วลีจุดชนวนเริ่มต้นต้อง match กับแม่แบบ', () => {
    expect(matchesTriggerPhrase(AUTO_ORDER_TEMPLATE, [DEFAULT_TRIGGER_PHRASE])).toBeTruthy()
  })

  it('[blocker] แกะได้ครบทุกช่องที่จำเป็น', () => {
    expect(parsed.customerName).toBe('สมชาย ใจดี')
    expect(parsed.phone).toBe('0812345678')
    expect(parsed.province).toBeTruthy()
    expect(parsed.postcode).toBe('20000')
    expect(parsed.items).toHaveLength(2)
    expect(parsed.items[0]).toMatchObject({ qty: 2, price: 250 })
    // ไม่ระบุจำนวน = 1 ชิ้น (ไม่ใช่ 0) และราคาต้องมี
    expect(parsed.items[1]).toMatchObject({ qty: 1, price: 390 })
    expect(parsed.discount).toBe(50)
    expect(parsed.statedTotal).toBe(840)
  })

  it('[blocker] ยอดที่คำนวณได้ต้องตรงกับ "ยอดรวม:" ในแม่แบบเป๊ะ', () => {
    // 2×250 + 390 − 50 = 840 — ถ้าสูตรลืมหักส่วนลดจะได้ 890 แล้วตัวอย่างตกร่างทุกครั้ง
    expect(computeItemsTotal({ items: parsed.items, discount: parsed.discount })).toBe(
      parsed.statedTotal,
    )
  })

  it('[blocker] แม่แบบต้องไม่ตกร่างด้วยเหตุผลเชิงเนื้อหาสักข้อ (สมมติสินค้าจับคู่ได้)', () => {
    const reasons = deriveDraftReasons({
      phone: parsed.phone,
      shipsGoods: true,
      address: { line1: parsed.addressLine, province: parsed.province, postcode: parsed.postcode },
      items: parsed.items.map((i) => ({
        rawName: i.rawName,
        matchedProductId: 'p1', // ร้านจริงต้องมีสินค้าชื่อนี้ — เทสนี้ตรวจส่วนที่เหลือ
        qty: i.qty,
        price: i.price,
      })),
      discount: parsed.discount,
      statedTotal: parsed.statedTotal,
      messageAtMs: Date.now(),
      nowMs: Date.now(),
    })
    expect(reasons, `แม่แบบตกร่างเพราะ: ${reasons.join(', ')}`).toEqual([])
  })
})
