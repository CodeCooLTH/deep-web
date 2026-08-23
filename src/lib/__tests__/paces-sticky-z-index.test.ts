/**
 * ด่านกัน "ปุ่มลอยทับหัวหน้าจอ" — พื้น z-index ของ `.btn` ใน Paces
 *
 * ## ข้อเท็จจริงที่เป็นต้นเหตุ
 *
 * `.btn` ของธีม Paces ตั้งไว้ในตัวมันเองว่า:
 *
 * ```css
 * .btn { position: relative; z-index: 10; ... }
 * ```
 *
 * (ยืนยันจาก **CSS ที่คอมไพล์แล้ว** ที่ dev server เสิร์ฟจริง ไม่ใช่จากการอ่านซอร์สธีม —
 * `@layer components { .btn { z-index: 10; … position: relative; } }`)
 *
 * แปลว่า **ทุกปุ่มในแอปฝั่ง seller/admin ลอยอยู่ที่ชั้น 10 อยู่แล้วโดยที่ไม่มีใครเขียนสั่ง**
 *
 * ## บั๊กที่ด่านนี้กัน
 *
 * หัวหน้าจอ/แถบเครื่องมือที่เขียน `sticky … z-10` จะได้ค่า **เท่ากับ** ปุ่มทุกตัวในเนื้อหาที่
 * เลื่อนอยู่ข้างล่าง · เมื่อ z เสมอกัน CSS ตัดสินด้วย **ลำดับใน DOM** ⇒ ปุ่มที่อยู่ทีหลังชนะ
 * ⇒ เลื่อนหน้าจอแล้วปุ่ม/ชิปลอยขึ้นไปทับชื่อหน้าและปุ่มย้อนกลับ
 *
 * เกิดจริงบน prod 2026-08-23 — user ส่งภาพหน้า `/products/new` มา: ชิปราคาแนะนำ
 * (`฿49 ฿99 …` ซึ่งเป็น `label.btn`) ทับคำว่า "เพิ่มสินค้าใหม่" และปุ่มย้อนกลับ
 *
 * 🛑 **ไม่มี gate ไหนของโปรเจกต์จับได้เลย** — `tsc`/build/eslint/theme-guard ผ่านหมด เพราะ
 * `z-10` เป็นคลาสที่ถูกต้องทุกตัวอักษร สิ่งที่ผิดคือ *ค่ามันบังเอิญเท่ากับของที่ธีมตั้งไว้ให้*
 * ซึ่งมองไม่เห็นจากไฟล์ที่กำลังแก้ ต้องเปิด CSS ของธีมถึงจะรู้
 *
 * ## เกณฑ์
 *
 * `sticky`/`fixed` ใน `(paces)/**` ห้ามใช้ `z-10` หรือต่ำกว่า — ต้อง `z-20` ขึ้นไป
 *
 * 🛑 ครอบ **ทุกตัว** ไม่มีข้อยกเว้น แม้แต่ตัวที่ "ตอนนี้ยังไม่มีอาการ" เพราะตัวที่ไม่มีอาการ
 * รอดด้วย *ลำดับ DOM* ไม่ใช่ด้วย z ที่ถูก (เช่นแถบสรุปท้ายหน้า auto-reply ที่อยู่ท้ายไฟล์พอดี)
 * — วันที่มีคนแทรกปุ่มไว้หลังมัน หรือย้ายบล็อก มันจะพังทันทีโดยไม่มีใครโยงกลับมาถึงที่นี่ได้
 * carve-out ในด่าน = ที่ที่ของกลับมาซ่อน (`rule-must-be-enforced-not-described.md`)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const PACES = join(ROOT, 'src/app/(paces)')

/** พื้นของ `.btn` ตามธีม Paces — ตัวเลขนี้มาจาก CSS ที่คอมไพล์แล้ว ไม่ใช่ค่าที่เราตั้งเอง */
const BTN_Z_FLOOR = 10

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (name.endsWith('.tsx')) out.push(full)
  }
  return out
}

