/**
 * [blocker] แถบพัสดุของผู้ซื้อกับของผู้ขายต้องชี้จุดเดียวกันเสมอ — feature 00041 (BR-BOE-12)
 *
 * ที่มา: `ParcelTimeline.tsx` (ฝั่งผู้ซื้อ) เคยไล่หา stage ในรายชื่อ key ของตัวเอง
 * (`PARCEL_CREATED`/`LABEL_PRINTED`/`DELIVERED`) ซึ่งเป็นค่าของ `OrderStageKey` คนละชุดกับ
 * `ShippingStageKey` ที่ `deriveShippingStage()` คืนมาจริง — ตัดกันแค่ `SHIPPING` ค่าเดียว
 * ⇒ พัสดุที่ส่งถึงแล้วไฮไลต์ "สร้างพัสดุ" · จุด "จัดส่งสำเร็จ" ไม่มีทางติด · แถบเตือน
 * "พัสดุมีปัญหา" ไม่เคยขึ้นเลยตั้งแต่วันแรก
 *
 * 🛑 ไม่มี gate ไหนจับได้เลย เพราะ prop ประกาศเป็น `stage: string` — ค่าที่ไม่มีในรายชื่อ
 * ตกไปที่ `idx === -1 → 0` อย่างเงียบ ๆ ซึ่งเป็นค่าที่ "ดูสมเหตุสมผล" บนหน้าจอ
 *
 * 🛑 แดง = ห้าม merge
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import { SHIPMENT_STAGES, describeProgress } from '../iship/status'
import { SHIPMENT_STAGE_DOT_INDEX, type ShippingStageKey } from '../order-stage'

const ALL_STAGES: ShippingStageKey[] = [
  'AWAITING_PARCEL',
  'AWAITING_PICKUP',
  'SHIPPING',
  'AWAITING_COD',
  'PROBLEM',
  'RETURNED',
  'DONE',
]

describe('SHIPMENT_STAGE_DOT_INDEX', () => {
  it('ครอบทุกค่าของ ShippingStageKey', () => {
    for (const stage of ALL_STAGES) {
      expect(SHIPMENT_STAGE_DOT_INDEX).toHaveProperty(stage)
    }
    expect(Object.keys(SHIPMENT_STAGE_DOT_INDEX).sort()).toEqual([...ALL_STAGES].sort())
  })

  // พัสดุที่ถึงมือแล้วต้องอยู่ "เลยจุดสุดท้าย" ⇒ ทุกจุดเขียว ไม่มีจุดไหนเป็นปัจจุบัน
  // เดิมเคสนี้ตกไปจุด 0 ("สร้างพัสดุ") ซึ่งเป็นอาการที่ผู้ซื้อเห็นจริง
  it('DONE และ AWAITING_COD = จบเส้นทาง (เลย index สุดท้ายของแถบ)', () => {
    expect(SHIPMENT_STAGE_DOT_INDEX.DONE).toBe(SHIPMENT_STAGES.length)
    expect(SHIPMENT_STAGE_DOT_INDEX.AWAITING_COD).toBe(SHIPMENT_STAGES.length)
  })

  it('ยังไม่มีพัสดุ = null (ไม่ใช่ 0 — 0 แปลว่า "สร้างพัสดุแล้ว")', () => {
    expect(SHIPMENT_STAGE_DOT_INDEX.AWAITING_PARCEL).toBeNull()
  })

  it('PROBLEM ปักจุดเดียวกับ SHIPPING (ไม่มีจุดแยกของ "มีปัญหา" ในแถบ 4 จุด)', () => {
    expect(SHIPMENT_STAGE_DOT_INDEX.PROBLEM).toBe(SHIPMENT_STAGE_DOT_INDEX.SHIPPING)
  })

  /**
   * 🛑 ห้ามเป็น `SHIPMENT_STAGES.length` (จบเส้นทาง) — ค่านั้นทำให้ทั้งแถบเขียวครบ 4 จุด
   * ซึ่งอ่านว่า "ส่งถึงมือผู้รับแล้ว" ทั้งที่ของเดินทางกลับมาหาร้าน = ตรงข้ามกับความจริง
   * และเป็นสิ่งที่ผู้ซื้อเห็นบนหน้า /o/[token] ด้วย
   */
  it('RETURNED ปักจุดรถเหมือน PROBLEM ไม่ใช่จุดจบเส้นทาง', () => {
    expect(SHIPMENT_STAGE_DOT_INDEX.RETURNED).toBe(SHIPMENT_STAGE_DOT_INDEX.SHIPPING)
    expect(SHIPMENT_STAGE_DOT_INDEX.RETURNED).not.toBe(SHIPMENT_STAGES.length)
  })

  it('ทุกค่าที่ไม่ใช่ null อยู่ในช่วง 0..length (length = จบเส้นทาง)', () => {
    for (const stage of ALL_STAGES) {
      const v = SHIPMENT_STAGE_DOT_INDEX[stage]
      if (v == null) continue
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(SHIPMENT_STAGES.length)
    }
  })
})

