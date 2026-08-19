import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] ห้าม emoji ในค่าที่ถูกนำไปแสดงบนจอ — รวม **ค่าที่อยู่ใน `src/lib/`** (Hard Rule 12)
 *
 * ## ช่องโหว่ที่ด่านนี้ปิด (พบ 2026-08-19)
 *
 * ฟอร์มเพิ่มสินค้าแสดงชิปประเภทเป็น 📦 💻 🛠️ 🔁 มาตลอด — ผิด HR12 ตรงตัว
 * ("ห้าม emoji ใน UI ทุกจุด ใช้ icon จริงเท่านั้น" และ 📦 ถูกยกเป็นตัวอย่างในกฎนั้นเอง)
 *
 * 🛑 **grep gate ของ HR12 มองไม่เห็น** เพราะมันสแกนเฉพาะ *ไฟล์ UI ที่ถูกแก้ในรอบนั้น*
 * ส่วนค่าจริงอยู่ใน `src/lib/product-types/registry.ts` ซึ่งเป็นไฟล์ข้อมูล ไม่ใช่ไฟล์ UI
 * ⇒ ไม่มีใครแก้ ก็ไม่มีใครสแกน อยู่ได้เงียบ ๆ ตลอดกาล
 *
 * ตารางข้อมูลใน `src/lib/` คือที่ที่ **ข้อความบนจอถูกเก็บจริง** ของโปรเจกต์นี้ (label / ป้าย /
 * ชื่อสถานะ) จึงต้องอยู่ใต้กฎเดียวกับ JSX
 *
 * ## carve-out
 *
 * CLAUDE.md อนุญาต **dingbat สีเดียว** (★☆✓✗♡▾) และ emoji ใน **คอมเมนต์** (marker `🛑`)
 * — ตัดคอมเมนต์ก่อนสแกนเสมอ ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย
 *
 * 🛑 แดง = ห้าม merge
 */

const ROOT = process.cwd()

/** emoji จริง — ไม่รวมช่วงของ dingbat ที่ carve-out ไว้ */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{1F300}-\u{1F9FF}\u{2B00}-\u{2BFF}]/u
/** dingbat สีเดียวที่ CLAUDE.md อนุญาต */
const ALLOWED = new Set(['★', '☆', '✓', '✗', '♡', '▾', '‹', '›', '·'])

const blankComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, (m, indent: string) => indent)

const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? e.name === '__tests__'
        ? []
        : walk(`${dir}/${e.name}`)
      : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')
        ? [`${dir}/${e.name}`]
        : [],
  )

describe('[blocker] ตารางข้อมูลใน src/lib ห้ามเก็บ emoji ไว้แสดงบนจอ', () => {
  it('สแกนทั้ง src/lib', () => {
    const offenders: string[] = []
    for (const rel of walk('src/lib')) {
      blankComments(readFileSync(join(ROOT, rel), 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          for (const ch of line) {
            if (ALLOWED.has(ch)) continue
            if (EMOJI.test(ch)) {
              offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 60)}`)
              break
            }
          }
        })
    }
    expect(offenders, 'ใช้ชื่อไอคอน tabler แทน emoji (Hard Rule 12)').toEqual([])
  })
})
