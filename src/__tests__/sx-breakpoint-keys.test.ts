/**
 * กันคีย์ breakpoint ปลอมใน `sx` ของ MUI — บั๊กที่ไม่มี gate ไหนในโปรเจกต์จับได้
 *
 * ## บั๊กที่กันอยู่
 *
 * `iterateBreakpoints` ของ `@mui/system` เทียบคีย์ในอ็อบเจกต์ค่าของ property กับ **breakpoint
 * ของธีมเท่านั้น** (`xs`/`sm`/`md`/`lg`/`xl`) คีย์ที่ไม่ตรงจะถูกโยนลง output ดิบ ๆ โดยไม่ผ่าน
 * ตัวประกอบ declaration:
 *
 *   sx={{ maxWidth: { xs: '100%', '@media (min-width:768px)': 720, lg: 880 } }}
 *     → { '@media (min-width:0px)': { maxWidth: '100%' },
 *         '@media (min-width:1200px)': { maxWidth: 880 },
 *         '@media (min-width:768px)': 720 }   ← ค่าเปล่า ไม่ใช่ declaration = CSS เสีย
 *
 *   sx={{ maxWidth: { xs: '100%', 'min-[768px]': 720 } }}   ← ไวยากรณ์ Tailwind หลุดเข้ามาใน sx
 *     → { 'min-[768px]': 720 }                              ← ชื่อ property ที่ไม่มีอยู่จริง
 *
 * **ไม่มี error ไม่มี warning และ `tsc` ผ่าน** เพราะ `SxProps` รับคีย์อะไรก็ได้ ⇒ สไตล์นั้น
 * เงียบหายไปทั้งบรรทัดโดยไม่มีอะไรฟ้อง
 *
 * เกิดจริงมาแล้ว 2 ครั้งในวันเดียว (2026-08-11): เพดานความกว้าง 720px ของหน้า `/o/[token]`
 * ไม่เคยทำงานเลยทั้งสองจอตั้งแต่วันที่เขียน (แก้ที่ `61d503a9`) แล้วผมเขียนพลาดซ้ำอีกครั้งใน
 * `ProfileLightbox.tsx` ตอนทำ lightbox ทั้งที่เพิ่งแก้เคสแรกไปไม่กี่ชั่วโมงก่อน
 *
 * ## เขียนให้ถูกยังไง
 *
 * - ใช้คีย์ breakpoint ของธีม: `{ xs: '100%', md: 720 }`
 * - ถ้าจุดตัดไม่ตรงกับ breakpoint ไหนเลย ให้ยก media query ขึ้นไปที่ **ระดับบนสุดของ sx**
 *   แล้วให้ค่าเป็นอ็อบเจกต์สไตล์: `sx={{ maxWidth: '100%', '@media (min-width:768px)': { maxWidth: 720 } }}`
 *   (รูปนี้ MUI รองรับเป็น nested selector อย่างเป็นทางการ — เทสนี้จึงยอมให้ผ่าน)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')

/**
 * คีย์ media query ที่ค่า **ไม่ใช่** อ็อบเจกต์ — รูปเดียวที่พังคือรูปนี้
 * (`'@media …': { … }` ที่ระดับบนสุดของ sx เป็นรูปที่ถูกต้อง จึงต้องไม่ match)
 *
 * 🛑 ต้องเขียนเป็น `[^\s{]` (บังคับว่าต้องมีอักขระที่ไม่ใช่ช่องว่างและไม่ใช่ `{`) ไม่ใช่
 * `\s*(?!\{)` — แบบหลัง regex จะ backtrack ให้ `\s*` กินศูนย์ตัวแล้วมองเห็น "ช่องว่าง"
 * (ซึ่งไม่ใช่ `{`) แล้ว match ทุกบรรทัดที่เขียนถูกด้วย · ผมพลาดตรงนี้รอบแรกและมันฟ้อง
 * `'@media (hover: hover)': { … }` ที่ถูกอยู่แล้วเป็นการละเมิด
 */
const BARE_MEDIA_KEY = /['"]@media[^'"]*['"]\s*:\s*[^\s{]/

/** ไวยากรณ์ breakpoint ของ Tailwind ที่หลุดเข้ามาเป็นคีย์ใน sx — ผิดเสมอไม่ว่าค่าจะเป็นอะไร */
const TAILWIND_VARIANT_KEY = /['"]min-\[[^'"]*\]['"]\s*:/

/**
 * ตัดคอมเมนต์ทิ้งก่อนสแกน
 *
 * 🛑 จำเป็น ไม่ใช่ของประดับ: ไฟล์ที่ทำ **ถูก** กฎนี้คือไฟล์ที่มักเขียนคอมเมนต์อธิบายว่ารูปที่ผิด
 * หน้าตายังไง (`content-width.ts` ยกตัวอย่างทั้งสองรูปไว้เต็ม ๆ) ⇒ gate ที่สแกนซอร์สดิบจะแดง
 * ค้างตลอดกาลกับไฟล์ที่ไม่มีการละเมิดเลย แล้วสุดท้ายจะถูกปิดทิ้ง
 * (บทเรียนเดียวกับ grep gate ของ Hard Rule 9 ที่ match คำเปล่า ๆ — CLAUDE.md บันทึกไว้แล้ว)
 */
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

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue
      walk(full, out)
    } else if (name.endsWith('.tsx') || name.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

describe('[blocker] คีย์ breakpoint ใน sx ของ MUI', () => {
  const files = walk(SRC)

  it('มีไฟล์ให้สแกนจริง (กันเทสเขียวเพราะ walk พัง)', () => {
    expect(files.length).toBeGreaterThan(500)
  })

  it('ไม่มีคีย์ @media ที่ค่าไม่ใช่อ็อบเจกต์สไตล์', () => {
    const offenders = files.filter((f) => {
      return stripComments(readFileSync(f, 'utf8'))
        .split('\n')
        .some((line) => BARE_MEDIA_KEY.test(line))
    })

    expect(
      offenders.map((f) => f.replace(`${process.cwd()}/`, '')),
      'คีย์ @media ต้องอยู่ระดับบนสุดของ sx และค่าต้องเป็นอ็อบเจกต์สไตล์ — ดูหัวไฟล์เทสนี้',
    ).toEqual([])
  })

  it('ไม่มีไวยากรณ์ variant ของ Tailwind (min-[…]) เป็นคีย์', () => {
    const offenders = files.filter((f) => TAILWIND_VARIANT_KEY.test(stripComments(readFileSync(f, 'utf8'))))

    expect(
      offenders.map((f) => f.replace(`${process.cwd()}/`, '')),
      'sx ของ MUI ไม่รู้จัก variant ของ Tailwind — ใช้คีย์ breakpoint ของธีมแทน',
    ).toEqual([])
  })
})
