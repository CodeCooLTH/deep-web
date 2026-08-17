import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] หน้าออเดอร์ฝั่งผู้ซื้อ 2 จอ ต้องอ่านเกณฑ์ตัวอักษรชุดเดียวกัน (DESIGN.md)
 *
 * ## บั๊กที่ด่านนี้กัน
 *
 * `/o/[token]` มี **2 จอที่แสดงออเดอร์ใบเดียวกัน** ต่างกันแค่ผู้ใช้ล็อกอินหรือยัง:
 *   · `GuestOrderView.tsx`     — ยังไม่ล็อกอิน
 *   · `OrderDetailMobile.tsx`  — ล็อกอินแล้ว
 *
 * 🛑 2026-08-11 จอ guest ถูกแก้ 2 อย่างพร้อมกัน แล้ว **จอหลังล็อกอินไม่ได้ตามไป 6 วัน**:
 *   1. `variant='overline' color='text.disabled'` = หมึก opacity 0.4 → **2.30:1 ตก AA**
 *      (เกณฑ์ 4.5:1) เจ็บเป็นพิเศษเพราะ PRODUCT.md ผูกผู้ใช้ไว้กับผู้สูงวัย/digital-literacy ต่ำ
 *      — และจอที่ยังตกอยู่คือจอที่เขาใช้ **ยืนยันรับของและเขียนรีวิวจริง**
 *   2. หัวข้อ section ไม่ใช่ heading จริง ⇒ screen reader กระโดดตามหัวข้อไม่ได้ทั้งหน้า
 *
 * ความต่างนี้ไม่มีอะไรฟ้องเลย: `tsc`/build/theme-guard ผ่านหมด เพราะ `variant='overline'`
 * เป็น prop ที่ถูกต้องทุกตัวอักษร สิ่งที่ผิดคือ **ค่าที่เลือก** ไม่ใช่รูปแบบ
 *
 * ## ทำไมสแกนซอร์ส
 *
 * ปัญหาอยู่ที่ *ค่าที่ส่งเข้า prop* ไม่ใช่พฤติกรรมตอนรัน — และรีโปนี้ไม่มี jsdom ให้ render จริง
 * (`vitest.config` ตั้ง `environment: "node"`)
 *
 * 🛑 แดง = ห้าม merge
 */

const ROOT = process.cwd()
const DIR = 'src/app/(marketing)/o/[token]'
const SCREENS = ['GuestOrderView.tsx', 'OrderDetailMobile.tsx']

const read = (f: string) => readFileSync(join(ROOT, DIR, f), 'utf8')

/** ลบเนื้อคอมเมนต์แต่คงจำนวนบรรทัด — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย */
const blankComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, (m, indent: string) => indent)

