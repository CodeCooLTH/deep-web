/**
 * [blocker] "เคยมีปัญหาครั้งแรกเมื่อไร" ต้องถูกประทับจาก **ทุกทางที่เขียน `carrierStatus`**
 *
 * กอง "พัสดุมีปัญหา" ค้างเหนียวด้วยคอลัมน์ `OrderShipment.problemAt` (2026-09-14) ⇒ ทางไหน
 * เขียนสถานะขนส่งแล้วไม่ประทับหมุด พัสดุที่ผ่านทางนั้นจะ **หายจากกองเหมือนเดิมทุกประการ**
 * โดยไม่มี type error ไม่มีเทสอื่นแดง — มันแค่เป็น null ตลอดไป
 *
 * ตอนเขียนมี 3 ทาง: `getTraces()` (รีเฟรชตอนเปิดดู) · `handleStatusWebhook()` ·
 * `applyCarrierStatus()` (รอบ poll) — ด่านนี้ผูกกับ **รูปร่างของโค้ด** ไม่ใช่จำนวน จึงจับ
 * "ทางที่ 4" ที่จะถูกเพิ่มในอนาคตได้ด้วย
 *
 * 🛑 ต้องตัดคอมเมนต์ก่อนสแกนเสมอ — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนอธิบายกฎข้อนี้ไว้ด้วย
 * (บทเรียนเดียวกับ grep gate ของ HR9 ที่แดงค้างจากคำเตือนของตัวเอง 2026-08-02→03)
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(process.cwd(), 'src/services/iship.service.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('การประทับหมุด "เคยมีปัญหา" (OrderShipment.problemAt)', () => {
  it('[blocker] ทุกจุดที่เขียน carrierStatus ลงฐาน ต้องประทับหมุดด้วย', () => {
    /**
     * สแกนจาก **รูปร่างของการเขียนฐานข้อมูล** ไม่ใช่จากชื่อฟังก์ชันหรือจำนวนทาง —
     * `orderShipment.update|updateMany|create` ที่ data มี `carrierStatus:` ต้องตามด้วย
     * `stampCarrierMilestones(` ในระยะใกล้ **หรือ** เขียน `problemAt:` ลงไปเองในก้อนเดียวกัน
     * (ทางหลังคือเคส `create` ตอนผูกพัสดุที่มีอยู่แล้ว ซึ่งยังไม่มี id ให้ไปอัปเดตทีหลัง)
     *
     * ตัวแปรที่แค่ *อ่าน* หรือ *ประกอบ object ส่งกลับ* ไม่ถูกนับ — นั่นคือเหตุผลที่ต้องยึด
     * กับคำว่า `orderShipment.` นำหน้า ไม่ใช่ `carrierStatus:` ลอย ๆ
     */
    const blocks = [...src.matchAll(/(?:prisma|tx)\.orderShipment\.(update|updateMany|create)\(/g)]
    const withCarrier = blocks.filter((b) => {
      const body = src.slice(b.index!, b.index! + 900)
      return /carrierStatus:\s*(?!true\b)[A-Za-z_]/.test(body)
    })
    expect(withCarrier.length).toBeGreaterThanOrEqual(3)
    const missing: string[] = []
    for (const b of withCarrier) {
      const body = src.slice(b.index!, b.index! + 900)
      const after = src.slice(b.index!, b.index! + 3000)
      if (!after.includes('stampCarrierMilestones(') && !/problemAt:/.test(body)) {
        missing.push(src.slice(b.index!, b.index! + 80).trim())
      }
    }
    expect(missing).toEqual([])
  })

  it('[blocker] ประทับได้ครั้งเดียว ห้ามเขียนทับ (ขนส่งลองส่งใหม่ได้หลายรอบต่อพัสดุใบเดียว)', () => {
    expect(src).toMatch(/where:\s*\{\s*id:\s*shipmentId,\s*problemAt:\s*null\s*\}/)
    // เขียนค่าลง problemAt ได้ที่เดียวในไฟล์ — ที่อื่นแตะไม่ได้เลย
    expect(src.match(/problemAt:\s*occurredAt/g) ?? []).toHaveLength(1)
  })

  it('[blocker] ประทับเฉพาะตอนสถานะเป็น "มีปัญหา" จริง ไม่ใช่ทุกสถานะ', () => {
    expect(src).toMatch(/if\s*\(isProblemCarrierStatus\(code\)\)\s*\{/)
  })
})
