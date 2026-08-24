// public-order-count.test.ts — ล็อกเส้นแบ่งของ "ออเดอร์ใบไหนนับเป็นผลงานร้านได้"
//
// ทำไมต้องมีเทส: กฎนี้เป็นกฎ **ต่อต้านการปั่นตัวเลข** บนหน้าที่คนใช้ตัดสินใจโอนเงิน
// ถ้ามีคนเผลอเติม `SHIPPED` หรือ `picked_up` เข้าไปในอนาคต **จะไม่มีอะไรพัง**:
// tsc เขียว build ผ่าน หน้าจอขึ้นตัวเลขสวยกว่าเดิมด้วยซ้ำ — สิ่งเดียวที่เปลี่ยนคือร้านปั่น
// ตัวเลขเองได้ ซึ่งขัดพันธกิจของทั้งแพลตฟอร์ม และไม่มีใครรู้จนกว่าจะมีคนโดนหลอก
//
// [blocker] แดงเมื่อไหร่ห้าม merge
// กฎเต็ม: docs/10 - Business Rules/Public Order Count.md

import { describe, expect, it } from 'vitest'

import { COUNTABLE_CARRIER_STATUSES, countableOrderWhere } from '../public-order-count'

describe('COUNTABLE_CARRIER_STATUSES', () => {
  it('[blocker] ไม่มี picked_up — บางเจ้ายิงตอนสร้างพัสดุ ไม่ใช่ตอนรับของจริง', () => {
    // ป้ายไทยของ picked_up คือ "พัสดุเข้าระบบ" และมีบันทึกว่า SPX ยิงตั้งแต่ตอนสร้าง
    // ถ้าเผลอนับ = ร้านกดสร้างพัสดุแล้วได้แต้มทันทีโดยไม่ต้องส่งของจริง
    expect(COUNTABLE_CARRIER_STATUSES).not.toContain('picked_up')
  })

  it('[blocker] ไม่มีสถานะที่แปลว่า "ไม่ได้ส่งจริง"', () => {
    for (const bad of ['order_success', 'no_courier', 'cancelled', 'is_expired']) {
      expect(COUNTABLE_CARRIER_STATUSES).not.toContain(bad)
    }
  })

  it('มีสถานะที่ขนส่งขยับพัสดุจริงแล้ว', () => {
    for (const ok of ['with_branch', 'in_transit', 'progress', 'delivered']) {
      expect(COUNTABLE_CARRIER_STATUSES).toContain(ok)
    }
  })
})

describe('countableOrderWhere', () => {
  const where = countableOrderWhere('shop1')

  it('scope ที่ร้านเสมอ', () => {
    expect(where.shopId).toBe('shop1')
  })

  it('[blocker] ใบที่ยกเลิก/คืนของแล้วไม่นับ ไม่ว่าพัสดุจะเดินไปถึงไหน', () => {
    /**
     * 🛑 `RETURNED` เพิ่มเข้ามาเมื่อ feature 00056 — ใบที่ลูกค้าคืนของครบแล้วมีพัสดุ **ขาไป**
     * ที่ `delivered` จริง จึงผ่านสาขา OR ข้างล่างได้ ถ้าไม่ตัดที่นี่ ผลงานบนโปรไฟล์สาธารณะ
     * จะยังนับใบที่การขายถูกยกเลิกไปแล้ว = ปัญหาเดียวกับที่ 00056 ตั้งใจแก้
     * (คืน **บางส่วน** ไม่เปลี่ยน Order.status จึงยังนับ — ถูกแล้ว เป็นการขายที่สำเร็จจริง)
     */
    expect(where.status).toEqual({ notIn: ['CANCELLED', 'RETURNED'] })
  })

  it('[blocker] นับได้ 2 ทางเท่านั้น: ผู้ซื้อยืนยัน หรือ ขนส่งขยับจริง', () => {
    const or = where.OR as Array<Record<string, unknown>>
    expect(or).toHaveLength(2)
    expect(or[0]).toEqual({ status: 'CONFIRMED' })
    expect(or[1]).toHaveProperty('shipments')
  })

  it('[blocker] ฝั่งพัสดุต้องเป็นใบจริงเท่านั้น (CREATED + ไม่ใช่ dry-run)', () => {
    // ห้ามใช้ status <> 'CANCELLED' ซึ่งนับใบ FAILED ด้วย — บั๊กที่เคยทำให้ระบบคิดว่ามีพัสดุ
    // ทั้งที่ไม่มีเลขพัสดุจริง
    const shipmentSome = (where.OR as Array<{ shipments?: { some?: Record<string, unknown> } }>)[1]!
      .shipments!.some!
    expect(shipmentSome.status).toBe('CREATED')
    expect(shipmentSome.isDryRun).toBe(false)
    expect(shipmentSome.carrierStatus).toEqual({ in: [...COUNTABLE_CARRIER_STATUSES] })
  })

  it('[blocker] ห้ามมี Order.status = SHIPPED เป็นเกณฑ์ (ร้านกดเอง = ปลอมได้)', () => {
    expect(JSON.stringify(where)).not.toContain('SHIPPED')
  })
})