describe('[blocker] สองจอของ /o/[token] ต้องใช้เกณฑ์ตัวอักษรเดียวกัน', () => {
  for (const f of SCREENS) {
    it(`${f} — ห้าม overline คู่กับ text.disabled (2.30:1 ตก AA)`, () => {
      const code = blankComments(read(f))
      const hits = code
        .split('\n')
        .map((l, i) => ({ l, i: i + 1 }))
        .filter(({ l }) => /variant='overline'/.test(l) && /color='text\.disabled'/.test(l))
      expect(hits.map((h) => `${f}:${h.i}`), 'ใช้ <SectionTitle> แทน').toEqual([])
    })

    it(`${f} — ต้อง import SectionTitle จากไฟล์ร่วม ห้ามประกาศเอง`, () => {
      const code = blankComments(read(f))
      expect(code, `${f}: ต้อง import จาก ./SectionTitle`).toMatch(
        /import SectionTitle from ['"]\.\/SectionTitle['"]/,
      )
      /**
       * ห้ามประกาศตัวซ้ำในไฟล์ — นั่นคือรูปร่างของบั๊กเดิมเป๊ะ ๆ (จอหนึ่งมี อีกจอไม่มี)
       * ตัวจริงต้องอยู่ที่ `SectionTitle.tsx` ที่เดียว
       */
      expect(code, `${f}: ห้ามประกาศ SectionTitle ซ้ำในไฟล์`).not.toMatch(
        /const SectionTitle\s*=|function SectionTitle\s*\(/,
      )
    })

    /**
     * DESIGN.md §Strong step (2026-08-12): *"ห้ามใช้ 800 กับข้อความ อีกต่อไป"* — 800 สงวนให้
     * **Metric** (ตัวเลขที่ทำหน้าที่เป็นภาพ) ข้อความที่ต้องเด่นใช้ Strong = 700
     * ตัวอักษรแทนโลโก้ร้านไม่ใช่ `<Typography>` จึงไม่ถูกจับ (เป็นภาพ ไม่ใช่ข้อความ)
     */
    it(`${f} — ห้าม fontWeight 800 บน <Typography> (ต้องเป็น Strong 700)`, () => {
      const code = blankComments(read(f))
      const hits = code
        .split('\n')
        .map((l, i) => ({ l, i: i + 1 }))
        .filter(({ l }) => /<Typography/.test(l) && /fontWeight:\s*800/.test(l))
      expect(hits.map((h) => `${f}:${h.i}`)).toEqual([])
    })

    /** DESIGN.md §The No-Mono-On-Thai Rule — `font-mono` ฆ่า Anuphan ใช้ `tabular-nums` แทน */
    it(`${f} — ห้าม monospace (ใช้ tabular-nums ถ้าต้องการตัวเลขเรียงคอลัมน์)`, () => {
      const code = blankComments(read(f))
      expect(code).not.toMatch(/fontFamily:\s*['"]monospace['"]|font-mono/)
    })
  }

  /**
   * คำที่ผูกกับ "สินค้า" ต้องผันตามประเภทร้าน — ร้านบริการเห็นคำนี้แล้วสะดุด
   * (หัวหน้า 2026-08-15: *"order detail ดูไม่รู้เรื่อง"*)
   *
   * เกณฑ์: บรรทัดที่เป็น **ข้อความบนจอ** และมีคำว่า "สินค้า" ต้องอยู่ในบรรทัดที่มี `isServiceShop`
   * หรือ `vocab` กำกับ — ไม่ใช่สตริงตายตัว
   */
  it('[blocker] คำว่า "สินค้า" บนจอต้องผันตามประเภทร้าน', () => {
    const offenders: string[] = []
    for (const f of SCREENS) {
      /**
       * 🛑 ต้องถือ 2 ชุด: `lines` (ตัดคอมเมนต์แล้ว) ใช้ **จับคำ** · `raw` (ต้นฉบับ) ใช้ **วัดโครงสร้าง**
       * เพราะ `blankComments` แปลงบรรทัดคอมเมนต์เป็นช่องว่างล้วน ⇒ ถ้าใช้ชุดเดียวกันวัดว่า
       * "บรรทัดว่างหรือยัง" คอมเมนต์ที่แทรกกลางเทอร์นารีจะถูกอ่านเป็นจุดจบนิพจน์ แล้วหน้าต่าง
       * ขาดก่อนถึง `isServiceShop` (พลาดมาแล้วในร่างที่สามของด่านนี้)
       */
      const raw = read(f).split('\n')
      const lines = blankComments(read(f)).split('\n')
      lines.forEach((l, i) => {
        if (!l.includes('สินค้า')) return
        // เฉพาะบรรทัดที่เป็นข้อความบนจอจริง (ไม่ใช่ชื่อ prop/ตัวแปร)
        const isVisibleText = /^\s*[ก-๙]|>\s*[^<]*สินค้า|'[^']*สินค้า[^']*'/.test(l)
        if (!isVisibleText) return
        /**
         * 🛑 ต้องไล่ย้อนถึง **ต้นนิพจน์** ไม่ใช่หน้าต่างกี่บรรทัดตายตัว — เทอร์นารีที่ผันคำ
         * ยาวได้หลายบรรทัด (`ctaLabel` ปัจจุบันยาว 7: `isServiceShop` อยู่ห่างจากกิ่ง
         * `: 'ยืนยันรับสินค้า'` ถึง 5 บรรทัด)
         *
         * ร่างแรกเช็คบรรทัดเดียว ร่างสองใช้หน้าต่าง 3 บรรทัด — **ทั้งคู่แดงใส่โค้ดที่ถูกอยู่แล้ว**
         * ด่านที่จับผิดตัวจะถูกปิดทิ้งในที่สุด แล้วของจริงจะไม่มีใครกัน
         *
         * เกณฑ์: ย้อนขึ้นไปตราบที่บรรทัดยังไม่ว่าง (บล็อกที่ prettier จัดต่อเนื่องกัน) สูงสุด 12
         */
        let from = i
        while (from > 0 && raw[from - 1].trim() !== '' && i - from < 12) from--
        const window = lines.slice(from, i + 1).join(' ')
        if (/isServiceShop|vocab\./.test(window)) return
        // COD = ซื้อของแล้วจ่ายปลายทาง มีเฉพาะเส้นทางที่ส่งของจริง จึงพูดว่า "สินค้า" ได้
        if (/isCOD/.test(window)) return
        offenders.push(`${f}:${i + 1}  ${l.trim().slice(0, 70)}`)
      })
    }
    expect(offenders, 'ต้องผันด้วย isServiceShop หรือเขียนใหม่ให้ไม่ต้องพึ่งคำนาม').toEqual([])
  })
})