describe('parity ระหว่างจอผู้ซื้อกับจอผู้ขาย', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

  const BUYER = 'src/app/(marketing)/o/[token]/ParcelTimeline.tsx'
  const SELLER = 'src/app/(paces)/seller/(dashboard)/orders/components/MiniShipmentTimeline.tsx'

  it('ทั้งสองจออ่านจากตารางเดียวกัน ไม่มีใครถือตารางของตัวเอง', () => {
    for (const p of [BUYER, SELLER]) {
      expect(read(p)).toContain('SHIPMENT_STAGE_DOT_INDEX')
    }
  })

  // ป้ายขั้นต้องมาจาก SHIPMENT_STAGES ไม่ใช่ literal ที่ก็อปไว้ในไฟล์
  // (คำเดียวกันสองที่ = เลื่อนออกจากกันได้เงียบ ๆ — HR16)
  it('ป้าย 4 ขั้นมาจาก SHIPMENT_STAGES ทั้งสองจอ', () => {
    for (const p of [BUYER, SELLER]) {
      expect(read(p)).toContain('SHIPMENT_STAGES')
    }
    // ฝั่งผู้ซื้อเคยฝังรายชื่อขั้นของตัวเองไว้ — ห้ามกลับมา
    expect(read(BUYER)).not.toMatch(/PARCEL_STEPS\s*=/)
  })

  // prop ที่เป็น `string` คือเหตุผลที่ tsc มองไม่เห็นบั๊กเดิม
  //
  // 🛑 ต้องตัดคอมเมนต์ก่อนตรวจ — หัวไฟล์ที่ถูกตรวจ *อธิบายบั๊กเดิมด้วยตัวอักษร* `stage: string`
  // เช็คแบบ substring ตรง ๆ จะแดงตลอดกาลทั้งที่โค้ดถูกแล้ว (บทเรียนเดียวกับ grep gate ของ HR9:
  // ไฟล์ที่ทำถูกกฎมักเป็นไฟล์ที่อ้างชื่อกฎไว้บนหัว)
  it('prop stage ของฝั่งผู้ซื้อพิมพ์เป็น ShippingStageKey ไม่ใช่ string', () => {
    const src = read(BUYER)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')

    expect(src).toMatch(/stage:\s*ShippingStageKey/)
    expect(src).not.toMatch(/stage:\s*string/)
  })
})

/**
 * [blocker] แถบ 4 จุดมี SSOT เดียว = `describeProgress()` (2026-08-24)
 *
 * ที่มา: `SHIPMENT_STAGE_DOT_INDEX` derive จาก `ShippingStageKey` ซึ่งมีแค่ 6 ค่า จึงแยก
 * `return` (จุดที่ 3) ออกจาก `return_success` (จุดที่ 4 + คำว่า "ส่งคืนสำเร็จ") ไม่ได้ —
 * แถว/hover ของ `/orders` เคยอ่านจากตารางนั้นอย่างเดียว ⇒ พัสดุที่ตีกลับมาถึงร้านแล้วขึ้น
 * **"กำลังจัดส่ง" ตัวหนา** ขณะที่หน้ารายละเอียดของออเดอร์ใบเดียวกันขึ้นถูกมาตลอด
 * (user เจอบน prod)
 *
 * ตารางหยาบยังอยู่ในฐานะ **fallback ของพัสดุที่ร้านแจ้งเลขเอง** (ไม่มี carrierStatus)
 * เทสชุดบนจึงยังบังคับให้มันครบทุก key เหมือนเดิม
 */
