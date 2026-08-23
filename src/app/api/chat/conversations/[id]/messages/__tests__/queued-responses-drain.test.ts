/**
 * [blocker] ทุกเส้นทางที่ตอบ "เข้าคิวแล้ว" ต้องสั่งระบายห้องด้วย (F3 รอบแก้ 1)
 *
 * ที่มา: เส้นทาง 207 (การ์ดสินค้าบางชุดเข้าคิวสำเร็จ บางชุดล้ม) **ไม่มี `after(deliverRoom(...))`**
 * ทั้งที่แถวเข้าคิวไปแล้วจริง ⇒ ผู้ขายต้องรอตัวเก็บงานค้างนานถึง 1 นาที ทั้งที่คำขอนี้ระบายให้ฟรีได้
 * ไม่มี tsc/build/เทสตัวไหนฟ้อง เพราะโค้ดถูกทุกตัวอักษร — สิ่งที่ขาดคือบรรทัดที่ไม่ได้เขียน
 *
 * 🛑 เป็นเทสอ่านซอร์ส (ตามแบบเดียวกับ `appointment-message.test.ts` ในโฟลเดอร์นี้): handler import
 * โมดูลฝั่ง server สิบกว่าตัว การ mock ทั้งหมดจะได้เทสที่พิสูจน์แค่ว่า mock ถูกเรียก
 * มันกัน "การถอด/ลืมใส่เงียบ ๆ" เท่านั้น ไม่ได้แทนการทดสอบจริง
 *
 * 🛑 ตัดคอมเมนต์ก่อนสแกนเสมอ — ไฟล์ที่ทำถูกกฎคือไฟล์ที่เขียนคำอธิบายกฎนั้นไว้ด้วย
 * (คลาสเดียวกับ grep gate ของ HR9 ที่แดงค้างจากคำเตือนตัวเองเมื่อ 2026-08-02→03)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROUTE = join(process.cwd(), 'src/app/api/chat/conversations/[id]/messages/route.ts')

/** บรรทัดที่ตัดคอมเมนต์ออกแล้ว (คงจำนวนบรรทัดเท่าเดิมเพื่อให้เลขบรรทัดยังตรงกับไฟล์จริง) */
function codeLines(source: string): string[] {
  let inBlock = false
  return source.split('\n').map((raw) => {
    let line = raw
    if (inBlock) {
      const end = line.indexOf('*/')
      if (end === -1) return ''
      line = line.slice(end + 2)
      inBlock = false
    }
    const openBlock = line.indexOf('/*')
    if (openBlock !== -1) {
      const close = line.indexOf('*/', openBlock + 2)
      if (close === -1) {
        inBlock = true
        line = line.slice(0, openBlock)
      } else {
        line = line.slice(0, openBlock) + line.slice(close + 2)
      }
    }
    const lineComment = line.indexOf('//')
    if (lineComment !== -1) line = line.slice(0, lineComment)
    return line
  })
}

/** ระยะที่ยอมให้ `after(...)` อยู่เหนือ `return` — พอสำหรับ object ที่กินหลายบรรทัด ไม่กว้างจนไร้ความหมาย */
const LOOKBACK = 20

describe('[blocker] POST /messages — เส้นทางที่ตอบ 202/207 ต้องสั่งระบายห้อง', () => {
  const lines = codeLines(readFileSync(ROUTE, 'utf8'))
  const queuedResponses = lines
    .map((text, idx) => ({ line: idx + 1, text }))
    .filter((l) => /status:\s*(202|207)\b/.test(l.text))

  it('มีเส้นทางที่ตอบ "เข้าคิวแล้ว" อยู่จริง (กันเทสเขียวเพราะไม่เจออะไรเลย)', () => {
    // ถ้าวันหนึ่งไม่มีเส้นทาง 202/207 เหลือ ลูปข้างล่างจะไม่วนสักรอบแล้วเขียวโดยไม่ได้ตรวจอะไร
    expect(queuedResponses.length).toBeGreaterThanOrEqual(6)
  })

  it('ทุกเส้นทางมี after(deliverRoom(...)) กำกับอยู่เหนือขึ้นไป', () => {
    const missing = queuedResponses.filter(({ line }) => {
      const from = Math.max(0, line - 1 - LOOKBACK)
      return !lines.slice(from, line).some((l) => /after\(\s*deliverRoom\(/.test(l))
    })

    expect(
      missing.map((m) => `บรรทัด ${m.line}: ${m.text.trim()}`),
      'เส้นทางที่เข้าคิวแล้วแต่ไม่สั่งระบาย — ผู้ขายต้องรอตัวเก็บงานค้างนานถึง 1 นาที',
    ).toEqual([])
  })
})
