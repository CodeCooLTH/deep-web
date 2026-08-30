import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] รัศมีมุมบน `/o/[token]` ต้องพูดภาษาเดียวกันทั้งหน้า
 *
 * 🛑 วัดจากเบราว์เซอร์จริง 2026-08-30: กล่องสถิติที่เพิ่งทำใช้ **21px** ขณะที่
 * `<Card>` ของธีมที่ครอบมันอยู่ใช้ **6px** — กล่องข้างในกลมกว่ากล่องนอก 3.5 เท่า
 * อ่านเป็นของคนละชุดที่บังเอิญมาวางซ้อนกัน
 *
 * และกล่องข้อความพื้น `action.hover` **ชนิดเดียวกัน** เคยใช้ 2 ค่าบนหน้าเดียว
 * (12px กับ 18px) ⇒ ของที่ทำหน้าที่เหมือนกันต้องหน้าตาเหมือนกัน
 *
 * ค่าที่อนุญาตคือชุดที่หน้านี้ใช้จริงอยู่แล้ว ไม่ใช่เลขที่คิดขึ้นใหม่:
 *   1 (6px)  = เท่าการ์ดของธีม · 1.5 (9px) = แผ่นไอคอนเล็ก
 *   2 (12px) = กล่องข้อความ/กล่องสถิติ (ค่าหลัก) · 999 = พิล
 *   2.25 (13.5px) = รูปย่อสินค้า 44px (ของเดิม — media คนละคลาสกับกล่อง)
 *
 * 🛑 แดง = ห้าม merge
 */
const DIR = 'src/app/(marketing)/o/[token]'

const strip = (raw: string) =>
  raw
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(?<!:)\/\/.*$/gm, (m) => ' '.repeat(m.length))

/** ค่าที่หน้านี้ใช้จริง — เพิ่มค่าใหม่ต้องมีเหตุผล ไม่ใช่เพราะ "ดูดีกว่า" ในจุดเดียว */
const ALLOWED = new Set(['1', '1.5', '2', '2.25', '999'])

describe('[blocker] รัศมีมุมต้องอยู่ในชุดเดียว', () => {
  const files = readdirSync(join(process.cwd(), DIR)).filter((f) => f.endsWith('.tsx'))

  it('ทุกไฟล์ของหน้านี้ใช้เฉพาะรัศมีในชุด', () => {
    const bad: string[] = []
    for (const f of files) {
      const src = strip(readFileSync(join(process.cwd(), DIR, f), 'utf8'))
      for (const m of src.matchAll(/borderRadius: ([0-9.]+)/g)) {
        if (!ALLOWED.has(m[1])) bad.push(`${f}: borderRadius ${m[1]} (${Number(m[1]) * 6}px)`)
      }
    }
    expect(bad, `รัศมีนอกชุด:\n${bad.join('\n')}`).toEqual([])
  })

  it('🛑 กล่องข้างในต้องไม่กลมกว่าการ์ดที่ครอบมันมาก — กล่องสถิติต้องเป็นค่าหลัก 12px', () => {
    const se = strip(readFileSync(join(process.cwd(), DIR, 'ShopEvidence.tsx'), 'utf8'))
    const at = se.indexOf('const metricBox')
    expect(at, 'ต้องมีกล่องสถิติ').toBeGreaterThan(-1)
    expect(se.slice(at, se.indexOf('} as const', at)), 'กล่องสถิติต้องใช้ 2 (12px)').toMatch(
      /borderRadius: 2,/,
    )
  })

  it('กล่องข้อความพื้น action.hover ต้องใช้รัศมีเดียวกันทุกใบ', () => {
    /* ของที่ทำหน้าที่เหมือนกัน (กล่องอธิบาย/เหตุผล) ต้องหน้าตาเหมือนกัน —
       เดิมมี 12px กับ 18px ปนกันบนหน้าเดียว */
    const src = strip(readFileSync(join(process.cwd(), DIR, 'OrderDetailMobile.tsx'), 'utf8'))
    const radii = new Set(
      [...src.matchAll(/bgcolor: 'action\.hover',\s*borderRadius: ([0-9.]+)/g)].map((m) => m[1]),
    )
    expect([...radii], `พบหลายค่า: ${[...radii].join(', ')}`).toEqual(['2'])
  })
})
