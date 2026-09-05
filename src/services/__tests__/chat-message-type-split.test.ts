import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

import { AUTO_ORDER_RESULT_TYPE } from '@/lib/auto-order-message-type'

/**
 * 00061 B16 — ชนิดข้อความต้องแยกเป็น 2 ชุด (ชั้นสองรอง `tsc`)
 *
 * ด่านหลักคือ `tsc` เอง: `sendMessage()` รับ `SendableMessageType` ซึ่งไม่มี
 * `'AUTO_ORDER_RESULT'` อยู่ ⇒ การส่งการ์ดผลลัพธ์ผ่าน `sendMessage()` ล้มตั้งแต่ compile
 *
 * เทสนี้กัน "คนแก้ type กลับ" — ซึ่งเป็นการแก้ที่ `tsc` จะเงียบทันทีที่ทำสำเร็จ
 * (ระบบชนิดหยุดปกป้องตัวเองในวินาทีที่ถูกทำให้กว้างขึ้น) ⇒ ด่านต้องอยู่นอกระบบชนิด
 */
const SRC = readFileSync('src/services/chat.service.ts', 'utf8')

/** ตัดคอมเมนต์ก่อนเสมอ — คำอธิบายเหนือ union พูดถึงชื่อค่าที่ห้ามมีอยู่ตรง ๆ */
const CODE = SRC.split('\n')
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join('\n')

describe('SendableMessageType / StoredMessageType (00061 B16)', () => {
  it('[blocker] union ที่ "ส่งได้" ต้องไม่มี AUTO_ORDER_RESULT', () => {
    const line = CODE.split('\n').find((l) => l.includes('export type SendableMessageType'))
    expect(line, 'ไม่พบ SendableMessageType — มีคนยุบ 2 ชนิดกลับเป็นตัวเดียวแล้ว').toBeTruthy()
    expect(line).not.toContain(AUTO_ORDER_RESULT_TYPE)
  })

  it('[blocker] พารามิเตอร์ `type` ของ sendMessage ต้องเป็น SendableMessageType', () => {
    const at = CODE.indexOf('export async function sendMessage(')
    expect(at).toBeGreaterThan(-1)
    const signature = CODE.slice(at, at + 600)
    expect(signature).toContain('type: SendableMessageType')
    expect(signature).not.toContain('type: StoredMessageType')
  })

  it('[blocker] รูปร่างข้อความที่อ่านออกมาต้องเป็น StoredMessageType (กว้าง)', () => {
    expect(CODE).toContain('type: StoredMessageType')
    expect(CODE).toMatch(/export type StoredMessageType\s*=\s*SendableMessageType\s*\|/)
  })

  it('[blocker] ค่าคงที่ต้องมาจากไฟล์เดียว — ห้ามพิมพ์สตริงซ้ำใน chat.service', () => {
    // การพิมพ์ 'AUTO_ORDER_RESULT' ตรง ๆ ที่ปลายทางคือ typo-drift ที่ไม่มี gate ไหนจับได้
    expect(CODE).not.toContain(`'${AUTO_ORDER_RESULT_TYPE}'`)
    expect(CODE).not.toContain(`"${AUTO_ORDER_RESULT_TYPE}"`)
    expect(CODE).toContain('AUTO_ORDER_RESULT_TYPE')
  })
})