describe('describeProgress = SSOT ของแถบ 4 จุด', () => {
  it('[blocker] ตีกลับถึงร้าน ≠ กำลังจัดส่ง — ต้องไปจุดสุดท้ายและเปลี่ยนคำ', () => {
    const p = describeProgress('CREATED', 'return_success')
    expect(p.stage).toBe(SHIPMENT_STAGES.length - 1)
    expect(p.lastLabel).toBeTruthy()
    expect(p.lastLabel).not.toBe(SHIPMENT_STAGES[SHIPMENT_STAGES.length - 1].label)
    // ต้องมีกล่องเตือน ไม่งั้นจุดเปลี่ยนตำแหน่งเฉย ๆ โดยไม่บอกว่าเกิดอะไรขึ้น
    expect(p.notice?.text).toBeTruthy()
  })

  it('[blocker] กำลังตีกลับ (return) อยู่คนละจุดกับตีกลับสำเร็จ', () => {
    expect(describeProgress('CREATED', 'return').stage).not.toBe(
      describeProgress('CREATED', 'return_success').stage,
    )
  })

  it('[blocker] ส่งถึงจริงกับตีกลับสำเร็จอยู่จุดเดียวกัน → ต้องแยกด้วยคำ+notice เท่านั้น', () => {
    const delivered = describeProgress('CREATED', 'delivered')
    const returned = describeProgress('CREATED', 'return_success')
    expect(delivered.stage).toBe(returned.stage)
    // ⇒ ห้ามมีจอไหนวาดจุดสุดท้ายโดยไม่เอา lastLabel/notice ไปใช้ (ดูเทสสแกนซอร์สด้านล่าง)
    expect(delivered.lastLabel).toBeUndefined()
    expect(delivered.notice).toBeUndefined()
  })

  it('[blocker] ทั้ง 3 จอที่วาดแถบต้องเรียก describeProgress + ใช้ lastLabel', () => {
    const SCREENS = [
      'src/app/(paces)/seller/(dashboard)/orders/components/MiniShipmentTimeline.tsx',
      'src/app/(paces)/seller/(dashboard)/orders/components/ShipmentHoverCard.tsx',
      'src/app/(paces)/seller/(dashboard)/orders/[token]/components/ShippingCard.tsx',
      'src/app/(marketing)/o/[token]/ParcelTimeline.tsx',
    ]
    for (const p of SCREENS) {
      // 🛑 ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนอธิบายกฎข้อนี้ไว้ด้วย
      const src = readFileSync(join(process.cwd(), p), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n')
      /**
       * 🛑 ต้องจับ `describeProgress(` (การ *เรียก*) ไม่ใช่ชื่อเปล่า ๆ — mutation รอบแรก
       * เปลี่ยนการเรียกเป็น `null as ReturnType<typeof describeProgress>` แล้วด่านยังเขียว
       * เพราะชื่อยังอยู่ในไฟล์ (ชุด input อ่อน ไม่ใช่ mutation ไม่เกี่ยว —
       * docs/conventions/mutation-silence-means-weak-corpus.md)
       *
       * และต้องเช็คว่า **เอาผลไปใช้จริง** ทั้ง 2 ทาง: `.stage` (จุดไหน) + `lastLabel` (คำ)
       */
      expect(src, p).toContain('describeProgress(')
      expect(src, p).toContain('progress.stage')
      expect(src, p).toContain('lastLabel')
    }
  })
})
