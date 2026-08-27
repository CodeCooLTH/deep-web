/**
 * [blocker] แถวที่ 2 ของไทม์ไลน์พัสดุ (ขากลับ) — 2026-08-25
 *
 * สิ่งที่กัน (ทุกข้อพังเงียบ ไม่มี type error ไม่มีอะไรฟ้อง):
 *   - ออเดอร์ปกติต้อง **ไม่มี** แถว 2 เลย (เกือบทั้งระบบอยู่ในเคสนี้)
 *   - จำนวนจุดต้องผันตามข้อมูลที่มีจริง ไม่ใช่ 4 จุดตายตัว (จุดที่ไม่มีวันสว่าง = โกหก)
 *   - จุดสว่างตัดสินจาก **สถานะ** ไม่ใช่จากคอลัมน์เวลา (6/12 ใบบน prod ถึงร้านแล้วแต่ไม่มีเวลา)
 *   - เคสคืนของต้องงอกจากจุด **เขียว** ห้ามย้อนจุดที่ 4 ของแถว 1 เป็นส้ม
 *   - ผู้ซื้อกับผู้ขายต้องต่างกัน **เฉพาะคำที่มีคำว่า "ร้าน"** ที่เหลือใช้ร่วม
 *
 * แดง = ห้าม merge
 */
import { describe, it, expect } from 'vitest'

import { describeReturnLeg, FORWARD_OUTCOME, type ReturnLegInput } from '../return-timeline'

const seller = (over: Partial<ReturnLegInput> = {}): ReturnLegInput => ({
  audience: 'seller',
  ...over,
})
const buyer = (over: Partial<ReturnLegInput> = {}): ReturnLegInput => ({
  audience: 'buyer',
  ...over,
})

describe('[blocker] ออเดอร์ปกติต้องไม่มีแถว 2', () => {
  /**
   * ไล่ทั้งตารางสถานะจริง ไม่ใช่หยิบมา 2-3 ตัว — ถ้าใครเผลอทำให้สถานะใดสถานะหนึ่ง
   * ผลิตแถว 2 ขึ้นมา ทุกออเดอร์ที่ผ่านสถานะนั้นจะโตขึ้นเป็นสองแถวพร้อมกันทั้งระบบ
   */
  const NO_RETURN_LEG = [
    'order_success', 'picked_up', 'with_branch', 'in_transit', 'progress',
    'delivered', 'payment_success', 'no_courier', 'cod_refund',
    'is_expired', 'cancelled', 'close',
  ]
  for (const code of NO_RETURN_LEG) {
    it(`\`${code}\` → null`, () => {
      expect(describeReturnLeg(seller({ carrierStatus: code }))).toBeNull()
    })
  }

  it('ไม่มี carrierStatus เลย (ร้านแจ้งเลขเอง) → null', () => {
    expect(describeReturnLeg(seller())).toBeNull()
    expect(describeReturnLeg(seller({ carrierStatus: null }))).toBeNull()
  })

  /**
   * 🛑 `issue`/`cannot_pickup` ห้ามผลิตแถว 2 — `issue` ส่วนใหญ่จบด้วยส่งสำเร็จ
   * แถบที่ขึ้นขากลับตรงนั้นคือแถบที่ทำนายอนาคตผิด และ `cannot_pickup` คือ
   * "ขนส่งยังไม่เคยมารับของ" ซึ่งไกลจากการตีกลับคนละเรื่อง
   */
  it('พัสดุมีปัญหา (issue / cannot_pickup) → null ไม่ใช่แถว 2', () => {
    expect(describeReturnLeg(seller({ carrierStatus: 'issue' }))).toBeNull()
    expect(describeReturnLeg(seller({ carrierStatus: 'cannot_pickup' }))).toBeNull()
  })

  it('ใบคืนที่ถูกยกเลิกแล้ว → null (โควตาคืนกลับ เรื่องจบ)', () => {
    const leg = describeReturnLeg(
      seller({ orderReturn: { status: 'CANCELLED', trackingSource: 'ISHIP' } }),
    )
    expect(leg).toBeNull()
  })
})

