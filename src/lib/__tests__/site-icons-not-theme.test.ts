import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] favicon / ไอคอน PWA ต้องเป็นโลโก้ Deep — ห้ามเป็นโลโก้ของธีม
 *
 * ## บั๊กที่ด่านนี้กัน
 *
 * 🛑 จนถึง 2026-08-20 เว็บทั้งระบบไม่มี favicon ที่เป็นแบรนด์ Deep เลยสักที่:
 *   · `deepthailand.app`      → `/icon.svg` = ตัว **"V" ของ Vuexy** บนพื้นม่วง `#7367F0`
 *   · `seller.` / `admin.`    → `paces-favicon.ico` = ตัว **"H" ของธีม Paces**
 *   · เพิ่มลงหน้าจอโฮม (PWA)  → `/icon.svg` ใบเดิม
 *
 * เป็นความผิดพลาด **คลาสเดียวกับที่ Apple ตีกลับ build 1.0(3) ด้วย Guideline 2.3.8** เป๊ะ ๆ
 * (ส่ง asset ที่เป็น template ของธีมออกไปโดยไม่ได้เปลี่ยน) ต่างกันแค่ Apple มีคนตรวจให้
 * ส่วนเว็บไม่มีใครตรวจ มันจึงอยู่มาหลายเดือนโดยไม่มีอะไรฟ้อง — `tsc`/build/eslint/theme-guard
 * ผ่านหมด เพราะ path ที่ชี้ไปนั้น "ถูกต้อง" ทุกตัวอักษร สิ่งที่ผิดคือ *รูปที่อยู่ปลายทาง*
 *
 * ## ทำไมสแกนซอร์ส
 *
 * ปัญหาอยู่ที่ *ค่าที่ส่งเข้า metadata* ไม่ใช่พฤติกรรมตอนรัน และรีโปนี้ไม่มี jsdom ให้ render จริง
 * (`vitest.config` ตั้ง `environment: "node"`)
 *
 * 🛑 แดง = ห้าม merge
 */

const ROOT = process.cwd()

/** ลบเนื้อคอมเมนต์แต่คงจำนวนบรรทัด — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย */
const blankComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, (m, indent: string) => indent)

const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name === 'layout.tsx' ? [`${dir}/${e.name}`] : [],
  )

const LAYOUTS = walk('src/app')
const read = (rel: string) => blankComments(readFileSync(join(ROOT, rel), 'utf8'))

describe('[blocker] ไอคอนของเว็บต้องเป็นแบรนด์ Deep ไม่ใช่โลโก้ธีม', () => {
  /**
   * เกณฑ์คือ **"ประกาศที่ไหน"** ไม่ใช่ "ชื่อไฟล์สะกดยังไง" — ด่านที่ผูกกับสตริงของไฟล์รูป
   * จะถูกเลี่ยงได้ทันทีที่มีคนเพิ่มไฟล์ธีมใบใหม่ที่เราไม่รู้จัก
   */
  it('ทุก layout ที่ประกาศ icons ต้องใช้ SITE_ICONS ตัวเดียว (HR16)', () => {
    const offenders: string[] = []
    for (const f of LAYOUTS) {
      read(f)
        .split('\n')
        .forEach((l, i) => {
          if (!/^\s*icons:/.test(l)) return
          if (/icons:\s*SITE_ICONS\s*,?\s*$/.test(l)) return
          offenders.push(`${f}:${i + 1}  ${l.trim().slice(0, 70)}`)
        })
    }
    expect(offenders, "ให้ import { SITE_ICONS } from '@/lib/site-icons' แทนการเขียน path เอง").toEqual([])
  })

  /** ด่านชั้นสอง: กันไฟล์ของธีมถูกลากกลับเข้ามาทางอื่นที่ไม่ใช่คีย์ `icons:` */
  it('ห้าม layout อ้างไฟล์ไอคอนของธีม (Vuexy/Paces) อีก', () => {
    const THEME_ICONS = /icon\.svg|paces-favicon|vuexy-favicon/
    const offenders: string[] = []
    for (const f of LAYOUTS) {
      read(f)
        .split('\n')
        .forEach((l, i) => {
          if (THEME_ICONS.test(l)) offenders.push(`${f}:${i + 1}  ${l.trim().slice(0, 70)}`)
        })
    }
    expect(offenders, 'โลโก้ธีม ไม่ใช่โลโก้ Deep').toEqual([])
  })

  /**
   * ไฟล์ที่ชี้ต้องมีอยู่จริง — path ที่พิมพ์ผิดจะกลายเป็น 404 เงียบ ๆ
   * เบราว์เซอร์ไม่ error แค่ไม่แสดงไอคอน ซึ่งหน้าตาเหมือน "ยังไม่ได้ทำ" ทุกประการ
   */
  it('ทุก path ที่ SITE_ICONS และ manifest ชี้ ต้องมีไฟล์อยู่จริง', () => {
    const sources = ['src/lib/site-icons.ts', 'src/app/manifest.ts']
    const missing: string[] = []
    for (const s of sources) {
      const code = read(s)
      for (const m of code.matchAll(/'(\/[\w./-]+\.(?:png|ico|svg))'/g)) {
        const url = m[1]
        // `/favicon.ico` มาจาก file convention ของ Next (`src/app/favicon.ico`) ไม่ได้อยู่ใน public/
        const candidates = [join(ROOT, 'public', url), join(ROOT, 'src/app', url)]
        if (!candidates.some(existsSync)) missing.push(`${s} → ${url}`)
      }
    }
    expect(missing).toEqual([])
  })

  /**
   * 🛑 apple-touch-icon ต้องไม่มี alpha channel
   *
   * iOS ตรวจว่า "ไฟล์มีแชนเนล alpha ไหม" ไม่ได้ตรวจว่า "โปร่งจริงไหม" ⇒ PNG ที่ทึบทุกพิกเซล
   * แต่ยังพกแชนเนลมา เสี่ยงถูก composite เป็นพื้นดำบนหน้าจอโฮม
   *
   * อ่านจาก IHDR ตรง ๆ ไม่ต้องพึ่ง sharp: PNG = signature 8 ไบต์ + IHDR (len 4 + type 4 +
   * width 4 + height 4 + bitDepth 1) ⇒ ไบต์ที่ 25 คือ colorType (2 = RGB, 6 = RGBA)
   */
  it('ไอคอนพื้นทึบต้องไม่มี alpha channel', () => {
    const OPAQUE = ['deep-icon-180.png', 'deep-icon-192.png', 'deep-icon-512.png', 'deep-icon-maskable-512.png']
    const withAlpha: string[] = []
    for (const name of OPAQUE) {
      const buf = readFileSync(join(ROOT, 'public', name))
      const colorType = buf.readUInt8(25)
      if (colorType === 4 || colorType === 6) withAlpha.push(`${name} (colorType=${colorType})`)
    }
    expect(withAlpha, 'สร้างใหม่ด้วย scripts/generate-web-icons.mjs — มันถอด alpha ให้แล้ว').toEqual([])
  })
})
