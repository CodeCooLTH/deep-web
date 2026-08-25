/**
 * [blocker] คลาสปุ่มที่ **ไม่มีนิยามในธีม** ห้ามกลับมาอยู่ใน className ของ `(paces)`
 *
 * 🛑 `.btn` ของ Paces ให้แค่ layout (padding/radius/font/transition) **ไม่มีสีเลย** —
 * `border-color: #0000` และไม่มี `background` ⇒ `btn btn-primary` เรนเดอร์เป็น
 * **พื้นโปร่งใส ตัวหนังสือเทา** ซึ่งหน้าตาเหมือนข้อความธรรมดา ไม่เหมือนปุ่มที่กดได้
 *
 * ยืนยันด้วย `getComputedStyle` บนหน้า order detail จริง (2026-08-25):
 *   `btn btn-sm btn-light`  → background `rgba(0,0,0,0)`
 *   `btn btn-primary`       → background `rgba(0,0,0,0)`
 *   `btn bg-primary text-white` → background `rgb(35,109,201)` ✓
 *
 * ไม่มี gate ไหนเดิมจับได้: tsc/build/eslint ผ่านหมดเพราะเป็นสตริงที่ถูกต้องทุกตัวอักษร ·
 * theme-guard ตรวจ arbitrary value ไม่ได้ตรวจ "คลาสที่ไม่มีอยู่จริง" · และมันไม่พังเสียงดัง
 * มันแค่ไม่มีสี (หัวหน้ารายงานว่า "เลือกไม่ได้" เพราะปุ่มไม่ดูเหมือนปุ่ม)
 *
 * 🛑 **ต้องตัดคอมเมนต์ก่อนสแกน** — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนี้ไว้ด้วย
 * (บทเรียนซ้ำจาก grep gate ของ HR9 ที่แดงค้างจากคำเตือนตัวเอง 2026-08-02→03)
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** คลาสที่ grep ใน CSS ที่คอมไพล์แล้วไม่เจอนิยาม — เพิ่มได้เมื่อเจอตัวใหม่ */
const PHANTOM = [
  'btn-primary',
  'btn-light',
  'btn-outline-danger',
  'btn-warning',
  'btn-soft-primary',
  'btn-soft-default',
]

const ROOT = 'src/app/(paces)'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.tsx')) out.push(p)
  }
  return out
}

/** ตัดคอมเมนต์ทิ้ง แล้วคืนเฉพาะเนื้อใน className="..." / className={`...`} */
function classNames(src: string): { cls: string; line: number }[] {
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1')
  const out: { cls: string; line: number }[] = []
  const re = /className=(?:"([^"]*)"|\{`([^`]*)`\})/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stripped))) {
    out.push({ cls: m[1] ?? m[2] ?? '', line: stripped.slice(0, m.index).split('\n').length })
  }
  return out
}

describe('[blocker] ไม่มีคลาสปุ่มผีใน (paces)', () => {
  const files = walk(ROOT)

  it('สแกนไฟล์ .tsx ได้จริง (กันเคสด่านสแกนแล้วไม่เจออะไรเลยแล้วเขียวลอย ๆ)', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('ไม่มี btn-primary / btn-light / btn-soft-* ใน className', () => {
    const bad: string[] = []
    for (const f of files) {
      for (const { cls, line } of classNames(readFileSync(f, 'utf8'))) {
        for (const ph of PHANTOM) {
          if (new RegExp(`\\b${ph}(?![a-z-])`).test(cls)) {
            bad.push(`${f}:${line} → "${cls.trim().slice(0, 70)}" (${ph})`)
          }
        }
      }
    }
    expect(bad, `ใช้ token จริงแทน เช่น bg-primary text-white hover:bg-primary-hover\n${bad.join('\n')}`).toEqual([])
  })

  it('คอมเมนต์ที่ *พูดถึง* คลาสผี ต้องไม่ทำให้ด่านแดง', () => {
    // ไฟล์จริงหลายตัวเขียนคำเตือนเรื่องนี้ไว้ในคอมเมนต์ — ถ้าตัดคอมเมนต์ไม่สำเร็จ ด่านจะแดงตลอดกาล
    // 🛑 เคสที่ *ต้องใช้* การตัดคอมเมนต์จริง ๆ คือ **JSX ที่ถูกคอมเมนต์ทิ้ง** —
    // มันมี `className="..."` ครบทุกตัวอักษร ตัวกรอง "เฉพาะใน className" จึงกันไม่ได้
    // (ร่างแรกใช้แต่คอมเมนต์ธรรมดา ⇒ ถอดการตัดคอมเมนต์ออกแล้วเทสยังเขียว = ตาข่ายที่ไม่มีใครแตะ)
    const sample = `
      /* btn-primary ไม่มีอยู่จริงในธีม */
      // อย่าใช้ btn-light
      // <button className="btn btn-primary" />   ← โค้ดเก่าที่คอมเมนต์ทิ้งไว้
      /* <button className="btn btn-sm btn-light" /> */
      <button className="btn bg-primary text-white" />
    `
    const found = classNames(sample).filter((c) => PHANTOM.some((p) => c.cls.includes(p)))
    expect(found).toEqual([])
  })
})
