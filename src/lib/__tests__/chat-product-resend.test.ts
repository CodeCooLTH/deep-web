/**
 * [blocker] กันกดส่งการ์ดสินค้าซ้ำบนช่องทางนอก
 *
 * 🛑 แดง = กดส่งการ์ดรัว ๆ แล้วลูกค้าได้การ์ดซ้ำ และบน LINE เสียโควตาจริงเพิ่มทุกครั้ง
 * (reply token ใช้ได้ครั้งเดียว ครั้งที่สองตกไป push ซึ่งนับเงิน — ดูหัวไฟล์ของ lib)
 *
 * เทสข้อ "ครั้งก่อนล้ม" สำคัญไม่แพ้ข้อกันซ้ำ: ด่านกันซ้ำที่เผลอบล็อกการส่งใหม่หลังส่งล้ม
 * จะทำให้การ์ดที่ยิงไม่ออกส่งซ้ำไม่ได้เลยจนกว่าจะมีข้อความอื่นมาคั่น
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDuplicateProductSend, type RecentProductMessage } from '../chat-product-resend'

function sent(productRefIds: string[]): RecentProductMessage {
  return { type: 'PRODUCT', productRefIds, deliveryStatus: 'SENT' }
}

describe('isDuplicateProductSend', () => {
  it('[blocker] กดส่งการ์ดใบเดิมซ้ำติดกัน = ซ้ำ', () => {
    expect(isDuplicateProductSend([sent(['p1'])], [['p1']])).toBe(true)
  })

  it('[blocker] กดส่ง carousel ชุดเดิมซ้ำติดกัน = ซ้ำ', () => {
    expect(isDuplicateProductSend([sent(['p1', 'p2', 'p3'])], [['p1', 'p2', 'p3']])).toBe(true)
  })

  it('[blocker] ชุดที่แบ่งเป็นหลายข้อความ ต้องเทียบครบทุกข้อความตามลำดับ', () => {
    // ส่งไปแล้ว: ข้อความ 1 = [p1,p2] · ข้อความ 2 = [p3] → ประวัติเรียงใหม่→เก่าคือ [p3], [p1,p2]
    const recent = [sent(['p3']), sent(['p1', 'p2'])]
    expect(isDuplicateProductSend(recent, [['p1', 'p2'], ['p3']])).toBe(true)
    // ชุดที่แบ่งคนละแบบ = คนละการส่ง ไม่ใช่กดซ้ำ
    expect(isDuplicateProductSend(recent, [['p1'], ['p2', 'p3']])).toBe(false)
  })

  it('สินค้าคนละชิ้น = ไม่ซ้ำ', () => {
    expect(isDuplicateProductSend([sent(['p1'])], [['p2']])).toBe(false)
  })

  it('ของชุดเดียวกันแต่สลับลำดับ = ไม่ซ้ำ (ลำดับใน carousel คือเจตนาของผู้ขาย)', () => {
    expect(isDuplicateProductSend([sent(['p1', 'p2'])], [['p2', 'p1']])).toBe(false)
  })

  it('เป็นชุดย่อย/ชุดใหญ่กว่าของเดิม = ไม่ซ้ำ', () => {
    expect(isDuplicateProductSend([sent(['p1', 'p2'])], [['p1']])).toBe(false)
    expect(isDuplicateProductSend([sent(['p1'])], [['p1', 'p2']])).toBe(false)
  })

  it('มีข้อความอื่นคั่นอยู่ = เป็นการส่งใหม่จริง ไม่ใช่กดซ้ำ', () => {
    const recent = [
      { type: 'TEXT', productRefIds: [], deliveryStatus: 'SENT' },
      sent(['p1']),
    ]
    expect(isDuplicateProductSend(recent, [['p1']])).toBe(false)
  })

  /**
   * ด่าน `type !== 'PRODUCT'` ต้องมีเทสของตัวเอง ไม่ใช่พึ่งเคส "ข้อความอื่นคั่น" ข้างบน — เคสนั้น
   * ผ่านได้แม้ถอดด่านนี้ออก เพราะข้อความ TEXT มี `productRefIds` ว่างจึงตกที่การเทียบความยาวแทน
   * (พิสูจน์ด้วย mutation แล้วว่ารอด) เทสนี้จึงบังคับให้ชนิดเป็นตัวตัดสินจริง ๆ
   */
  it('[blocker] ข้อความชนิดอื่นที่มี productRefIds ค้างอยู่ ต้องไม่ถูกนับเป็นการ์ดสินค้า', () => {
    const notAProductCard: RecentProductMessage = {
      type: 'TEXT',
      productRefIds: ['p1'],
      deliveryStatus: 'SENT',
    }
    expect(isDuplicateProductSend([notAProductCard], [['p1']])).toBe(false)
  })

  /**
   * (CR 2026-08-23, E-11) เส้นทางช่องทางนอกเขียนแถวเป็น `QUEUED` ก่อนตอบ client แล้วยิงทีหลัง —
   * ช่วงนั้นคือช่วงที่ผู้ขาย "กดแล้วยังไม่เห็นอะไรเกิดขึ้น" ⇒ **เป็นช่วงที่คนกดซ้ำมากที่สุด**
   * ถ้า QUEUED ไม่บล็อก การกดรัวครั้งเดียวจะได้ 2 แถวที่ทั้งคู่ถูกยิงออกไปจริง ลูกค้าได้การ์ดซ้ำ
   * และบน LINE เสียโควตาเพิ่มด้วย (reply token ใช้ได้ครั้งเดียว ใบที่สองตกไป push ที่นับเงิน)
   */
  it('[blocker] ครั้งก่อนยังเข้าคิวอยู่ (QUEUED) = กำลังจะส่ง ต้องบล็อกการกดซ้ำ', () => {
    const queued: RecentProductMessage = {
      type: 'PRODUCT',
      productRefIds: ['p1'],
      deliveryStatus: 'QUEUED',
    }
    expect(isDuplicateProductSend([queued], [['p1']])).toBe(true)
    // และต้องบล็อกทั้งชุดที่แบ่งหลายข้อความด้วย ไม่ใช่เฉพาะใบเดียว
    expect(
      isDuplicateProductSend(
        [queued, { type: 'PRODUCT', productRefIds: ['p2', 'p3'], deliveryStatus: 'QUEUED' }],
        [['p2', 'p3'], ['p1']],
      ),
    ).toBe(true)
  })

  it('[blocker] ครั้งก่อนส่งไม่สำเร็จ (FAILED) ต้องส่งใหม่ได้ ห้ามนับเป็นซ้ำ', () => {
    const failed: RecentProductMessage = {
      type: 'PRODUCT',
      productRefIds: ['p1'],
      deliveryStatus: 'FAILED',
    }
    expect(isDuplicateProductSend([failed], [['p1']])).toBe(false)
  })

  it('สถานะที่ไม่ใช่ FAILED นับว่าถึงลูกค้าแล้วทั้งหมด (SENT/DELIVERED/แชทในแอป)', () => {
    for (const deliveryStatus of ['SENT', 'DELIVERED', null]) {
      expect(
        isDuplicateProductSend([{ type: 'PRODUCT', productRefIds: ['p1'], deliveryStatus }], [['p1']]),
      ).toBe(true)
    }
  })

  it('บทสนทนายังว่าง / ประวัติสั้นกว่าจำนวนข้อความที่จะส่ง = ไม่ซ้ำ', () => {
    expect(isDuplicateProductSend([], [['p1']])).toBe(false)
    expect(isDuplicateProductSend([sent(['p3'])], [['p1', 'p2'], ['p3']])).toBe(false)
  })

  it('ไม่มีอะไรจะส่ง = ไม่ซ้ำ (ปล่อยให้ด่าน 400 ของ route จัดการ ไม่ใช่ตีเป็นซ้ำ)', () => {
    expect(isDuplicateProductSend([sent(['p1'])], [])).toBe(false)
  })
})