/**
 * 🛑 **3 จุด ไม่ใช่ 4** — พิสูจน์กับข้อมูล prod 2026-08-27:
 *
 * iShip ส่ง *รหัสสถานะ* ของขากลับมาแค่ 2 ตัว (`return` / `return_success`) — ตรวจ event
 * ทั้งหมดหลังพัสดุเริ่มตีกลับ (45 + 6 ครั้ง จาก 13 ใบ) **ไม่มีรหัสอื่นเลยสักตัว**
 *
 * ขั้นย่อยที่ละเอียดกว่า (`ถึงศูนย์คัดแยก` / `อยู่ระหว่างการขนส่ง`) มีจริงแต่ซ่อนใน
 * `statusDesc` ซึ่งเป็นข้อความอิสระ **และมีแค่ SPX ที่ส่งมา — Flash ไม่ส่งเลยสักตัว**
 * (prod: SPX 6 ใบมีครบ · Flash 6 ใบเป็น 0 ทุกช่อง) ⇒ 4 จุดตายตัวจะทำให้ครึ่งหนึ่งของใบ
 * มี 2 จุดที่ไม่มีวันสว่าง ซึ่งผิดหลักเดียวกับที่ทำให้จำนวนจุดผันตามข้อมูลตั้งแต่แรก
 *
 * จุดที่ 3 คือ `ส่งไม่สำเร็จ` — *เหตุ* ที่ทำให้แถวขากลับมีอยู่ และเป็นตัวแทนของแถวขาไป
 * ที่ถูกถอดออกไป (user สั่ง 2026-08-27: "ถ้ามีการตีกลับ ไม่จำเป็นต้องแสดงขาไป")
 */
describe('[blocker] เคสตีกลับ (BOUNCE) — 3 จุด แถวเดียว ไม่วาดขาไป', () => {
  it('กำลังตีกลับ → อยู่จุดกลาง ปลายทางยังไม่ถึง', () => {
    const leg = describeReturnLeg(seller({ carrierStatus: 'return' }))!
    expect(leg.kind).toBe('BOUNCE')
    expect(leg.dots.map((d) => d.label)).toEqual(['ส่งไม่สำเร็จ', 'กำลังตีกลับ', 'กลับถึงร้าน'])
    expect(leg.stage).toBe(1)
    expect(leg.originTone).toBe('warning')
  })

  it('ต้องเป็น standalone — ห้ามวาดแถวขาไปคู่กัน', () => {
    expect(describeReturnLeg(seller({ carrierStatus: 'return' }))!.standalone).toBe(true)
    expect(describeReturnLeg(seller({ carrierStatus: 'return_success' }))!.standalone).toBe(true)
  })

  it('เคสคืนของยังต้องวาดขาไป — ขาไปสำเร็จจริง เป็นข้อเท็จจริงที่ต้องคงไว้ (00055)', () => {
    const leg = describeReturnLeg(
      seller({ orderReturn: { status: 'REQUESTED', trackingSource: 'ISHIP' } }),
    )!
    expect(leg.standalone).toBe(false)
  })

  it('ถึงร้านแล้ว → จุดสุดท้ายสว่าง', () => {
    const leg = describeReturnLeg(seller({ carrierStatus: 'return_success' }))!
    expect(leg.stage).toBe(leg.dots.length - 1)
  })

  /**
   * 🛑 หัวใจ: จุดสว่างมาจาก **สถานะ** ไม่ใช่จาก `returnedAt`
   *
   * บน prod 2026-08-25 มี 12 ใบที่ `carrierStatus='return_success'` แต่มี event รองรับ
   * แค่ 6 ใบ — อีก 6 ใบสถานะมาจากรอบ poll ที่ไม่ผ่าน `ShipmentEvent` ⇒ `returnedAt=null`
   * ถ้าเผลอไปตัดสินจุดด้วยคอลัมน์เวลา ครึ่งหนึ่งของใบตีกลับจะไม่มีจุดสุดท้ายเลย
   */
  it('ถึงร้านแล้วแต่ไม่มีเวลา (6/12 ใบบน prod) → จุดยังต้องสว่าง เวลาเป็น null', () => {
    const leg = describeReturnLeg(
      seller({ carrierStatus: 'return_success', returnedAt: null, returnStartedAt: null }),
    )!
    expect(leg.stage).toBe(leg.dots.length - 1)
    expect(leg.arrivedAt).toBeNull()
    expect(leg.startedAt).toBeNull()
  })

  it('มีเวลาก็ต้องแปลงเป็น Date ให้ใช้ได้ (รับได้ทั้ง Date และสตริง)', () => {
    const leg = describeReturnLeg(
      seller({
        carrierStatus: 'return_success',
        returnStartedAt: '2026-08-20T07:32:00.000Z',
        returnedAt: new Date('2026-08-24T04:49:13.000Z'),
      }),
    )!
    expect(leg.startedAt?.toISOString()).toBe('2026-08-20T07:32:00.000Z')
    expect(leg.arrivedAt?.toISOString()).toBe('2026-08-24T04:49:13.000Z')
  })

  it('เวลาที่พังต้องกลายเป็น null ไม่ใช่ Invalid Date ที่ไหลไปโผล่บนจอ', () => {
    const leg = describeReturnLeg(seller({ carrierStatus: 'return', returnStartedAt: 'ไม่ใช่วันที่' }))!
    expect(leg.startedAt).toBeNull()
  })
})

