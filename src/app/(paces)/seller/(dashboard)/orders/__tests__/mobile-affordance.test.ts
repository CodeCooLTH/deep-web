import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] 3 คลาสบั๊กที่ **เห็นได้เฉพาะบนมือถือจริง** — พบพร้อมกันบน TestFlight 2026-08-17
 *
 * ทั้งสามผ่าน `tsc`/build/eslint/theme-guard หมด เพราะคลาสถูกทุกตัวอักษร
 * สิ่งที่ผิดคือ **สมมติฐานว่าเครื่องมีเมาส์และหน้าไม่มีชั้นซ้อน**
 *
 * 🛑 แดง = ห้าม merge
 */

const ROOT = process.cwd()
const BASE = 'src/app/(paces)/seller/(dashboard)/orders'

/** ลบเนื้อคอมเมนต์แต่คงจำนวนบรรทัด — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย */
const blankComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, (m, indent: string) => indent)

const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.tsx') ? [`${dir}/${e.name}`] : [],
  )

const FILES = walk(BASE)
const read = (rel: string) => blankComments(readFileSync(join(ROOT, rel), 'utf8'))

describe('[blocker] affordance ที่พังเฉพาะบนมือถือ', () => {
  /**
   * ## 1. สีที่มีเฉพาะตอน hover = สีที่ไม่มีอยู่จริงบนมือถือ
   *
   * ปุ่มลบในฟอร์มสร้างออเดอร์เคยเป็น `text-default-300 hover:text-danger` ⇒ บนมือถือ
   * **ไม่มี hover เลย** ปุ่มจึงเป็นเทาจางตลอดกาล และ `default-300` บนพื้นขาวยังตกเกณฑ์
   * คอนทราสต์ของ non-text (ต้องการ 3:1) ⇒ ปุ่มที่ทำลายข้อมูลกลายเป็นสิ่งที่มองแทบไม่เห็น
   *
   * เกณฑ์: ห้ามให้ "สีที่สื่อความหมาย" (danger/primary/warning) โผล่เฉพาะตอน hover
   * ขณะที่สีตั้งต้นเป็นเทาจาง — ถ้าอยากได้ hover ให้เปลี่ยน **พื้น** (`hover:bg-danger/10`) แทน
   */
  it('ห้ามใช้สีความหมายเฉพาะตอน hover คู่กับสีตั้งต้นที่เป็นเทาจาง', () => {
    const hits: string[] = []
    for (const f of FILES) {
      read(f)
        .split('\n')
        .forEach((l, i) => {
          if (/text-default-[23]00[^"'`]*hover:text-(danger|primary|warning|success)/.test(l)) {
            hits.push(`${f.split('/').pop()}:${i + 1}`)
          }
        })
    }
    expect(hits, 'ใช้สีความหมายเป็นสีตั้งต้น แล้วให้ hover เปลี่ยนพื้นแทน').toEqual([])
  })

  /**
   * ## 2. `min-h-11` บน element ที่ไม่จัดกลางในตัวเอง = ตัวหนังสือลอยขึ้นบน
   *
   * `<a className="min-h-11">` ที่เป็นลูกของ flex row จะถูก **blockify** ⇒ `min-height: 44px`
   * มีผลจริง แต่ตัวอักษรไปนอนบนสุดของกล่อง 44px ขณะที่ไอคอนข้าง ๆ ถูก `items-center`
   * จัดกลางแถว ⇒ **เบอร์โทรลอยสูงกว่าไอคอน** (user เจอบน TestFlight)
   *
   * carve-out: `.btn` / `.badge` / `.form-input` ของ Paces จัดกลางในตัวอยู่แล้ว
   * (`_badge.css` = `inline-flex items-center justify-center`) และตัวแปรที่เก็บคลาสไว้เฉย ๆ
   */
  it('min-h-11 ต้องมากับ flex+items-center หรือ primitive ที่จัดกลางให้แล้ว', () => {
    const hits: string[] = []
    for (const f of FILES) {
      read(f)
        .split('\n')
        .forEach((l, i) => {
          if (!/min-h-11/.test(l)) return
          if (/(inline-)?flex/.test(l) && /items-center/.test(l)) return
          if (/\bbtn\b|\bbadge\b|form-input|form-select/.test(l)) return
          // บรรทัดที่แค่ "เก็บคลาสไว้ในตัวแปร/ส่งเป็น prop" ไม่ได้ผูกกับ element ที่นี่
          if (/^\s*(const|let)\s|className=\{`?\$\{/.test(l)) return
          if (/<[A-Z]\w*\s/.test(l)) return // ส่งเข้า component อื่น — ตัดสินที่ปลายทาง
          hits.push(`${f.split('/').pop()}:${i + 1}  ${l.trim().slice(0, 70)}`)
        })
    }
    expect(hits, 'เติม inline-flex items-center ให้ element นั้นจัดกลางเนื้อในตัวเอง').toEqual([])
  })

  /**
   * ## 3. overlay ที่เปิดจากในการ์ด ต้อง `createPortal` ออก `document.body`
   *
   * `OrderQrSheet` ถูกเปิดจาก `QrCodeButton` ซึ่งอยู่ในแถบปุ่มของการ์ดที่ห่อด้วย `relative z-10`
   * (ยกปุ่มขึ้นเหนือแผ่นลิงก์ที่ทับทั้งการ์ด) — **`z-index` ที่ไม่ใช่ `auto` สร้าง stacking context**
   * ⇒ `z-80` ของชีตแข่งได้แค่ภายในกลุ่มปุ่มนั้น ปุ่มของการ์ดใบอื่นจึงทะลุขึ้นมาทับ QR
   * จน **สแกนไม่ติด** (user เจอบน TestFlight)
   *
   * 🛑 ขอบเขตของด่านนี้คือ overlay ที่ **เปิดจากภายในการ์ด/แถวรายการ** เท่านั้น —
   * ชีตที่เปิดจากระดับหน้า (ตัวกรอง, ฟอร์มสร้างออเดอร์) ไม่มีชั้น `z-*` ครอบ จึงไม่มีบั๊กนี้
   * และการบังคับให้ portal ทั้งหมดคือการแก้สิ่งที่ยังไม่พังโดยไม่ได้ยืนยันทีละตัว
   * (ถ้าวันหนึ่งมีชีตใหม่เปิดจากการ์ด ให้เติมชื่อลงรายการนี้)
   */
  const OPENED_FROM_CARD = ['components/OrderQrSheet.tsx']

  for (const rel of OPENED_FROM_CARD) {
    it(`${rel.split('/').pop()} — overlay ที่เปิดจากในการ์ดต้อง portal ออก body`, () => {
      const code = read(`${BASE}/${rel}`)
      expect(code, 'ไล่เพิ่ม z-index ไม่มีวันแก้ stacking context ได้').toMatch(
        /createPortal\(/,
      )
      expect(code, 'ต้อง portal ไป document.body ไม่ใช่ node อื่น').toMatch(/document\.body/)
    })
  }
})
