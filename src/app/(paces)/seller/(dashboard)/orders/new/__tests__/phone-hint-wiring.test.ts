/**
 * 🛑 [blocker] — โครงสร้างการต่อ `PhoneSuggestHint` เข้ากับ 3 จอ
 *
 * ทั้ง 3 ข้อในไฟล์นี้ **ผ่าน tsc / build / eslint / detector ทั้งหมด** เพราะโค้ดถูกทุกตัวอักษร
 * สิ่งที่ผิดคือ *ผลลัพธ์บนจอ* ซึ่งไม่มีด่านอัตโนมัติตัวไหนของโปรเจกต์มองเห็น —
 * เจอด้วย `/impeccable critique` เท่านั้น (2026-08-21, P0-1 · P0-2ก · B1)
 *
 * ที่มา: `docs/20 - Features/00014 - Customer Directory/EXTENSIONS-2026-08-21-phone-format.md`
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'src/app/(paces)/seller/(dashboard)/orders/new/components'
const read = (f: string) => readFileSync(join(process.cwd(), DIR, f), 'utf8')

/**
 * ตัดคอมเมนต์ก่อนสแกนเสมอ — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย
 * (กับดักเดียวกับ grep gate ของ HR9 ที่แดงค้างจากคำเตือนตัวเองเมื่อ 2026-08-02→03)
 */
const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\/.*$/gm, '')

const CALLERS = ['CustomerQuickBlock.tsx', 'CustomerSearchSheet.tsx', 'CustomerSelectBlock.tsx']

describe('[blocker] P0-1 — error ตอนกดบันทึกต้องไปถึงผู้ใช้', () => {
  /**
   * ค่าที่มี chip = ค่าที่ยังบันทึกไม่ผ่าน**เสมอ** ⇒ ถ้าผู้เรียกเลือกระหว่าง hint กับ error
   * ด้วยเทอร์นารี error จะไม่มีวันถูก render เลยไม่ว่ากดบันทึกกี่ครั้ง ขณะที่ OrderCreateForm
   * ยิง toast ว่า "ดูช่องที่ทำเครื่องหมายสีแดง" ⇒ ร้านกวาดตาหาสีแดงที่ไม่มีอยู่จริง
   */
  it.each(['CustomerQuickBlock.tsx', 'CustomerSelectBlock.tsx'])(
    '%s ส่ง errorMessage เข้า PhoneSuggestHint',
    (f) => {
      const src = stripComments(read(f))
      const at = src.indexOf('<PhoneSuggestHint')
      expect(at, `${f} ไม่ได้ render PhoneSuggestHint`).toBeGreaterThan(-1)
      const tag = src.slice(at, src.indexOf('/>', at))
      expect(tag, 'ไม่ได้ส่ง errorMessage — error ตอนกดบันทึกจะหายไปทั้งหมด').toMatch(
        /errorMessage=/,
      )
    },
  )

  it.each(['CustomerQuickBlock.tsx', 'CustomerSelectBlock.tsx'])(
    '%s ใส่ is-invalid ที่ช่องเบอร์เมื่อมี error (toast ชี้ไปที่สีแดงที่มีอยู่จริง)',
    (f) => {
      const src = stripComments(read(f))
      expect(src).toMatch(/contactErrorMessage \? 'is-invalid'/)
    },
  )
})

describe('[blocker] B1 — live region ต้อง mount ค้าง ห้ามผู้เรียกครอบด้วยเทอร์นารี', () => {
  /**
   * `role="status"` ที่ mount พร้อมเนื้อหา screen reader จะไม่ประกาศ — และเงื่อนไขที่ผู้เรียก
   * เคยใช้ครอบ (`hasPhoneHint`) เป็นตัวเดียวกับที่ component เช็คภายในอยู่แล้ว
   * เทอร์นารีนั้นจึงไม่มีผลกับภาพเลย มีแต่ผลเสีย
   */
  it.each(CALLERS)('%s render <PhoneSuggestHint> โดยไม่มีเงื่อนไขนำหน้า', (f) => {
    const src = stripComments(read(f))
    const at = src.indexOf('<PhoneSuggestHint')
    expect(at).toBeGreaterThan(-1)
    // 120 ตัวอักษรก่อนแท็ก ต้องไม่มี `? <` หรือ `&& <` ที่เป็นตัวคุมการ mount
    const before = src.slice(Math.max(0, at - 120), at)
    expect(before, 'พบเทอร์นารี/&& ครอบ PhoneSuggestHint — live region จะไม่ประกาศ').not.toMatch(
      /[?&]&?\s*$|\?\s*$/,
    )
  })
})

describe('[blocker] P0-2ก — เดสก์ท็อปต้องไม่เปิด dropdown ทับ chip', () => {
  /**
   * dropdown ของ CustomerSelectBlock เป็น portal `position:fixed` ที่ `anchor.bottom + 4` z-70
   * ซึ่งทับ chip ที่อยู่ใน flow ใต้ anchor เดียวกันพอดี แล้วแผ่นที่มาทับเขียนว่า
   * "ไม่พบลูกค้าเดิม — พิมพ์ต่อเพื่อบันทึกเป็นลูกค้าใหม่" = สั่งให้สร้างลูกค้าซ้ำด้วยเบอร์เพี้ยน
   *
   * CustomerQuickBlock ได้ด่านนี้ตั้งแต่แรก เดสก์ท็อปไม่ได้ — เหตุผลเดียวกันทุกตัวอักษร
   */
  it('onContactChange มีด่าน hasPhoneSuggestion ก่อนเรียก runSearch', () => {
    const src = stripComments(read('CustomerSelectBlock.tsx'))
    const at = src.indexOf('const onContactChange')
    expect(at).toBeGreaterThan(-1)
    const body = src.slice(at, src.indexOf('const onNameChange', at))
    const guard = body.indexOf('hasPhoneSuggestion(')
    const search = body.indexOf('runSearch(')
    expect(guard, 'ไม่มีด่าน hasPhoneSuggestion ใน onContactChange').toBeGreaterThan(-1)
    expect(search).toBeGreaterThan(-1)
    expect(guard, 'ด่านอยู่หลัง runSearch — dropdown เปิดไปแล้ว').toBeLessThan(search)
  })

  it('CustomerQuickBlock ยังมีด่านเดิมอยู่ (ห้ามถอยกลับ)', () => {
    const src = stripComments(read('CustomerQuickBlock.tsx'))
    expect(src).toMatch(/if \(hasPhoneSuggestion\(t\)\) return/)
  })
})