describe('[blocker] เคสคืนของ (RETURN) — จำนวนจุดผันตามแหล่งข้อมูล', () => {
  const cases = [
    { src: 'ISHIP', labels: ['ลูกค้าแจ้งคืน', 'รับเข้าระบบ', 'กำลังจัดส่ง', 'กลับถึงร้าน'] },
    { src: 'MANUAL', labels: ['ลูกค้าแจ้งคืน', 'กำลังจัดส่ง', 'กลับถึงร้าน'] },
    { src: 'NONE', labels: ['ลูกค้าแจ้งคืน', 'กลับถึงร้าน'] },
  ]
  for (const c of cases) {
    it(`trackingSource=${c.src} → ${c.labels.length} จุด`, () => {
      const leg = describeReturnLeg(
        seller({ orderReturn: { status: 'REQUESTED', trackingSource: c.src } }),
      )!
      expect(leg.kind).toBe('RETURN')
      expect(leg.dots.map((d) => d.label)).toEqual(c.labels)
    })
  }

  /**
   * 🛑 ของถึงมือลูกค้าจริง ระบบยืนยันไปแล้ว (`canCreateReturn` บังคับ) ⇒ จุดที่ 4 ของแถว 1
   * ต้องคงเป็นเขียว การย้อนเป็นส้มคือการลบหลักฐานว่าการส่งสำเร็จ ซึ่งกระทบ 00055
   * ที่แยก "ไม่เคยได้รับ" กับ "ได้รับแล้วคืน" เป็นคนละเรื่องโดยเจตนา
   */
  it('ต้องงอกจากจุดเขียว ไม่ใช่ส้ม', () => {
    const leg = describeReturnLeg(
      seller({ orderReturn: { status: 'REQUESTED', trackingSource: 'ISHIP' } }),
    )!
    expect(leg.originTone).toBe('success')
  })

  it('RECEIVED = ถึงปลายทางเสมอ ไม่ว่ามีกี่จุด', () => {
    for (const c of cases) {
      const leg = describeReturnLeg(
        seller({ orderReturn: { status: 'RECEIVED', trackingSource: c.src } }),
      )!
      expect(leg.stage, c.src).toBe(leg.dots.length - 1)
    }
  })

  it('SHIPPING = ก่อนปลายทาง 1 จุด · REQUESTED = จุดแรก', () => {
    const iship = (status: string) =>
      describeReturnLeg(seller({ orderReturn: { status, trackingSource: 'ISHIP' } }))!
    expect(iship('SHIPPING').stage).toBe(2)
    expect(iship('REQUESTED').stage).toBe(0)
    // เคส 2 จุดต้องไม่ติดลบ
    const none = describeReturnLeg(
      seller({ orderReturn: { status: 'SHIPPING', trackingSource: 'NONE' } }),
    )!
    expect(none.stage).toBe(0)
  })

  /**
   * ใบคืนต้องชนะสถานะขนส่งของพัสดุ **ขาไป** เสมอ — ถ้ามีใบคืนอยู่แปลว่าของเคยถึงมือ
   * ลูกค้าแล้วแน่นอน สถานะขาไปที่ค้างอยู่ไม่ควรมาเปลี่ยนเรื่อง
   */
  it('มีใบคืน + carrierStatus ขาไปเป็น delivered → ต้องได้ RETURN ไม่ใช่ null', () => {
    const leg = describeReturnLeg(
      seller({
        carrierStatus: 'delivered',
        orderReturn: { status: 'SHIPPING', trackingSource: 'MANUAL' },
      }),
    )!
    expect(leg.kind).toBe('RETURN')
  })
})

