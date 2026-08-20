/**
 * [blocker] กติกา "คอมเมนต์ระดับบนคืออันไหน" ต้องมีที่เดียว — ห้ามกรองซ้ำใน CommentsClient
 *
 * ที่มา (user เจอเองบน prod พร้อมภาพเทียบกับ Facebook 2026-08-20):
 * ลูกค้าคอมเมนต์ใต้โพสต์อัลบั้ม 2 ใบ **ระดับบนทั้งคู่** แต่ Meta ส่ง `parent_id` มาเป็น id ของ
 * อัลบั้มไม่ใช่ id ของคอมเมนต์ ⇒ เราบันทึกเป็น "reply ของคอมเมนต์ที่ไม่มีอยู่จริง" ⇒ ตัวประกอบ
 * ต้นไม้ทิ้งทั้งคู่ ⇒ จอเดียวกันขึ้น **"ยังไม่ตอบ 2" คู่กับ "ยังไม่มีความคิดเห็นในโพสต์นี้"**
 * คำว่า "สนใจ" ของลูกค้าค้างอยู่ 7 วันโดยไม่มีใครเห็น (ทั้ง prod เจอ 8 ใบ · 9 โพสต์ · 3 เพจ)
 *
 * `visibleTopLevelComments()` ถูกแก้ให้ยกคอมเมนต์กำพร้าขึ้นเป็นระดับบนแล้ว (เทสอยู่ที่
 * `src/lib/__tests__/comment-tree-visibility.test.ts`) — **แต่การแก้นั้นไม่มีผลเลย** ถ้า
 * `CommentsClient.tsx` ยังกรอง `!c.parentExternalId` ซ้ำอีกชั้นหลังจากนั้น ซึ่งเป็นสิ่งที่มันทำ
 * อยู่จริงก่อนรอบนี้
 *
 * 🛑 นี่คือหัวใจ: กติกาเดียวกันที่เขียนไว้ 2 ที่ **ที่หนึ่งจะล้าสมัยเสมอ — และตัวที่ล้าสมัยคือตัวที่
 * ชนะ เพราะมันรันทีหลัง** ตัวกรองใน client เขียนตอนที่ "ระดับบน" ยังแปลว่า `parentExternalId == null`
 * เฉย ๆ พอนิยามขยาย มันไม่ได้ขยายตาม และไม่มี `tsc`/build/theme-guard ตัวไหนเห็น เพราะโค้ดถูก
 * ทุกตัวอักษร สิ่งที่ผิดคือ *นิยามที่มันฝังไว้เอง*
 * (คลาสเดียวกับ docs/conventions/sibling-surface-parity.md — สถานะเดียวกันต้องมาจาก symbol เดียว)
 *
 * ทำไมสแกนซอร์ส: vitest ตั้ง `environment: "node"` และรีโปไม่มี jsdom/testing-library จึง render
 * component จริงไม่ได้ (แพตเทิร์นเดียวกับ `inbox-list-no-empty-early-return.test.ts`)
 *
 * 🛑 ต้องตัดคอมเมนต์ก่อนสแกน: ไฟล์ที่ทำ *ถูก* คือไฟล์ที่เขียนคำเตือนของกฎนี้ไว้ด้วย และคำเตือนนั้น
 * อ้างโค้ดผิดตัวอย่างเต็ม ๆ ⇒ สแกนดิบจะแดงค้างตลอดกาลจากคำเตือนของตัวเอง แล้วถูกบันทึกเป็น "หนี้"
 * ทั้งที่ไม่มีการละเมิดเลย (เกิดมาแล้วกับ grep gate ของ HR9 2026-08-02→03)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = join(
  process.cwd(),
  'src/app/(paces)/seller/(chat)/inbox/comments/CommentsClient.tsx',
)

/** ตัดคอมเมนต์ทิ้ง — บล็อก และบรรทัดที่ *เริ่มต้น* ด้วย `//` หรือ `*` เท่านั้น */
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

describe('[blocker] กติกา "ระดับบน" ต้องมาจาก symbol เดียว', () => {
  const stripped = stripComments(readFileSync(SOURCE, 'utf8'))

  it('CommentsClient ต้องไม่กรอง parentExternalId เอง', () => {
    // แดง = คอมเมนต์กำพร้ากลับไปหายจากเธรดอีกครั้ง แม้ lib จะยกขึ้นมาให้แล้ว
    expect(
      stripped,
      'ให้ลบตัวกรองนี้ทิ้ง แล้วพึ่ง visibleTopLevelComments() ที่เดียว — ไม่ใช่แก้ให้ตรงกันสองที่',
    ).not.toMatch(/\.filter\(\s*\([^)]*\)\s*=>\s*!\w+\.parentExternalId\s*\)/)
  })

  it('ต้องยังเรียก visibleTopLevelComments อยู่ — ไม่ใช่ประกอบต้นไม้เองในไฟล์', () => {
    expect(
      stripped,
      'ถ้าเลิกเรียกแล้วเขียนกติกาเองในไฟล์ เทสข้างบนจะเขียวโดยที่บั๊กกลับมาเงียบ ๆ',
    ).toContain('visibleTopLevelComments(')
  })
})