/**
 * ตัดคอมเมนต์ทิ้งก่อนสแกน
 *
 * 🛑 จำเป็น ไม่ใช่ของแถม — ไฟล์ที่ **ทำถูกตามกฎ** คือไฟล์ที่เขียนคำอธิบายกฎนี้ไว้ด้วย
 * (ซึ่งมีคำว่า `z-10` อยู่ในประโยค) ⇒ ด่านที่ไม่ตัดคอมเมนต์จะแดงใส่คนที่ทำถูก แล้วจะถูกปิดทิ้ง
 * (รอยเดิม: grep gate ของ HR9 แดงค้างจากคำเตือนของตัวเอง 2026-08-02→03 ·
 *  ด่าน component-declared-in-render 2026-08-12)
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('sticky/fixed ใน (paces) ต้องอยู่เหนือพื้น z-index ของ .btn', () => {
  it('[blocker] ห้าม sticky/fixed ตัวไหนใช้ z-10 หรือต่ำกว่า', () => {
    const files = walk(PACES)
    expect(files.length, 'ต้องเจอไฟล์ .tsx ใน (paces)').toBeGreaterThan(50)

    const offenders: string[] = []

    for (const full of files) {
      const code = stripComments(readFileSync(full, 'utf8'))

      /* ดู **ทีละ className** ไม่ใช่ทั้งไฟล์ — ไฟล์เดียวมีทั้ง sticky (z สูง) และ absolute (z-10)
         ปนกันได้ตามปกติ ถ้าเทียบระดับไฟล์จะฟ้องผิดตัว */
      for (const m of code.matchAll(/class(?:Name)?=\{?["'`]([^"'`]*)["'`]/g)) {
        const cls = m[1]
        if (!/\b(sticky|fixed)\b/.test(cls)) continue

        const z = /\bz-(\d+)\b/.exec(cls)
        if (!z) continue // ไม่ตั้ง z เลย = ไม่ได้อ้างว่าจะอยู่ข้างบน ปล่อยผ่าน

        if (Number(z[1]) <= BTN_Z_FLOOR) {
          offenders.push(`${full.slice(ROOT.length + 1)} → "${cls.trim().slice(0, 70)}"`)
        }
      }
    }

    expect(
      offenders,
      `sticky/fixed ที่ z ≤ ${BTN_Z_FLOOR} จะถูกปุ่ม (.btn = z-10 ในตัว) ที่อยู่ทีหลังใน DOM ทับ\n` +
        `แก้เป็น z-20 ขึ้นไป — ดู docs/conventions/paces-btn-z-index-floor.md\n` +
        offenders.join('\n'),
    ).toEqual([])
  })

  it('[blocker] หัวหน้าจอ fullscreen ต้องสูงกว่าพื้นของ .btn จริง ๆ', () => {
    /**
     * ตัวที่ผู้ใช้เจอกับตาบน prod — ปักหมุดไว้เฉพาะเจาะจงอีกชั้น เพราะด่านข้างบนเป็นกฎกว้าง
     * ที่วันหนึ่งอาจถูกผ่อน (เช่นเพิ่ม carve-out) แต่หน้านี้ห้ามถอยกลับไม่ว่ากรณีใด
     */
    const src = readFileSync(
      join(ROOT, 'src/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader.tsx'),
      'utf8',
    )
    const cls = /className="(sticky[^"]*)"/.exec(stripComments(src))
    expect(cls, 'ต้องมี className ของหัวสติกกี้').not.toBeNull()

    const z = /\bz-(\d+)\b/.exec(cls![1])
    expect(z, 'หัวสติกกี้ต้องตั้ง z-index ชัดเจน').not.toBeNull()
    expect(Number(z![1]), 'ต้องมากกว่าพื้นของ .btn').toBeGreaterThan(BTN_Z_FLOOR)
    /* ต่ำกว่าดรอปดาวน์ Choices (z-40 !important ใน safepay-overrides.css) — ไม่งั้นตัวเลือก
       ของ select ที่กางขึ้นบนจะถูกหัวหน้าจอทับแทน = ย้ายบั๊กไปอีกที่ ไม่ใช่แก้ */
    expect(Number(z![1]), 'ต้องต่ำกว่าดรอปดาวน์ Choices (40)').toBeLessThan(40)
  })
})
