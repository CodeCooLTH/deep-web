/**
 * [blocker] กติกาที่หน้ารีวิวฝั่งผู้ขายต้องรักษาไว้ — feature 00041 Batch E
 *
 * เทสนี้อ่านซอร์สแทนที่จะ render เพราะ vitest ของโปรเจกต์ตั้ง `environment: "node"`
 * และรีโปไม่มี jsdom/testing-library — สิ่งที่ต้องกันคือ "มีคนแก้กลับ" ไม่ใช่พฤติกรรม runtime
 *
 * 🛑 แดง = ห้าม merge
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

const DIR = join(process.cwd(), 'src/app/(paces)/seller/(dashboard)/reviews')

const read = (rel: string) => readFileSync(join(DIR, rel), 'utf8')

/** ตัดคอมเมนต์ออกก่อนตรวจ — ไฟล์พวกนี้อธิบายกฎไว้ในคอมเมนต์ ถ้าไม่ตัดจะ match ตัวหนังสือที่อธิบายกฎเอง
 *  (บทเรียน HR9: gate ที่ match คำเปล่า ๆ จะแดงถาวรเพราะไฟล์ที่ทำถูกกฎมักอ้างชื่อกฎไว้บนหัวไฟล์) */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')
}

describe('หน้ารีวิวฝั่งผู้ขาย — กติกาที่ห้ามหลุด', () => {
  // ตัวนับบนแท็บกับรายการที่ตารางแสดง ต้องมาจาก predicate เดียวกัน
  // ไม่งั้นกดเลข 7 เข้าไปเจอ 6 (เคสจริงที่เคยเกิดกับ Command Center — นับด้วย SQL กรองด้วย TS)
  it('ตัวนับ "ยังไม่ตอบ" กับตัวกรอง ใช้เกณฑ์ !shopReply เหมือนกัน', () => {
    const src = stripComments(read('components/ProductReviews.tsx'))

    expect(src).toContain('reviews.filter((r) => !r.shopReply).length')
    expect(src).toContain("tab === 'unanswered' ? reviews.filter((r) => !r.shopReply) : reviews")
  })

  // ตารางต้องกินรายการที่กรองแล้ว ไม่ใช่ก้อนดิบ
  // (`/orders` เคยมีบั๊กนี้: ชิปกรองทำงานบนมือถือแต่เดสก์ท็อปรับ `orders` ดิบ → `?stage=` ไม่มีผลเลย)
  it('ตารางรับ visibleReviews ไม่ใช่ reviews ดิบ', () => {
    const src = stripComments(read('components/ProductReviews.tsx'))

    expect(src).toMatch(/data:\s*visibleReviews/)
    expect(src).not.toMatch(/data:\s*reviews\s*,/)
  })

  // Verified-Means-Green: เขียวสงวนไว้กับข้อเท็จจริงที่คำนวณได้ (งานค้าง = 0)
  // ห้ามมี badge "ตอบแล้ว" สีเขียวรายแถว — คำตอบที่แสดงอยู่คือหลักฐานในตัวมันเอง
  it('ไม่มี badge "ตอบแล้ว" สีเขียวรายแถว', () => {
    const reply = stripComments(read('components/ShopReplyBlock.tsx'))

    // 🛑 ต้องจับ "ป้ายที่เขียนว่าตอบแล้ว" ไม่ใช่คำว่า `ตอบแล้ว` เปล่า ๆ —
    // toast `บันทึกคำตอบแล้ว`/`ลบคำตอบแล้ว` มีสตริงนั้นอยู่ข้างในพอดี เช็คแบบ substring
    // จะแดงตลอดกาลทั้งที่ไม่มีการละเมิด (บทเรียนเดียวกับ grep gate ของ HR9)
    expect(reply).not.toMatch(/>\s*ตอบแล้ว\s*</)
    expect(reply).not.toContain('bg-success')
  })

  // ห้ามตัดข้อความดิบด้วย maxLength — ผู้ใช้วางข้อความยาวมาแล้วหางหายเงียบ ๆ จะไม่รู้ตัว
  // ต้องปล่อยให้พิมพ์เกินแล้วบล็อกที่ปุ่มบันทึกแทน (กติกาเดียวกับ PrivateReplyModal)
  it('textarea คำตอบไม่ใช้ maxLength ตัดดิบ แต่บล็อกที่ปุ่ม', () => {
    const reply = stripComments(read('components/ShopReplyBlock.tsx'))

    expect(reply).not.toMatch(/maxLength/)
    expect(reply).toContain('disabled={saving || !trimmed || overLimit}')
  })

  // ปุ่มไอคอนบนมือถือต้อง size-11 (44px) — ปุ่มขนาดเดสก์ท็อป (btn-sm = 30px) เล็กเกินสำหรับนิ้ว
  it('ปุ่มแก้ไข/ลบ บนมือถือใช้ size-11', () => {
    const reply = stripComments(read('components/ShopReplyBlock.tsx'))

    expect(reply).toMatch(/compact \? 'size-11' : 'btn-sm'/)
  })

  // overlay ที่ประกอบเองด้วย React state ต้องล็อก scroll เอง
  // (Preline สั่งให้ฟรี แต่โปรเจกต์นี้แปลงเป็น controlled div เป็นมาตรฐาน จึงหลุดทุกใบถ้าไม่เรียกเอง)
  it('lightbox รูปแนบเรียก useLockBodyScroll', () => {
    const gallery = stripComments(read('components/ReviewImageGallery.tsx'))

    expect(gallery).toContain('useLockBodyScroll(isOpen)')
  })

  // แถวเก่าก่อน migration มี shopReplyComment ได้โดยไม่มี shopRepliedAt
  // ถ้านับว่า "ตอบแล้ว" จากข้อความอย่างเดียว การ์ดจะ render "ตอบเมื่อ Invalid Date"
  it('นับว่าตอบแล้วต้องมีทั้งข้อความและเวลา', () => {
    const page = stripComments(read('page.tsx'))

    expect(page).toContain('review.shopReplyComment && review.shopRepliedAt')
  })

  // ชื่อผู้รีวิว: ต้องไม่กลับไปเป็นคำเดียวกันทุกแถว
  it('ไม่ใช้คำว่า "ผู้ใช้ที่ลงทะเบียน" เป็นชื่อผู้รีวิวอีกแล้ว', () => {
    expect(stripComments(read('page.tsx'))).not.toContain('ผู้ใช้ที่ลงทะเบียน')
  })

  // ── ต่อไปนี้คือสิ่งที่ critique จับได้และเพิ่งแก้ ห้ามย้อนกลับ ──

  // ดราฟต์ต้องอยู่ที่ตาราง ไม่ใช่ใน ShopReplyBlock: แถวถูก unmount ตอนสลับแท็บ/เปลี่ยนหน้า
  // และเดสก์ท็อป+มือถือ render แถวเดียวกันพร้อมกัน ⇒ เก็บในลูกจะได้ดราฟต์คนละชุด/หายเงียบ
  it('ดราฟต์คำตอบถูกยกไปเก็บที่ตาราง ไม่ใช่ state ในบล็อก', () => {
    const reply = stripComments(read('components/ShopReplyBlock.tsx'))
    const table = stripComments(read('components/ProductReviews.tsx'))

    expect(reply).not.toMatch(/useState\([^)]*draft/i)
    expect(reply).toContain('onDraftChange')
    expect(table).toContain('const [drafts, setDrafts]')
    // เปิดแถวเดิมซ้ำต้องไม่เขียนทับดราฟต์ที่ค้างอยู่
    expect(table).toContain('row.id in prev ? prev :')
  })

  // สาขา editing เคยไม่อ่าน compact เลย → ปุ่มบันทึก/ยกเลิกบนมือถือสูง ~31.5px
  it('ปุ่มในฟอร์มตอบกลับบนมือถือสูงถึงเกณฑ์นิ้ว', () => {
    const reply = stripComments(read('components/ShopReplyBlock.tsx'))
    const editingBranch = reply.slice(reply.indexOf('if (editing)'), reply.indexOf('if (reply)'))

    expect(editingBranch).toContain('min-h-11')
    expect(editingBranch).not.toMatch(/className="btn btn-sm/)
  })

  // ผู้ขายต้องรู้ว่ากำลังเขียนของสาธารณะ ก่อนกดบันทึก ไม่ใช่รู้ตอนกดลบ
  it('ฟอร์มตอบกลับบอกว่าลูกค้าจะเห็นคำตอบนี้', () => {
    const reply = stripComments(read('components/ShopReplyBlock.tsx'))
    const editingBranch = reply.slice(reply.indexOf('if (editing)'), reply.indexOf('if (reply)'))

    expect(editingBranch).toContain('ลูกค้าจะเห็นคำตอบนี้')
  })

  // empty state ต้องไม่บอกว่า "ยังไม่มีรีวิว" ตอนที่กรองอยู่ — ขัดกับตัวนับบนหัวการ์ดที่เพิ่งบอกว่ามี
  it('empty state แยกตามบริบท (ค้นหา / แท็บยังไม่ตอบ / ไม่มีจริง)', () => {
    const table = stripComments(read('components/ProductReviews.tsx'))

    expect(table).toContain('ไม่พบรีวิวที่ตรงกับคำค้นหา')
    expect(table).toContain('ตอบครบทุกรีวิวแล้ว')
  })

  // ช่องค้นหาเขียนว่า "ค้นหารีวิว" — ต้องค้นเนื้อรีวิวได้จริง
  it('ค้นหาครอบ comment ไม่ใช่แค่ชื่อสินค้า/ชื่อคน', () => {
    const table = stripComments(read('components/ProductReviews.tsx'))

    expect(table).toContain('globalFilterFn')
    expect(table).toMatch(/r\.comment \?\? ''/)
  })

  // role="tab" ที่ไม่มี tablist ครอบ = ARIA ไม่สมบูรณ์ AT ไม่ประกาศตำแหน่ง
  it('แท็บมี role="tablist" ครอบ', () => {
    const table = stripComments(read('components/ProductReviews.tsx'))

    expect(table).toContain('role="tablist"')
  })

  // คะแนนดาวเป็นไอคอนล้วน ไม่มีตัวเลขกำกับที่ไหน — ถ้าไม่มีชื่อ ผู้ใช้ screen reader ไม่ได้ยินคะแนนเลย
  it('Rating มีชื่อให้ screen reader และใช้ role ที่รองรับ', () => {
    const rating = stripComments(readFileSync(join(process.cwd(), 'src/components/Rating.tsx'), 'utf8'))

    expect(rating).toContain('role="img"')
    expect(rating).toMatch(/aria-label=\{`\$\{rating\} จาก 5 ดาว`\}/)
  })
})
