/**
 * คำอธิบายร้านต้องไม่ "วัดตัวเองแล้วเปลี่ยนตัวเอง" — บั๊กกระพริบทั้งหน้าบน iOS (prod 2026-08-15)
 *
 * ## อาการที่ผู้ใช้เจอ
 *
 * เปิด `/b/<slug>` บน iPhone แล้ว **ทั้งหน้าใต้คำอธิบายร้านขยับขึ้นลงทุกเฟรมไม่หยุด**
 * (user ส่งคลิป 3.6 วินาทีมา — วัดจากเฟรมได้ว่าสลับสองสถานะ A,B,A,B ตลอด: เฟรม N ≈ เฟรม N-2)
 * สองสถานะนั้นคือ **ย่อ 2 บรรทัด** ↔ **กางเต็ม 3 บรรทัด + ป้าย "เพิ่มเติม"**
 *
 * ## ต้นเหตุ: วงจรปิด
 *
 * เดิมอิลิเมนต์ของ bio สลับแท็กตามค่า `bioOverflows` (`component={bioOverflows ? 'button' : 'p'}`)
 * ขณะที่ `bioOverflows` เองมาจากการวัด **อิลิเมนต์ตัวนั้น** ⇒ ผลการวัดกำหนดสิ่งที่ถูกวัด
 *
 *   `<p>`      → WebKit clamp ติด   → scrollH > clientH → true  → กลายเป็น `<button>`
 *   `<button>` → WebKit clamp หลุด  → scrollH = clientH → false → กลับเป็น `<p>` → วนไม่จบ
 *
 * (`-webkit-line-clamp` ของ WebKit ไม่ทำงานเมื่ออิลิเมนต์เป็น form control · Chrome ทำงาน
 * จึงไม่มีใครเห็นบนเครื่อง dev เลย — วัดในเบราว์เซอร์ยืนยันแล้ว: จำลองเงื่อนไข WebKit บน prod
 * ได้ **46 ครั้งใน 1.5 วินาที** ส่วนโค้ดที่แก้แล้ว 0 ครั้ง)
 *
 * 🛑 ไม่มี gate ไหนจับได้ — `tsc`/build/eslint/theme-guard ผ่านหมด และ
 * `react-hooks/exhaustive-deps` **สั่งให้เขียนแบบที่พัง** (deps ครบถ้วนและผิด)
 * คลาสเดียวกับ `docs/conventions/hook-return-identity-in-deps.md`
 *
 * ## กฎที่เทสนี้บังคับ
 *
 * 1. dep array ของ effect ที่ตั้งค่า `bioOverflows` ห้ามมี `bioOverflows` (ป้อนกลับเข้าตัวเอง)
 * 2. ห้ามให้ **แท็ก** ของอิลิเมนต์ขึ้นกับ `bioOverflows` (`component={bioOverflows ? …}`)
 * 3. โหนดที่ถูกวัด (`ref={bioProbeRef}`) ต้องไม่มี `bioOverflows`/`bioExpanded` อยู่ในตัวมันเอง
 *    — ต้องเป็นโพรบที่หน้าตาเหมือนเดิมทุกสถานะ
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const FILE = join(process.cwd(), 'src/views/pages/user-profile/v2/ProfileIdentity.tsx')

/** ตัดคอมเมนต์ก่อนสแกน — ไฟล์นี้อธิบายบั๊กไว้ในคอมเมนต์เอง ถ้าไม่ตัดจะแดงค้างตลอดกาล */
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

const raw = readFileSync(FILE, 'utf8')
const src = stripComments(raw)

describe('[blocker] คำอธิบายร้าน: การวัดต้องไม่ป้อนกลับเข้าตัวเอง', () => {
  it('ไฟล์มีของให้สแกนจริง (กันเทสเขียวเพราะอ่านไฟล์ผิด)', () => {
    expect(src).toContain('bioOverflows')
    expect(src).toContain('setBioOverflows')
    expect(src).toContain('bioProbeRef')
  })

  it('dep array ของ effect ที่วัด ต้องไม่มี bioOverflows', () => {
    const start = src.indexOf('setBioOverflows(')
    expect(start, 'หาไม่เจอว่าตั้งค่า bioOverflows ตรงไหน').toBeGreaterThan(-1)

    // dep array ตัวแรกที่ตามหลังการ setState นั้น = deps ของ effect ที่วัด
    const deps = /\}, \[([^\]]*)\]\)/.exec(src.slice(start))

    expect(deps, 'หา dep array ของ effect ไม่เจอ').not.toBeNull()
    expect(
      deps?.[1] ?? '',
      'bioOverflows เป็นผลลัพธ์ของ effect นี้เอง — ใส่กลับเข้า deps = วัด→เปลี่ยน→วัด วนไม่จบ',
    ).not.toContain('bioOverflows')
  })

  it('แท็กของอิลิเมนต์ต้องไม่ขึ้นกับผลการวัด', () => {
    expect(
      /component=\{[^}]*bioOverflows/.test(src),
      'สลับแท็กตาม bioOverflows = สิ่งที่ถูกวัดเปลี่ยนตามผลการวัด (ความเป็นปุ่มต้องอยู่ที่ตัวห่อ)',
    ).toBe(false)
  })

  it('โหนดโพรบที่ถูกวัด ต้องไม่ขึ้นกับสถานะใด ๆ', () => {
    const at = src.indexOf('ref={bioProbeRef}')

    expect(at, 'ไม่มีโหนดโพรบแล้ว — การวัดกลับไปอยู่บนกล่องที่ถูกย่อหรือเปล่า').toBeGreaterThan(-1)

    // ขอบเขตของแท็กเปิดที่ถือ ref นี้: ย้อนขึ้นไปหา '<' แล้วไปจบที่ '>' ตัวถัดไป
    const open = src.lastIndexOf('<', at)
    const close = src.indexOf('>', at)
    const tag = src.slice(open, close)

    expect(tag).toContain('aria-hidden')
    expect(tag, 'โพรบต้องหน้าตาเหมือนเดิมทุกสถานะ ห้ามผูกกับ bioOverflows').not.toContain('bioOverflows')
    expect(tag, 'โพรบต้องไม่ถูกย่อ/ไม่เปลี่ยนตามการกางข้อความ').not.toContain('bioExpanded')
  })
})
