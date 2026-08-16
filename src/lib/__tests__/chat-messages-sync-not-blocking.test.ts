import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * [blocker] `syncMissingMessagesFromMeta` ต้องไม่อยู่ในเส้นทางที่ผู้ใช้รอ response
 *
 * วัดบน prod 2026-08-16 ด้วย Server-Timing จากเครื่องผู้ใช้จริง:
 *   auth 52.0 · **sync 1,740.6** · msgs 40.6 · enrich 67.6 · watermark 14.3 · total 1,915.2
 * = sync กิน **91% ของเวลาทั้งหน้า** และรอบนั้น `outcome=nothing-missing, added=0`
 * (วิ่งไปหา Meta ครบทุกขั้นเพื่อเติมศูนย์ข้อความ)
 *
 * ทำไมต้องมีเทสนี้: การเอากลับไป `await` เป็นการแก้ที่ "ดูสมเหตุสมผล" มาก — คอมเมนต์เดิมในโค้ด
 * เขียนไว้เองว่า *"ทำก่อน getMessages เพื่อให้ข้อความที่เพิ่งเติมโผล่ในรอบเดียวกันเลย"* ซึ่งอ่านแล้ว
 * ถูกทุกตัวอักษร คนถัดไปที่เจอบั๊ก "ข้อความมาช้า 6 วิ" จะย้ายกลับโดยสุจริต แล้วหน้าจอกลับไปช้า
 * 1.9 วินาทีอีกครั้งโดยไม่มี tsc/build/เทสตัวไหนฟ้อง — เพราะโค้ดถูกทุกบรรทัด สิ่งที่ผิดคือ
 * **ตำแหน่งที่มันถูกรอ**
 *
 * 🛑 ต้องตัดคอมเมนต์ออกก่อนสแกน — ไฟล์ปลายทางมีคำเตือนของกฎข้อนี้เขียนไว้เอง (มีคำว่า
 * `await syncMissingMessagesFromMeta` อยู่ในประโยคที่ห้ามมันด้วยซ้ำ) ถ้าไม่ตัดจะแดงค้างตลอดกาล
 * จากคำเตือนของตัวเอง — คลาสเดียวกับ grep gate ของ HR9 ที่แดงค้างเมื่อ 2026-08-02→03
 */
const ROUTE = 'src/app/api/chat/conversations/[id]/messages/route.ts'

/** ตัด block comment และ line comment ทิ้ง เหลือเฉพาะโค้ดจริง */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

describe('[blocker] GET .../messages — sync ต้องไม่บล็อก response', () => {
  const code = stripComments(readFileSync(join(process.cwd(), ROUTE), 'utf8'))

  it('ห้าม await syncMissingMessagesFromMeta ในเส้นทาง request', () => {
    expect(code).not.toMatch(/await\s+syncMissingMessagesFromMeta\s*\(/)
  })

  it('ต้องเรียกผ่าน after() — ไม่ใช่หายไปเฉย ๆ', () => {
    // ถ้าเทสข้อบนผ่านเพราะมีคน "ลบทิ้ง" แทนที่จะย้าย ข้อความที่ Meta ไม่ส่ง webhook จะหายถาวร
    // (เคสเดิมที่ user report 2026-07-30 "แชทเข้ามาไม่ครบ" — บน prod ยังเติมจริง 26–65%
    //  ของเธรดที่มีความเคลื่อนไหวในแต่ละวัน) ⇒ ข้อนี้คือด่านกันการ "แก้ให้เร็วโดยถอดของทิ้ง"
    expect(code).toMatch(/after\s*\(\s*syncMissingMessagesFromMeta\s*\(/)
  })

  it('ยังเรียกเฉพาะตอนไม่มี cursor เหมือนเดิม (เลื่อนดูประวัติเก่าไม่ต้อง sync)', () => {
    expect(code).toMatch(/if\s*\(\s*!parsed\.output\.cursor\s*\)/)
  })

  it('ยังปล่อย Server-Timing ออกไป — ครั้งหน้าที่มีคนบอกว่าช้าจะได้ไม่ต้องเริ่มจากศูนย์', () => {
    expect(code).toMatch(/"Server-Timing"/)
  })
})
