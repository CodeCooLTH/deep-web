import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] ระยะขอบในของการ์ดบนหน้าออเดอร์ต้องมี **นิยามเดียว**
 *
 * 🛑 วัดจากเบราว์เซอร์จริง 2026-08-30 — แต่ละใบตั้งค่าเอง แล้วไม่มีคู่ไหนตรงกันเลย:
 *
 *   /dashboard (ธีมอ้างอิง)  ทุกใบ 24/24
 *   /o/[token]  หัวออเดอร์ 6/18 · รายการ 6/7 · ช่วยเหลือ 7/7 · แนบสลิป 9/7
 *               ช่องทางชำระเงิน 8/7 · รีวิว 8/7 · trust 8/7 · นัดหมาย 24/24
 *
 * หัวหน้าเห็นเองแล้วถามตรง ๆ ว่า *"ไม่ได้ทำ component หรอแล้วเรียกใช้อ่ะ จะได้เหมือน ๆ กัน"*
 * — ปัญหาไม่ใช่ "ตัวเลขผิด" แต่คือ **ไม่มีที่เดียวที่ตัวเลขนั้นอยู่** ⇒ ตั้งใหม่ทุกครั้งที่
 * มีคนเพิ่มการ์ด แล้วค่อย ๆ เพี้ยนออกจากกันโดยไม่มีอะไรฟ้อง
 *
 * ด่านนี้บังคับ **กติกา** ไม่ใช่ตัวเลข: ห้ามการ์ดใบไหนเขียน padding เอง
 *
 * 🛑 แดง = ห้าม merge
 */
const strip = (raw: string) =>
  raw
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(?<!:)\/\/.*$/gm, (m) => ' '.repeat(m.length))

const read = (rel: string) => strip(readFileSync(join(process.cwd(), rel), 'utf8'))
const ODM = 'src/app/(marketing)/o/[token]/OrderDetailMobile.tsx'

describe('[blocker] การ์ดทุกใบต้องใช้ระยะขอบในชุดเดียวกัน', () => {
  it('มีนิยามเดียว และเป็น 24px เท่ากับ /dashboard', () => {
    const tok = read('src/app/(marketing)/o/[token]/card-padding.ts')
    /* 24px = `spacing(6)` ของธีมนี้ (ฐาน 4px) — ค่าเดียวกับที่ `/dashboard`, `/orders`
       และการ์ดนัดหมายใช้อยู่แล้ว · เปลี่ยนตัวเลขได้ แต่ต้องเปลี่ยนที่นี่ที่เดียว */
    expect(tok, 'ต้องมี cardBodySx').toMatch(/export const cardBodySx = \{ p: 6 \}/)
    expect(tok, 'ต้องมี cardInlinePadSx').toMatch(/export const cardInlinePadSx = \{ px: 6 \}/)
  })

  it('🛑 การ์ดห้ามเขียน padding เอง — ต้อง spread จากนิยามกลาง', () => {
    /**
     * ตรวจเฉพาะ `<Box>` ที่เป็น **ลูกตัวแรกของ `<Card>`** ซึ่งคือ "ตัวการ์ด" ในสายตาผู้ใช้
     * กล่องข้างในลึกลงไป (แถบยอดรวม · กล่องข้อมูล · ชิป) มีระยะของตัวเองได้ตามปกติ
     */
    const src = read(ODM)
    const bad: string[] = []
    for (const m of src.matchAll(/<Card[^>]*>\s*<Box\s+sx=\{\{?([^}]*)\}/g)) {
      const sx = m[1]
      if (/\bp[xy]?:\s*[\d.]/.test(sx) && !sx.includes('cardBodySx') && !sx.includes('cardInlinePadSx')) {
        bad.push(sx.trim().slice(0, 60))
      }
    }
    expect(bad, `การ์ดที่ยังตั้ง padding เอง: ${bad.join(' | ')}`).toEqual([])
  })

  it('ค่าที่เคยกระจัดกระจายต้องไม่กลับมา', () => {
    /* ค่าที่วัดเจอตอนนั้น — ถ้าโผล่กลับมาที่ระดับการ์ดแปลว่ามีคนตั้งเองอีก
       🛑 ผูกกับ **ค่าที่เคยผิดจริง** ไม่ใช่ "ห้ามมีตัวเลขเลย" ซึ่งจะแดงกับกล่องข้างในที่ถูกต้อง */
    const src = read(ODM)
    for (const gone of ['px: 1.75, py: 1.75', 'px: 1.75, py: 2 }', 'px: 2.25,']) {
      expect(src, `ค่าเดิมที่ไม่ควรกลับมา: ${gone}`).not.toContain(gone)
    }
  })
})
