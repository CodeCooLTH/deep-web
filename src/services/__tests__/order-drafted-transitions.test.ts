import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

import { VALID_TRANSITIONS } from '@/services/order.service'

/**
 * 00061 TFR-019 — `assertTransition()` คือ **ด่านเดียวที่มีจริง** สำหรับค่า `Order.status`
 *
 * ไม่มี CHECK ครอบคอลัมน์นี้ในฐาน (ตัดสินไว้ใน DATABASE.md §3.6 ว่าความเสี่ยงของการเพิ่ม
 * สูงกว่าประโยชน์) ⇒ ตารางนี้ผิดเมื่อไหร่ ไม่มีอะไรมารับต่อ
 */
describe('VALID_TRANSITIONS — DRAFTED (00061)', () => {
  it('[blocker] DRAFTED ไปได้แค่ PENDING (เลื่อนขั้น) กับ CANCELLED (ทิ้งร่าง)', () => {
    expect(VALID_TRANSITIONS.DRAFTED).toEqual(['PENDING', 'CANCELLED'])
  })

  it('[blocker] DRAFTED → CONFIRMED ตรง ๆ ต้องถูกปฏิเสธ', () => {
    // ลูกค้ายืนยันรับของจากออเดอร์ที่ระบบยังบอกว่าข้อมูลไม่ครบไม่ได้ — ต้องผ่าน PENDING ก่อน
    expect(VALID_TRANSITIONS.DRAFTED).not.toContain('CONFIRMED')
    expect(VALID_TRANSITIONS.DRAFTED).not.toContain('SHIPPED')
  })

  it('[blocker] ไม่มีสถานะไหนย้อนกลับมาเป็น DRAFTED ได้เลย', () => {
    // ทางเข้าเดียวของ DRAFTED คือ INSERT ตอนสร้างร่างครั้งแรก — ออเดอร์จริงถอยกลับไม่ได้
    for (const [from, targets] of Object.entries(VALID_TRANSITIONS)) {
      expect(targets, `${from} ต้องไม่มี DRAFTED เป็นปลายทาง`).not.toContain('DRAFTED')
    }
  })

  it('สถานะเดิมทั้ง 4 ตัวไม่ขยับเลย (zero-regression)', () => {
    expect(VALID_TRANSITIONS.PENDING).toEqual(['SHIPPED', 'CONFIRMED', 'CANCELLED'])
    expect(VALID_TRANSITIONS.SHIPPED).toEqual(['CONFIRMED', 'CANCELLED'])
    expect(VALID_TRANSITIONS.CONFIRMED).toEqual([])
    expect(VALID_TRANSITIONS.CANCELLED).toEqual([])
  })

  it('[blocker] createOrder ต้องส่ง 7 ฟิลด์ที่มาของ 00061 ลง INSERT จริง ไม่ใช่แค่รับพารามิเตอร์', () => {
    // 🛑 "เห็นว่าโค้ดส่งค่าเข้าไป" ไม่ใช่หลักฐานว่าค่านั้นถูกเก็บ — ตัวที่ตัดสินคือบรรทัดที่
    // ประกอบ data ของ create (docs/conventions/value-fate-decided-at-write-site.md)
    const src = readFileSync('src/services/order.service.ts', 'utf8')
    const at = src.indexOf('const orderDataBase = {')
    expect(at).toBeGreaterThan(-1)
    const block = src.slice(at, src.indexOf('\n  };', at))
    for (const field of [
      'createdVia',
      'sourceChatMessageId',
      'supersedesOrderId',
      'matchedTriggerPhrase',
      'contentHash',
      'detectionResolvedAt',
      'isDryRun',
    ]) {
      expect(block, `${field} ต้องถูกเขียนลงแถวจริง`).toContain(`${field}: data.${field}`)
    }
  })
})
