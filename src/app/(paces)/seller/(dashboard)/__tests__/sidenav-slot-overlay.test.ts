import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] overlay ที่ล็อก scroll ห้ามถูกวางไว้ในกล่องที่ CSS ซ่อนได้
 *
 * ## บั๊กที่ด่านนี้กัน (หัวหน้าเจอบน TestFlight 2026-08-18)
 *
 * `OnboardingGate` ถูก render ผ่าน `sidenavFooterSlot` ⇒ อยู่ใน `.app-menu`
 * และ `safepay-overrides.css` เขียนว่า
 *     `.seller-mobile-shell .app-menu { display: none !important; }`
 *
 * บนมือถือ React ยัง **mount ทุกอย่างตามปกติ** (CSS ไม่เกี่ยวกับ lifecycle) ⇒ `OnboardingModal`
 * เปิดจริง เรียก `useLockBodyScroll` จริง ตั้ง `overflow:hidden` + `overscroll-behavior-y:none`
 * บน `<html>`/`<body>` จริง — **แต่ตัวโมดัลอยู่ในกล่องที่ `display:none` เลยไม่มีใครเห็นและปิดไม่ได้**
 *
 * ผลที่ผู้ใช้เจอ: เลื่อนจอไม่ได้ · ดึงรีเฟรชไม่ได้ · **แต่กดปุ่มอื่นติดปกติ** (ไม่มี overlay ขวางจริง
 * มีแต่ CSS ล็อก) · หายเมื่อปิดแอปเปิดใหม่เท่านั้น
 *
 * 🛑 ไม่มี gate ไหนของโปรเจกต์จับได้เลย — `tsc`/build/eslint/theme-guard ผ่านหมด เพราะทุกบรรทัด
 * ถูกต้องในตัวเอง สิ่งที่ผิดคือ **ตำแหน่งที่ component ถูกวาง** เทียบกับ CSS ของอีกไฟล์หนึ่ง
 *
 * ## กฎ
 *
 * component ที่ถูก render จาก `sidenavFooterSlot`/`sidenavHeaderSlot` (และลูกที่มันนำเข้า)
 * ถ้าเรียก `useLockBodyScroll` ต้อง `createPortal(..., document.body)` เสมอ
 *
 * 🛑 แดง = ห้าม merge
 */

const ROOT = process.cwd()
const LAYOUT = 'src/app/(paces)/seller/(dashboard)/layout.tsx'

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** ลบเนื้อคอมเมนต์แต่คงจำนวนบรรทัด — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย */
const blankComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, (m, indent: string) => indent)

/** แปลง import path สัมพัทธ์เป็น path จริงในรีโป (ลอง .tsx ก่อน แล้ว .ts) */
function resolveLocal(fromRel: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(join(ROOT, fromRel)), spec)
  for (const ext of ['.tsx', '.ts', '/index.tsx']) {
    try {
      readFileSync(base + ext, 'utf8')
      return (base + ext).slice(ROOT.length + 1)
    } catch {
      /* ลองนามสกุลถัดไป */
    }
  }
  return null
}

/** ไล่ import แบบ local ลงไปจนสุด (กันวน) — ครอบลูกหลานไม่ใช่แค่ชั้นเดียว */
function collectTree(entry: string, seen = new Set<string>()): string[] {
  if (seen.has(entry)) return []
  seen.add(entry)
  const src = blankComments(read(entry))
  for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const child = resolveLocal(entry, m[1])
    if (child) collectTree(child, seen)
  }
  return [...seen]
}

describe('[blocker] overlay ใน sidenav slot ต้อง portal ออก body', () => {
  it('หา component ที่ layout ส่งเข้า sidenav slot ได้จริง', () => {
    const layout = blankComments(read(LAYOUT))
    expect(layout, 'layout ต้องยังส่ง slot อยู่ — ถ้าเลิกใช้แล้วให้ลบด่านนี้ทิ้งพร้อมกัน').toMatch(
      /sidenav(Footer|Header)Slot=\{/,
    )
  })

  it('ทุก component ในสาย sidenav slot ที่ล็อก scroll ต้องเรียก createPortal(document.body)', () => {
    const layout = blankComments(read(LAYOUT))

    // ชื่อ component ที่ถูกส่งเข้า slot → หา import ของชื่อนั้นในไฟล์ layout
    const slotted = [...layout.matchAll(/sidenav(?:Footer|Header)Slot=\{<(\w+)/g)].map((m) => m[1])
    expect(slotted.length, 'ต้องเจออย่างน้อย 1 ตัว ไม่งั้นด่านนี้ไม่ได้ตรวจอะไรเลย').toBeGreaterThan(0)

    const offenders: string[] = []
    for (const name of slotted) {
      const imp = layout.match(new RegExp(`import ${name} from ['"]([^'"]+)['"]`))
      if (!imp) continue
      const entry = resolveLocal(LAYOUT, imp[1])
      if (!entry) continue

      for (const file of collectTree(entry)) {
        const code = blankComments(read(file))
        if (!/useLockBodyScroll\s*\(/.test(code)) continue
        if (/createPortal\(/.test(code) && /document\.body/.test(code)) continue
        offenders.push(`${file}  (มาจาก slot <${name}>)`)
      }
    }

    expect(
      offenders,
      'overlay ที่ล็อก scroll แต่ถูกวางในกล่องที่ CSS ซ่อนได้ = ล็อกทั้งหน้าโดยไม่มีทางออก',
    ).toEqual([])
  })
})
