import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] กล่องสถิติร้านบนหน้าออเดอร์ `/o/[token]`
 *
 * 🛑 **จำนวนคอลัมน์ต้องผันตามจำนวนสถิติที่มีจริง**
 *
 * ร้านที่ยังไม่มีรีวิวมีสถิติช่องเดียว — กริดที่ตรึงไว้ 2 คอลัมน์ยังจองที่ให้ช่องที่
 * ไม่มีอยู่ ⇒ กล่องกองอยู่ครึ่งซ้าย เหลือครึ่งขวาว่างเปล่า
 * (หัวหน้าเห็นบนจอจริง 2026-08-29 — ร้าน 180 ออเดอร์ 0 รีวิว)
 *
 * เป็นบั๊กที่เกิดตอนเปลี่ยนจาก "แถวเดียวจัดกลาง" มาเป็นกริด: แถวเดียวยุบเองได้ กริดไม่ยุบ
 * และ **ม็อกอัพไม่ได้ครอบเคสนี้** เพราะข้อมูลตัวอย่างมีครบสองช่องเสมอ —
 * คลาสเดียวกับ `flex-header-truncation.md` (fixture ที่สวยเกินจริงซ่อนบั๊กไว้)
 *
 * 🛑 แดง = ห้าม merge
 */
const src = readFileSync(
  join(process.cwd(), 'src/app/(marketing)/o/[token]/ShopEvidence.tsx'),
  'utf8',
)
  .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(?<!:)\/\/.*$/gm, (m) => ' '.repeat(m.length))

describe('[blocker] กริดสถิติต้องยุบตามจำนวนที่มีจริง', () => {
  it('ต้องนับสถิติที่มีจริง ไม่ใช่ตรึงเลข 2', () => {
    expect(src, 'ต้องมีตัวนับ').toMatch(
      /const statCount = \(completedOrders != null \? 1 : 0\) \+ \(avgRating != null \? 1 : 0\)/,
    )
  })

  it('gridTemplateColumns ต้องมาจากตัวนับ — ห้าม hardcode repeat(2, …)', () => {
    expect(src, 'ต้อง repeat จากตัวนับ').toMatch(/gridTemplateColumns: `repeat\(\$\{statCount\}/)
    expect(src, 'ห้ามตรึง 2 คอลัมน์').not.toMatch(/gridTemplateColumns: 'repeat\(2,/)
  })

  it('ช่องเดียวต้องแคบลง ไม่ใช่ยืดเต็ม 600 กลายเป็นแถบยาว', () => {
    expect(src, 'ความกว้างต้องผันตามจำนวนช่อง').toMatch(/maxWidth: statCount > 1 \? 600 : \d+/)
  })

  it('ทั้งบล็อกยังต้องหายไปเมื่อไม่มีสถิติเลย', () => {
    /* ไม่มีอะไรจะบอก = ไม่ต้องแสดง — กติกาเดียวกับบล็อกอื่นทั้งหน้า
       🛑 เกณฑ์ต้องเป็น **"ไม่มีสถิติแล้วไม่มีอะไรออกจอ"** ไม่ใช่ *ท่าเขียน* ท่าใดท่าหนึ่ง —
       ร่างเดิมบังคับ `{hasStats && (` ซึ่งแดงทันทีที่บล็อกนี้ถูกแยกเป็นคอมโพเนนต์ของตัวเอง
       (2026-08-30 ตามม็อกอัพ v5 ที่วางสถิติกับช่องทางไว้คนละคอลัมน์) แล้วเปลี่ยนเป็น
       early return ซึ่ง **ให้ผลเดียวกันเป๊ะ** · ด่านที่ผูกกับท่าเขียนพังตอน refactor
       ทั้งที่กฎยังถูก — รับทั้งสองท่า แต่ต้องมีอย่างน้อยหนึ่ง */
    expect(src).toMatch(/const hasStats = completedOrders != null \|\| avgRating != null/)
    expect(src, 'ต้องมีตัวกั้นที่ทำให้บล็อกหายไปจริง').toMatch(
      /\{hasStats && \(|if \(!hasStats\) return null/,
    )
  })
})
