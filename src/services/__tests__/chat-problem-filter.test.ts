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
  PROBLEM_STAGE_CARRIER_STATUSES,
  isProblemStageCarrierStatus,
} from '@/lib/iship/status'
import { deriveShippingStage } from '@/lib/order-stage'

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const chatServiceSrc = stripComments(
  readFileSync(join(process.cwd(), 'src/services/chat.service.ts'), 'utf8'),
)

describe('นิยาม "พัสดุมีปัญหา" ต้องเป็นชุดเดียวทั้งระบบ', () => {
  it('[blocker] ชุดของหน้าจอ = ชุดที่ขนส่งแจ้งปัญหา + ของที่ตีกลับถึงร้านแล้ว', () => {
    for (const code of PROBLEM_CARRIER_STATUSES) {
      expect(PROBLEM_STAGE_CARRIER_STATUSES).toContain(code)
    }
    expect(PROBLEM_STAGE_CARRIER_STATUSES).toContain('return_success')
  })

  it('[blocker] ทุกค่าในชุดต้องตกกอง PROBLEM ของ deriveShippingStage จริง ๆ', () => {
    for (const code of PROBLEM_STAGE_CARRIER_STATUSES) {
      expect(isProblemStageCarrierStatus(code)).toBe(true)
      expect(
        deriveShippingStage({
          status: 'SHIPPED',
          carrierStatus: code,
          hasShipment: true,
          paymentMethod: 'TRANSFER',
        }),
      ).toBe('PROBLEM')
    }
  })

  it('[blocker] ตัวกรองฝั่งแชทต้องอ้างชุดของหน้าจอ ไม่ใช่ชุดแคบ', () => {
    expect(chatServiceSrc).toContain('PROBLEM_STAGE_CARRIER_STATUSES')
    // ชุดแคบห้ามหลุดกลับเข้ามาในโค้ดจริง (ในคอมเมนต์อ้างถึงได้ — ถูกตัดออกไปแล้ว)
    expect(chatServiceSrc).not.toContain('PROBLEM_CARRIER_STATUSES]')
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
    expect(enrichSrc).toContain('PROBLEM_STAGE_CARRIER_STATUSES')
    expect(enrichSrc).toContain(`po."status" <> 'CANCELLED'`)
    // ค่าที่นับได้ต้องถูก "ใช้" จริง ไม่ใช่แค่ดึงมาแล้ววางทิ้งไว้ในแถว
    expect(enrichSrc).toContain('problemOrderCount: r.problemOrderCount')
  })
})
