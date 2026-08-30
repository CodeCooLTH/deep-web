/**
 * [blocker] ตัวกรอง/ตัวนับ "พัสดุมีปัญหา" ในกล่องแชท (user report 2026-08-20)
 *
 * อาการ: /orders ขึ้น "พัสดุมีปัญหา 10" แต่ชิปในกล่องแชทขึ้น 3 — สองฝั่งตอบคนละคำถามอยู่แล้ว
 * (ออเดอร์ vs เธรด) แต่ *นิยาม* ก็ไม่ตรงกันด้วย 2 จุด และทั้งสองจุดเป็นเรื่องของ SQL ที่ยูนิตเทส
 * เรียกตรง ๆ ไม่ได้ (ต้องมีฐานข้อมูล) จึงปักหมุดด้วยการสแกนซอร์ส
 *
 * 🛑 ต้องตัดคอมเมนต์ออกก่อนสแกนเสมอ — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนอธิบายกฎข้อนี้ไว้ด้วย
 * (บทเรียนเดียวกับ grep gate ของ HR9 ที่แดงค้างจากคำเตือนของตัวเอง 2026-08-02→03)
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PROBLEM_CARRIER_STATUSES,
  RETURNED_CARRIER_STATUSES,
  isProblemCarrierStatus,
} from '@/lib/iship/status'
import { deriveShippingStage } from '@/lib/order-stage'

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const chatServiceSrc = stripComments(
  readFileSync(join(process.cwd(), 'src/services/chat.service.ts'), 'utf8'),
)

const stage = (carrierStatus: string) =>
  deriveShippingStage({
    fulfillmentMode: 'SHIPPED',
    status: 'SHIPPED',
    carrierStatus,
    hasShipment: true,
    paymentMethod: 'TRANSFER',
  })

describe('นิยาม "พัสดุมีปัญหา" ต้องเป็นชุดเดียวทั้งระบบ', () => {
  /**
   * 🛑 แยกกอง 2026-08-24 (user เจอบน prod): ใบที่ iShip บอก "ส่งคืนสำเร็จ" ไปแล้ว ยังค้างอยู่ใน
   * ไทล์/ชิป "พัสดุมีปัญหา" ซึ่งบอกร้านผิดว่ายังต้องไปตามขนส่ง — ตอนนี้ตีกลับเป็นกอง RETURNED
   * ของตัวเอง. ปักหมุด **ความไม่ทับกัน** ไว้ตรงนี้เพราะถ้าวันหนึ่งมีคนยัดสถานะกลับเข้าทั้งสอง
   * ชุด ออเดอร์ใบเดียวจะถูกนับสองไทล์ แล้วผลรวมบนหน้าจอจะเกินจำนวนใบจริงโดยไม่มีอะไรฟ้อง
   */
  it('[blocker] สองชุดต้องไม่ทับกันเลยแม้แต่ค่าเดียว', () => {
    const returned = new Set<string>(RETURNED_CARRIER_STATUSES)
    for (const code of PROBLEM_CARRIER_STATUSES) {
      expect(returned.has(code)).toBe(false)
    }
    expect(PROBLEM_CARRIER_STATUSES.length).toBeGreaterThan(0)
  })

  it('[blocker] ทุกค่าในชุด "มีปัญหา" ต้องตกกอง PROBLEM ของ deriveShippingStage จริง ๆ', () => {
    for (const code of PROBLEM_CARRIER_STATUSES) {
      expect(isProblemCarrierStatus(code)).toBe(true)
      expect(stage(code)).toBe('PROBLEM')
    }
  })

  it('[blocker] สายตีกลับต้องตกกอง RETURNED — ไม่ใช่ PROBLEM และไม่ใช่ DONE', () => {
    for (const code of RETURNED_CARRIER_STATUSES) {
      expect(isProblemCarrierStatus(code)).toBe(false)
      expect(stage(code)).toBe('RETURNED')
    }
  })

  /**
   * `return_success` เป็น terminal ตัวหนึ่ง — ถ้าด่านตีกลับถูกย้ายไปไว้ *ใต้* สาขา terminal
   * มันจะกลายเป็น DONE (หรือ AWAITING_COD ในใบ COD) = ของที่กองอยู่ที่ร้านหายจากทุกไทล์
   */
  it('[blocker] ใบ COD ที่ตีกลับต้องไม่กลายเป็น "รอเงิน COD"', () => {
    expect(
      deriveShippingStage({
        fulfillmentMode: 'SHIPPED',
        status: 'SHIPPED',
        carrierStatus: 'return_success',
        hasShipment: true,
        paymentMethod: 'COD',
        codReceivedAt: null,
      }),
    ).toBe('RETURNED')
  })

  it('[blocker] ตัวกรองฝั่งแชทต้องอ้างชุดกลาง ไม่ใช่รายชื่อสถานะที่พิมพ์เอง', () => {
    expect(chatServiceSrc).toContain('PROBLEM_CARRIER_STATUSES')
    expect(chatServiceSrc).not.toMatch(/'(issue|cannot_pickup|return_success)'/)
  })
})

describe('ตัวกรอง "พัสดุมีปัญหา" ต้องดูออเดอร์ทุกใบของลูกค้า', () => {
  /** ก้อนโค้ดของสาขา problem — ตัดมาจากจุดที่ประกาศจนถึง return ของสาขานั้น */
  const problemBranch = (() => {
    const start = chatServiceSrc.indexOf("if (state === 'problem')")
    expect(start).toBeGreaterThan(-1)
    const end = chatServiceSrc.indexOf('problemRows.map', start)
    expect(end).toBeGreaterThan(start)
    return chatServiceSrc.slice(start, end)
  })()

  it('[blocker] ห้ามยุบกลับไปตัดสินจาก "ใบล่าสุดใบเดียว" (DISTINCT ON)', () => {
    // DISTINCT ON ยังใช้ได้กับอีก 3 สถานะ — ห้ามใช้เฉพาะในสาขานี้
    expect(problemBranch).not.toContain('DISTINCT ON')
    expect(problemBranch).toContain('EXISTS')
  })

  it('[blocker] ใบที่ยกเลิกแล้วไม่ใช่งานค้าง — ต้องถูกตัดออกเหมือนฝั่ง /orders', () => {
    expect(problemBranch).toContain(`o."status" <> 'CANCELLED'`)
  })

  it('[blocker] นิยาม "มีพัสดุจริง" ต้องเป็น CREATED + ไม่ใช่ dry-run (ไม่ใช่ <> CANCELLED)', () => {
    expect(problemBranch).toContain(`sh."status" = 'CREATED'`)
    expect(problemBranch).toContain(`sh."isDryRun" = false`)
  })
})

describe('ตัวนับบนป้ายในแถวแชท (enrichWithOrderStage)', () => {
  const enrichSrc = stripComments(
    readFileSync(join(process.cwd(), 'src/services/order-stage.service.ts'), 'utf8'),
  )

  it('[blocker] ต้องนับใบที่ติดปัญหาแยกจากใบล่าสุด แล้วส่งเข้า deriveOrderStage', () => {
    expect(enrichSrc).toContain('PROBLEM_CARRIER_STATUSES')
    expect(enrichSrc).toContain(`po."status" <> 'CANCELLED'`)
    // ค่าที่นับได้ต้องถูก "ใช้" จริง ไม่ใช่แค่ดึงมาแล้ววางทิ้งไว้ในแถว
    expect(enrichSrc).toContain('problemOrderCount: r.problemOrderCount')
  })
})
