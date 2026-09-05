import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { round2 } from '@/lib/round2'

/**
 * 00061 B15 — `round2` ต้องมีนิยามเดียว (HR16)
 *
 * ก่อนรอบนี้สูตรเดียวกันถูกเขียนซ้ำ **8 ชุด** ทั่วรีโป โดยแต่ละชุดมีคอมเมนต์อ้างว่า
 * "เหมือน `order.service.ts`" — ซึ่งเป็นคำอ้างที่ไม่มีอะไรบังคับให้จริง. ตราบใดที่ทุกชุด
 * เขียนเหมือนกันเป๊ะ มันจะไม่มีวันส่งเสียง และวันที่ใครแก้ชุดหนึ่ง (เช่นเปลี่ยนเป็น
 * banker's rounding) อีก 7 ชุดจะเงียบต่อไป แล้วยอดเงินสองหน้าจอจะต่างกันทีละสตางค์
 */

const ROOTS = ['src']
/** สูตรเอง ไม่ใช่ชื่อฟังก์ชัน — เปลี่ยนชื่อตัวแปรแล้วยังจับได้ */
const FORMULA_RE = /Math\.round\(\s*\(?\s*\w+\s*\+\s*Number\.EPSILON\s*\)?\s*\*\s*100\s*\)\s*\/\s*100/

/**
 * ⚠️ allow-list ที่มีเหตุผลกำกับ ไม่ใช่รายชื่อไฟล์เปล่า ๆ — ทั้งสองไฟล์เป็นตัวคำนวณ
 * "ตัวเลขพรีวิวบนหน้าจอ" ที่ไม่ถูกบันทึกลงฐาน และการแตะไฟล์ frontend ต้องผ่าน ux gate
 * (Hard Rule 8) ⇒ ย้ายแยกรอบ. **ห้ามเพิ่มชื่อไฟล์เข้ารายการนี้เพื่อให้เทสเขียว** —
 * ถ้าจะเพิ่ม ต้องเป็นเพราะมีเหตุผลระดับเดียวกัน และเขียนไว้ตรงนี้
 */
const ALLOWED = new Set([
  'src/lib/round2.ts',
  'src/app/(paces)/seller/(dashboard)/orders/new/components/CartPanel.tsx',
  'src/app/(paces)/seller/(dashboard)/orders/new/components/OrderCreateForm.tsx',
])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('round2 — นิยามเดียวทั้งระบบ (00061 B15)', () => {
  it('[blocker] ไม่มีไฟล์ไหนเขียนสูตรปัดเศษเงินซ้ำอีก', () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (ALLOWED.has(file)) continue
        const lines = readFileSync(file, 'utf8').split('\n')
        lines.forEach((line, i) => {
          // ตัดคอมเมนต์ก่อน — เทสไฟล์นี้เองมีสูตรอยู่ในคำอธิบาย
          const code = line.replace(/\/\/.*$/, '')
          if (FORMULA_RE.test(code)) offenders.push(`${file}:${i + 1}`)
        })
      }
    }
    expect(offenders, `พบสำเนาสูตร round2:\n${offenders.join('\n')}`).toEqual([])
  })

  it('พฤติกรรม: 1.005 ต้องได้ 1.01 (นี่คือเหตุผลที่ต้องมี Number.EPSILON)', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(Math.round(1.005 * 100) / 100).toBe(1) // ← สิ่งที่จะได้ถ้าใครถอด EPSILON ออก
    expect(round2(0.1 + 0.2)).toBe(0.3)
    expect(round2(890)).toBe(890)
  })
})