describe('[blocker] คำฝั่งผู้ซื้อต่างเฉพาะจุดที่มีคำว่า "ร้าน"', () => {
  it('BOUNCE — ต่างเฉพาะ 2 จุดหลัง จุดแรกใช้คำร่วม', () => {
    const s = describeReturnLeg(seller({ carrierStatus: 'return_success' }))!
    const b = describeReturnLeg(buyer({ carrierStatus: 'return_success' }))!
    expect(s.dots.map((d) => d.label)).toEqual(['ส่งไม่สำเร็จ', 'กำลังตีกลับ', 'กลับถึงร้าน'])
    expect(b.dots.map((d) => d.label)).toEqual(['ส่งไม่สำเร็จ', 'กำลังส่งกลับร้าน', 'ของกลับถึงร้าน'])
  })

  it('RETURN — ต่างเฉพาะหัวกับท้าย จุดกลางใช้คำร่วม', () => {
    const o = { status: 'REQUESTED', trackingSource: 'ISHIP' }
    const s = describeReturnLeg(seller({ orderReturn: o }))!
    const b = describeReturnLeg(buyer({ orderReturn: o }))!
    expect(s.dots.map((d) => d.label)).toEqual(['ลูกค้าแจ้งคืน', 'รับเข้าระบบ', 'กำลังจัดส่ง', 'กลับถึงร้าน'])
    expect(b.dots.map((d) => d.label)).toEqual(['คุณแจ้งคืน', 'รับเข้าระบบ', 'กำลังจัดส่ง', 'ร้านได้รับแล้ว'])
    // จุดกลางต้องเหมือนกันเป๊ะ — สองมุมมองไม่ควรแตกคำโดยไม่จำเป็น
    expect(s.dots[1].label).toBe(b.dots[1].label)
    expect(s.dots[2].label).toBe(b.dots[2].label)
  })

  it('ไอคอนต้องเหมือนกันทุกมุมมอง — มุมมองเปลี่ยนคำ ไม่เปลี่ยนรูป', () => {
    const o = { status: 'RECEIVED', trackingSource: 'ISHIP' }
    const s = describeReturnLeg(seller({ orderReturn: o }))!
    const b = describeReturnLeg(buyer({ orderReturn: o }))!
    expect(s.dots.map((d) => d.icon)).toEqual(b.dots.map((d) => d.icon))
  })
})

describe('[blocker] ไอคอนของจุดปลายทางต้องแยกจาก "ส่งสำเร็จ" ด้วยรูปร่าง', () => {
  /**
   * 🛑 สองจุดนี้ใช้ **สีเขียวเท่ากันเป๊ะ** โดยมติ user (2026-08-24 "เขียวเหมือนกัน")
   * ⇒ รูปร่างคือสิ่งเดียวที่เหลือให้แยก ถ้าไอคอนซ้ำกันเมื่อไร WCAG 1.4.1 พังทันที
   * และเป็นบั๊กเดิมเป๊ะที่งานนี้ถูกสร้างมาแก้
   */
  it('ปลายทางขากลับ ≠ ไอคอนของ "ส่งสำเร็จ"', () => {
    const leg = describeReturnLeg(seller({ carrierStatus: 'return_success' }))!
    const arrived = leg.dots[leg.dots.length - 1].icon
    expect(arrived).not.toBe(FORWARD_OUTCOME.delivered.icon)
    expect(arrived).not.toBe(FORWARD_OUTCOME.failed.icon)
  })

  it('จุดออกเดินทางของสองกลไกต้องคนละไอคอน (คนละเรื่องกันจริง)', () => {
    const bounce = describeReturnLeg(seller({ carrierStatus: 'return' }))!
    const ret = describeReturnLeg(
      seller({ orderReturn: { status: 'REQUESTED', trackingSource: 'NONE' } }),
    )!
    expect(bounce.dots[0].icon).not.toBe(ret.dots[0].icon)
  })
})
