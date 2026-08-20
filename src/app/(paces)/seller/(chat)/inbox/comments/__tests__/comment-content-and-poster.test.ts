/**
 * [blocker] regression guard ของ 2 บั๊กที่ user เจอเองบน prod 2026-08-20
 *
 *   A. คอมเมนต์รูปล้วนขึ้นว่า "(ไม่มีข้อความ)" — ทั้งแถวพรีวิวและบับเบิลไม่เคยดู `attachmentUrl`
 *   B. รูปปกโพสต์ล้นออกนอกกล่อง ไปวาดทับแถวยอด ไลก์/คอมเมนต์/แชร์ บนมือถือ
 *
 * ทำไมสแกนซอร์ส: vitest ตั้ง `environment: "node"` และรีโปไม่มี jsdom/testing-library จึง render
 * component จริงไม่ได้ (แพตเทิร์นเดียวกับ `inbox-list-no-empty-early-return.test.ts`)
 *
 * 🛑 ตัดคอมเมนต์ก่อนสแกนเสมอ — ไฟล์ที่ทำ *ถูก* คือไฟล์ที่เขียนคำเตือนของกฎนี้ไว้ด้วย และคำเตือนนั้น
 * อ้างคลาส/สตริงที่ห้ามใช้เต็ม ๆ ⇒ สแกนดิบจะแดงค้างตลอดกาลจากคำเตือนของตัวเอง แล้วถูกบันทึกเป็น
 * "หนี้" ทั้งที่ไม่มีการละเมิดเลย (เกิดมาแล้วกับ grep gate ของ HR9 2026-08-02→03)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = join(
  process.cwd(),
  'src/app/(paces)/seller/(chat)/inbox/comments/CommentsClient.tsx',
)

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      return !t.startsWith('//') && !t.startsWith('*')
    })
    .join('\n')
}

describe('[blocker] A — เนื้อหาคอมเมนต์ต้องแยก 3 สถานะ', () => {
  const src = stripComments(readFileSync(SOURCE, 'utf8'))

  it('ต้องตัดสินผ่าน commentContentState() ไม่เขียนเงื่อนไขเอง', () => {
    expect(src, 'เกณฑ์ต้องมาจาก SSOT ไม่ใช่เขียน message||... เองในไฟล์').toMatch(/commentContentState\(/)
  })

  /**
   * ผูกกับ **สิ่งที่ผู้ใช้เห็นจริง** ไม่ใช่จำนวนครั้งที่เรียกฟังก์ชัน — ร่างแรกของเทสนี้เช็คแค่
   * `calls.length >= 2` ซึ่งแยกไม่ออกระหว่าง "ใช้ทั้งสองจอ" กับ "ใช้สองครั้งในจอเดียว"
   * (พิสูจน์ด้วย mutation แล้วว่ามันไม่แดง — เทสที่จับ regression ของตัวเองไม่ได้คือเทสที่ไร้ค่า)
   */
  it('แถวพรีวิวต้องมีคำแทนรูป — แถวนั้นไม่มีรูปคอมเมนต์ให้ดูเลย', () => {
    expect(src, 'รูปบนแถวคือปกโพสต์ ไม่ใช่รูปที่ลูกค้าแนบ ⇒ ต้องมีคำเป็นตัวแทน').toMatch(
      /t\.comments\.commentAttachmentOnly/,
    )
  })

  it('ทั้งพรีวิวและบับเบิลต้องพูดคำเดียวกันตอนไม่มีข้อมูลเนื้อหา', () => {
    const uses = src.match(/t\.comments\.contentUnavailable/g) ?? []
    expect(uses.length, 'จอเดียวกันบอกคนละคำ = ผู้ขายไม่รู้ว่าจะเชื่ออันไหน').toBeGreaterThanOrEqual(2)
  })

  it('ต้องไม่มีคีย์ noText ที่โกหกหลงเหลือ', () => {
    // `(ไม่มีข้อความ)` อ้างว่า "เรารู้แล้วว่าลูกค้าไม่ได้พิมพ์" ทั้งที่ความจริงคือ "เราไม่มีข้อมูล"
    expect(src).not.toMatch(/t\.comments\.noText/)
  })

  it('ต้องมีทางไป Facebook ในบับเบิลตอนไม่มีข้อมูลเนื้อหา', () => {
    // ปุ่มเดิมผูกกับแถวคอลัมน์ซ้าย ซึ่งถูก hidden ทันทีที่เปิดเธรดบนมือถือ ⇒ ไปไม่ถึงจากบับเบิล
    expect(src, 'บับเบิลต้องประกอบลิงก์เอง ไม่ใช่พึ่งเมนูของแถวที่มองไม่เห็นแล้ว').toMatch(
      /commentPermalink\(postPermalink,/,
    )
  })
})

describe('[blocker] B — รูปปกโพสต์ต้องอยู่ในกรอบพ่อโดยโครงสร้าง', () => {
  const src = stripComments(readFileSync(SOURCE, 'utf8'))

  it('รูปปกต้องเป็น absolute inset-0 size-full ไม่ใช่ตั้งเพดานความสูงของตัวเอง', () => {
    // max-h-* บนรูปปก = เพดานที่ไม่ผูกกับความสูงจริงของกล่องแม่ ⇒ พ่อหดแต่ลูกไม่หด ⇒ ล้นไปทับแถวยอด
    expect(src, 'ห้ามกลับไปใช้ max-h-72 บนรูปปกโพสต์').not.toMatch(/max-h-72[^"]*object-contain/)
    expect(src).toMatch(/absolute inset-0 size-full object-contain/)
  })

  it('กล่องรูปปกต้องมี overflow-hidden เป็นตาข่าย', () => {
    expect(src).toMatch(/bg-default-100 relative block min-h-40 w-full flex-1 overflow-hidden/)
  })
})