/**
 * ฟังก์ชันถูกอย่างเดียวไม่พอ — ต้องพิสูจน์ว่า **มีคนเรียกมันจริง และเรียกก่อนยิงออก**
 *
 * บทเรียนตรงจาก retro 2026-08-11 (C-3): รอบก่อนเปิด backend การ์ดสินค้าให้ LINE เสร็จแล้ว push
 * ขึ้น prod โดยไม่มีปุ่มไหนในระบบเรียกมันเลยสักปุ่ม และ `tsc`/เทส/build เขียวหมด เพราะ "โค้ดที่
 * ไม่มีใครเรียก" ไม่ใช่ความผิดพลาดเชิงรูปแบบ. ด่านกันซ้ำที่วางไว้ *หลัง* ลูปส่ง ก็ผ่าน tsc
 * เหมือนกันทุกประการ แต่ไม่กันอะไรเลย
 */
describe('route ต้องเรียกด่านกันซ้ำก่อนยิงออกจริง', () => {
  const ROUTE = join(process.cwd(), 'src/app/api/chat/conversations/[id]/messages/route.ts')

  it('[blocker] เส้นทางช่องทางนอกต้องเรียก isDuplicateProductSend', () => {
    expect(readFileSync(ROUTE, 'utf8')).toContain('isDuplicateProductSend(')
  })

  /**
   * (CR 2026-08-23) จุดยิงเปลี่ยนจาก `sendOutboundMessage` เป็น `enqueueOutbound` — route เขียนแถว
   * `QUEUED` ก่อนตอบ client แล้วยิงจริงเบื้องหลัง. **ด่านยังต้องอยู่ก่อนจุดนั้นเหมือนเดิม** เพราะ
   * "เข้าคิวซ้ำ" = ยิงซ้ำแน่นอนในอีกไม่กี่วินาที (ตัวระบายคิวไม่มีทางรู้ว่าสองแถวนี้คือการกดซ้ำ)
   */
  it('[blocker] ต้องเรียก "ก่อน" การเข้าคิว enqueueOutbound ครั้งแรก ไม่ใช่หลัง', () => {
    const src = readFileSync(ROUTE, 'utf8')
    const guardAt = src.indexOf('isDuplicateProductSend(\n')
    const firstSendAt = src.indexOf('await enqueueOutbound(')
    expect(guardAt).toBeGreaterThan(-1)
    expect(firstSendAt).toBeGreaterThan(-1)
    expect(guardAt).toBeLessThan(firstSendAt)
  })
})
