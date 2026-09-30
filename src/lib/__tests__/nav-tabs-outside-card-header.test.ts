import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * [blocker] `.nav-tabs` ของ Paces มี `-my-3.75 -me-3` (src/assets/css/custom/_card.css) — ออกแบบให้ใช้
 * ใน `.card-header` เท่านั้น วางที่อื่นแล้ว margin ติดลบดึงเนื้อหาขึ้นมาทับแถบแท็บ 15px
 *
 * เกิดจริง 3 ที่: ชีต "การเงินร้าน" + หน้า /sales (user เจอ 2026-09-30) และตั้งค่าการจัดส่ง (2026-10-01)
 * ⇒ ทุก `nav-tabs` ในโค้ดของเรา (ไม่มีตัวไหนอยู่ใน card-header) ต้องปิดขอบบนด้วย `mt-0` หรือ `my-0`
 */

const SRC = join(process.cwd(), 'src/app')

const files = readdirSync(SRC, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.tsx') && !e.name.includes('.test.'))
  .map((e) => join(e.parentPath ?? SRC, e.name))

describe('[blocker] nav-tabs นอก card-header ต้องปิด margin ติดลบด้านบน', () => {
  const uses: { file: string; cls: string }[] = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/className=["'`]([^"'`]*\bnav-tabs\b[^"'`]*)["'`]/g)) {
      uses.push({ file: relative(process.cwd(), f), cls: m[1] })
    }
  }

  it('เจอการใช้งานจริง (ไม่ใช่เขียวเพราะสแกนไม่เจอ)', () => {
    expect(uses.length).toBeGreaterThanOrEqual(4)
  })

  it('ทุกตัวมี mt-0 หรือ my-0', () => {
    const bad = uses.filter((u) => !/\b(mt-0|my-0)\b/.test(u.cls)).map((u) => `${u.file}: ${u.cls}`)
    expect(bad).toEqual([])
  })
})
