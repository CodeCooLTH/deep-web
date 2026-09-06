// [blocker] ข้อตรวจ "ความเร็วตอบแชท" ต้องใช้เกณฑ์ตัวอย่างขั้นต่ำชุดเดียวกับหน้าร้านสาธารณะ
//
// feature 00060 · Hard Rule 16 — `Shop.chatResponseRate` มีค่าได้แม้มีบทสนทนาเดียว
// ตัวที่บังคับ "ข้อมูลพอจะพูดหรือยัง" คือ `resolveChatResponse()` (CHAT_RESPONSE_MIN_SAMPLE)
// ถ้าฝั่งตรวจสอบอ่านคอลัมน์ดิบ จะเกิดจอที่ป้ายบอก "ตอบแชทผ่าน" ขณะที่หน้าร้านของร้านเดียวกัน
// เลือกจะไม่พูดอะไรเลยเพราะข้อมูลไม่พอ — สองนิยามของคำเดียวกัน โดยไม่มี tsc/build ตัวไหนฟ้อง

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SERVICE = join(process.cwd(), 'src/services/inspection-auto-check.service.ts')

/** ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนี้ไว้ด้วย */
function sourceWithoutComments(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
}

describe('inspection-auto-check.service — ประตูตัวอย่างขั้นต่ำของอัตราตอบแชท', () => {
  it('🛑 ต้องเรียก resolveChatResponse() ไม่ใช่หยิบ shop.chatResponseRate มาตรง ๆ', () => {
    const src = sourceWithoutComments(SERVICE)
    expect(src).toContain('resolveChatResponse(')
    // ค่าที่ป้อนเข้า facts ต้องมาจากตัว resolve เท่านั้น
    expect(src).toMatch(/chatResponseRate:\s*resolveChatResponse\(/)
    expect(src).not.toMatch(/chatResponseRate:\s*shop\.chatResponseRate/)
  })

  it('ต้อง select ฟิลด์ที่ resolveChatResponse ต้องใช้ครบ — ขาดตัวเดียวเกณฑ์เงียบทันที', () => {
    const src = sourceWithoutComments(SERVICE)
    // ขาด chatResponseSampleSize = resolveChatResponse คืน null เสมอ ⇒ ข้อนี้ขึ้น
    // "ยังไม่มีข้อมูล" ตลอดกาลโดยไม่มี error สักตัว (ตรงข้ามกับบั๊กที่กฎนี้กัน แต่เงียบเท่ากัน)
    for (const field of ['chatResponseRate', 'chatMedianResponseSec', 'chatResponseSampleSize']) {
      expect(src).toContain(`${field}: true`)
    }
  })
})
