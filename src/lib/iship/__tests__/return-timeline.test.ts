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
import { RETURN_DISPATCH_PHRASE, isReturnDispatchEvent } from '../status'

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
describe('[blocker] เคสตีกลับ (BOUNCE) — แถวเดียว invert กับขาไป ไม่วาดขาไป', () => {
  it('กำลังตีกลับ → อยู่จุดกลาง ปลายทางยังไม่ถึง', () => {
    const leg = describeReturnLeg(seller({ carrierStatus: 'return' }))!
    expect(leg.kind).toBe('BOUNCE')
    expect(leg.dots.map((d) => d.label)).toEqual(['พัสดุมีปัญหา', 'กำลังตีกลับ', 'ถึงร้านค้า'])
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
    { src: 'ISHIP', labels: ['ลูกค้าแจ้งคืน', 'รับเข้าระบบ', 'กำลังจัดส่ง', 'ถึงร้านค้า'] },
    { src: 'MANUAL', labels: ['ลูกค้าแจ้งคืน', 'กำลังจัดส่ง', 'ถึงร้านค้า'] },
    { src: 'NONE', labels: ['ลูกค้าแจ้งคืน', 'ถึงร้านค้า'] },
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
    expect(s.dots.map((d) => d.label)).toEqual(['พัสดุมีปัญหา', 'กำลังตีกลับ', 'ถึงร้านค้า'])
    expect(b.dots.map((d) => d.label)).toEqual(['พัสดุมีปัญหา', 'กำลังส่งกลับร้าน', 'ของกลับถึงร้าน'])
  })

  it('RETURN — ต่างเฉพาะหัวกับท้าย จุดกลางใช้คำร่วม', () => {
    const o = { status: 'REQUESTED', trackingSource: 'ISHIP' }
    const s = describeReturnLeg(seller({ orderReturn: o }))!
    const b = describeReturnLeg(buyer({ orderReturn: o }))!
    expect(s.dots.map((d) => d.label)).toEqual(['ลูกค้าแจ้งคืน', 'รับเข้าระบบ', 'กำลังจัดส่ง', 'ถึงร้านค้า'])
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

describe('[blocker] จุดที่ 4 "กำลังส่ง" (ขากลับ) — โผล่เฉพาะเมื่อขนส่งบอกจริง', () => {
  /**
   * 🛑 ทำไมไม่ใช่ 4 จุดตายตัว (user ถามตรง ๆ ว่า "มันต้องมี 4 step ป่ะ")
   *
   * iShip ส่ง **รหัสสถานะ** ของขากลับมาแค่ 2 ตัว · ขั้นที่ละเอียดกว่าอยู่ใน `statusDesc`
   * ซึ่งเป็นข้อความอิสระ และ **มีแค่ SPX ที่ส่ง — Flash ไม่ส่งเลยสักใบ**
   * (prod 2026-08-27: SPX 6/6 มี · Flash 7/7 ไม่มี)
   *
   * ⇒ 4 จุดตายตัว = ครึ่งหนึ่งของใบมีจุดที่ไม่มีวันสว่าง = โกหกว่า "ยังไปไม่ถึง"
   * ทั้งที่ความจริงคือ "ขนส่งเจ้านี้ไม่บอก" — คนละเรื่องกันคนละความหมาย
   */
  it('ขนส่งไม่บอก (Flash) → 3 จุด ไม่มีจุดเทาที่ไม่มีวันสว่าง', () => {
    const leg = describeReturnLeg(seller({ carrierStatus: 'return_success' }))!
    expect(leg.dots.map((d) => d.label)).toEqual(['พัสดุมีปัญหา', 'กำลังตีกลับ', 'ถึงร้านค้า'])
  })

  it('ขนส่งบอก (SPX) → 4 จุด แทรก "กำลังส่ง" ก่อนปลายทาง', () => {
    const leg = describeReturnLeg(
      seller({ carrierStatus: 'return_success', returnDispatchedAt: '2026-08-24T03:00:00Z' }),
    )!
    expect(leg.dots.map((d) => d.label)).toEqual([
      'พัสดุมีปัญหา',
      'กำลังตีกลับ',
      'กำลังส่ง',
      'ถึงร้านค้า',
    ])
    expect(leg.stage).toBe(3)
  })

  it('ยังไม่ถึงร้าน แต่ขนส่งบอกว่านำส่งคืนแล้ว → ยืนที่จุดที่ 3', () => {
    const leg = describeReturnLeg(
      seller({ carrierStatus: 'return', returnDispatchedAt: '2026-08-24T03:00:00Z' }),
    )!
    expect(leg.stage).toBe(2)
    expect(leg.dots[leg.stage].label).toBe('กำลังส่ง')
  })

  it('ยังไม่ถึงร้าน และขนส่งไม่บอก → ยืนที่ "กำลังตีกลับ"', () => {
    const leg = describeReturnLeg(seller({ carrierStatus: 'return' }))!
    expect(leg.stage).toBe(1)
    expect(leg.dots[leg.stage].label).toBe('กำลังตีกลับ')
  })

  /**
   * 🛑 วลีนี้เป็น **ข้อความอิสระของขนส่ง** ที่เราไปอ่าน ไม่ใช่สัญญาที่ใครรับประกัน
   * วันที่ SPX เปลี่ยนคำ จุดนี้จะเลิกโผล่ **เงียบ ๆ ไม่มี error** ⇒ ตรึงไว้ที่เดียว
   * และผลของการพลาดคือแถบถอยเป็น 3 จุด (ซึ่งยังถูก) ไม่ใช่พัง — degrade ปลอดภัย
   */
  it('วลีที่ใช้จับต้องอยู่ที่ SSOT ที่เดียว และตรงกับข้อความจริงบน prod', () => {
    expect(RETURN_DISPATCH_PHRASE).toBe('กำลังนำส่งพัสดุคืนผู้ส่ง')
    // ข้อความจริงที่ iShip ส่งมา (TH065880509388 · 2026-08-24 03:00)
    expect(isReturnDispatchEvent('return', 'บริษัทขนส่งกำลังนำส่งพัสดุคืนผู้ส่ง')).toBe(true)
    // ต้องไม่ไปจับ "ถึงศูนย์คัดแยก"/"อยู่ระหว่างการขนส่ง" ซึ่งวนสลับกันหลายรอบ
    expect(isReturnDispatchEvent('return', 'พัสดุตีกลับไปยังผู้ส่ง ถึงศูนย์คัดแยกสินค้า: SOCW')).toBe(false)
    expect(isReturnDispatchEvent('return', 'พัสดุตีกลับไปยังผู้ส่ง อยู่ระหว่างการขนส่ง: ATKTG')).toBe(false)
    // สถานะนอกสายตีกลับต้องไม่เข้าเงื่อนไขแม้ข้อความจะบังเอิญตรง
    expect(isReturnDispatchEvent('in_transit', 'บริษัทขนส่งกำลังนำส่งพัสดุคืนผู้ส่ง')).toBe(false)
    expect(isReturnDispatchEvent(null, 'บริษัทขนส่งกำลังนำส่งพัสดุคืนผู้ส่ง')).toBe(false)
  })
})

describe('[blocker] ทุกจุดบนแถบเดียวกันต้องคนละไอคอน', () => {
  /**
   * 🛑 กฎนี้ถูก *เขียนไว้* ในคอมเมนต์ของ `ICON` มาตั้งแต่แรกแต่ **ไม่เคยมีด่านบังคับ**
   * จนกระทั่งวันนี้ — ซึ่งคือรูปร่างของบั๊กเดิมเป๊ะ: รอบแรก `กำลังตีกลับ` กับ `กำลังส่ง`
   * ใช้ `truck-return` ตัวเดียวกันทั้งคู่ ผ่าน tsc/build/eslint/เทสครบทุกด่าน
   * **user เป็นคนสังเกตเห็นเองจากหน้าจอ** (2026-08-27)
   * (docs/conventions/rule-must-be-enforced-not-described.md)
   *
   * ไล่ทุกรูปร่างของแถบที่เป็นไปได้จริง ไม่ใช่หยิบมาเคสเดียว — จำนวนจุดผันตามข้อมูล
   * (3 หรือ 4 สำหรับ BOUNCE · 2/3/4 สำหรับ RETURN) ⇒ เคสที่ซ้ำอาจซ่อนอยู่ในรูปแบบเดียว
   */
  const SHAPES: Array<[string, ReturnLegInput]> = [
    ['BOUNCE 3 จุด', seller({ carrierStatus: 'return_success' })],
    [
      'BOUNCE 4 จุด',
      seller({ carrierStatus: 'return_success', returnDispatchedAt: '2026-08-24T03:00:00Z' }),
    ],
    ['RETURN NONE', seller({ orderReturn: { status: 'REQUESTED', trackingSource: 'NONE' } })],
    ['RETURN MANUAL', seller({ orderReturn: { status: 'SHIPPED', trackingSource: 'MANUAL' } })],
    ['RETURN ISHIP', seller({ orderReturn: { status: 'RECEIVED', trackingSource: 'ISHIP' } })],
  ]

  for (const [name, input] of SHAPES) {
    it(`${name} — ไอคอนไม่ซ้ำกันเลยสักคู่`, () => {
      const icons = describeReturnLeg(input)!.dots.map((d) => d.icon)
      expect(new Set(icons).size, icons.join(' · ')).toBe(icons.length)
    })
  }
})

describe('[blocker] ลูกศร/รถ ต้องหันตามทิศที่แถบเดิน', () => {
  /**
   * 🛑 แถบ BOUNCE เดิน **ขวา→ซ้าย** (`standalone: true` ⇒ `flex-row-reverse`) จุดปลายทาง
   * "ถึงร้านค้า" จึงอยู่ซ้ายสุด ตรงกับจุดออกเดินทางของขาไปพอดี — นั่นคือทั้งหมดของเหตุผล
   * ที่ user ขอให้กลับด้าน ("มันต้อง invert กันกับขาไป")
   *
   * ไอคอนที่มี **ทิศในตัว** (ลูกศรออกจากกล่อง · หัวรถ) จึงต้อง `flipX` ทุกตัว ไม่งั้นมันชี้
   * สวนทางกับเรื่องที่แถบกำลังเล่า — ผิดแบบที่ tsc/build/detector มองไม่เห็นเลยสักด่าน
   * เพราะทุกอย่างถูกต้องตามชนิดทุกตัวอักษร (user จับได้เองจากหน้าจอทั้ง 2 ครั้ง)
   */
  const directional = (input: ReturnLegInput) =>
    describeReturnLeg(input)!.dots.filter((d) => /export|truck/.test(d.icon))

  it('BOUNCE — ทุกจุดที่ไอคอนมีทิศในตัว ต้องถูก flip', () => {
    const dots = directional(
      seller({ carrierStatus: 'return_success', returnDispatchedAt: '2026-08-24T03:00:00Z' }),
    )
    expect(dots.length, 'ไม่พบจุดที่มีทิศเลย — เปลี่ยนชุดไอคอนแล้วต้องมาแก้ด่านนี้ด้วย').toBe(2)
    for (const d of dots) expect(d.flipX, `${d.label} (${d.icon})`).toBe(true)
  })

  it('จุด "กำลังตีกลับ" ใช้ package-export ที่กลับด้าน (มติ user 2026-08-27)', () => {
    const dot = describeReturnLeg(seller({ carrierStatus: 'return' }))!.dots[1]
    expect(dot.label).toBe('กำลังตีกลับ')
    expect(dot.icon).toBe('package-export')
    expect(dot.flipX).toBe(true)
  })
})
