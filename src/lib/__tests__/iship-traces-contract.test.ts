/**
 * [blocker] สัญญาระหว่าง route `/traces` กับจอที่กินมัน + กติกา "เลิกยิงเมื่อจบเส้นทาง"
 *
 * ที่มา (user เจอบน prod 2026-08-24): การ์ด hover และการ์ดการจัดส่งขึ้น "ขนส่งยังไม่บันทึก
 * การเดินทางของพัสดุใบนี้" ทุกใบ ทั้งที่ฐานมี `ShipmentEvent` เก็บไว้ 20–28 แถวต่อพัสดุ
 *
 * ต้นเหตุ: route เปลี่ยนมาคืน `{ events, carrier }` ตั้งแต่ 2026-08-20 แต่จอ 2 ใน 3 ยังอ่าน
 * `Array.isArray(data) ? data : data.data ?? []` ⇒ ได้ `[]` **ทุกครั้ง** โดย `res.ok` เป็น
 * true ตลอด จึงไม่มี error ให้ใครเห็น และโมดัลในแชท (อ่าน `data.events`) ทำงานถูกอยู่ตัวเดียว
 * จึงไม่มีใครเอะใจ — `tsc` มองไม่เห็นเพราะ client cast เอง (`as { data?: ... }`)
 *
 * 🛑 แดง = ห้าม merge
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import {
  FINAL_CARRIER_STATUSES,
  carrierTrackingSettled,
  isTerminalCarrierStatus,
} from '../iship/status'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
/** 🛑 ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนอธิบายบั๊กเดิมไว้ด้วย (บทเรียน HR9 gate) */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const CONSUMERS = [
  'src/app/(paces)/seller/(dashboard)/orders/[token]/components/ShippingCard.tsx',
  'src/app/(paces)/seller/(dashboard)/orders/components/ShipmentHoverCard.tsx',
  'src/components/safepay/iship/ShipmentStatusView.tsx',
]

describe('รูปร่าง response ของ /traces', () => {
  it('[blocker] route คืน { events, carrier } — ห้ามกลับไปคืน array เปล่า', () => {
    const src = stripComments(read('src/app/api/seller/iship/shipments/[id]/traces/route.ts'))
    expect(src).toMatch(/events:/)
    expect(src).toMatch(/carrier,?/)
  })

  it('[blocker] ทุกจอที่กิน endpoint นี้ต้องอ่าน `.events` ไม่ใช่ `.data`', () => {
    for (const p of CONSUMERS) {
      const src = stripComments(read(p))
      expect(src, p).toMatch(/data\.events|\.events\b/)
      // ตัวอ่านรูปเก่าห้ามกลับมา — มันไม่พังเสียงดัง มันคืน [] เงียบ ๆ
      expect(src, p).not.toMatch(/data\.data\s*\?\?\s*\[\]/)
      expect(src, p).not.toMatch(/Array\.isArray\(data\)/)
    }
  })
})

describe('carrierTrackingSettled — เลิกยิง iShip เมื่อไม่มีอะไรใหม่ให้รู้', () => {
  it('[blocker] ปลายทางที่ไม่มีอะไรตามมา = จบ', () => {
    for (const code of FINAL_CARRIER_STATUSES) {
      expect(carrierTrackingSettled({ carrierStatus: code }), code).toBe(true)
    }
  })

  /**
   * 🛑 เคสที่ห้ามพลาดที่สุด — ถ้าใช้ `isTerminalCarrierStatus` ตัดสินแทน ใบ COD จะค้างที่
   * "ส่งถึงแล้ว" ตลอดไปและฟีเจอร์ปิดงานอัตโนมัติตายทั้งฟีเจอร์ (BR-ISHIP-49)
   */
  it('[blocker] delivered ของใบ COD ที่ยังไม่ได้เงิน = ยังไม่จบ (ต่างจาก terminal)', () => {
    expect(isTerminalCarrierStatus('delivered')).toBe(true) // terminal จริง
    expect(
      carrierTrackingSettled({ carrierStatus: 'delivered', codAmount: 350, codSettledAt: null }),
    ).toBe(false) // แต่ยังต้องถามต่อ
    expect(
      carrierTrackingSettled({
        carrierStatus: 'delivered',
        codAmount: 350,
        codSettledAt: new Date(),
      }),
    ).toBe(true)
    // ไม่ใช่ใบ COD → ส่งถึงแล้วคือจบ
    expect(carrierTrackingSettled({ carrierStatus: 'delivered', codAmount: 0 })).toBe(true)
    expect(carrierTrackingSettled({ carrierStatus: 'payment_success' })).toBe(true)
  })

  it('[blocker] ยังเดินทางอยู่ = ยังไม่จบ · ไม่รู้สถานะ = ยังไม่จบ (ห้ามเดาว่าจบ)', () => {
    for (const code of ['order_success', 'picked_up', 'in_transit', 'progress', 'issue', 'return']) {
      expect(carrierTrackingSettled({ carrierStatus: code }), code).toBe(false)
    }
    expect(carrierTrackingSettled({ carrierStatus: null })).toBe(false)
  })

  it('[blocker] getTraces ต้องข้าม upstream จริง ไม่ใช่แค่ import ฟังก์ชันมาวางไว้', () => {
    const src = stripComments(read('src/services/iship.service.ts'))
    const i = src.indexOf('carrierTrackingSettled({')
    expect(i).toBeGreaterThan(-1)
    // ต้องอ่านของเก่าจากฐานแล้ว return ออกไปเลย ไม่ตกไปยิง iship.getTraces ต่อ
    const block = src.slice(i, i + 400)
    expect(block).toContain('shipmentEvent.findMany')
    expect(block).toContain('return { events: stored')
    // 🛑 ต้องมีของเก่าอยู่จริงถึงจะข้ามได้ ไม่งั้นใบที่ไม่เคยดึงเลยจะว่างตลอดไปกู้ไม่ได้
    expect(block).toContain('stored.length > 0')
  })

  /**
   * poller เขียนกติกาเดียวกันเป็น SQL (`notIn`) จึงเรียกฟังก์ชันนี้ไม่ได้ — ปักหมุดให้สอง
   * ที่มีรายชื่อตรงกันแทน ไม่งั้นวันหนึ่งจะมีสถานะที่ "หน้าจอเลิกถาม แต่ poller ยังถาม"
   * (หรือกลับกัน) โดยไม่มีอะไรฟ้อง
   */
  it('[blocker] รายชื่อใน syncShipmentStatuses ต้องครอบ FINAL_CARRIER_STATUSES ครบ', () => {
    const src = stripComments(read('src/services/iship.service.ts'))
    const i = src.indexOf('const tracking = await prisma.orderShipment.findMany')
    expect(i).toBeGreaterThan(-1)
    const where = src.slice(i, i + 900)
    for (const code of FINAL_CARRIER_STATUSES) {
      expect(where, code).toContain(`"${code}"`)
    }
  })
})
