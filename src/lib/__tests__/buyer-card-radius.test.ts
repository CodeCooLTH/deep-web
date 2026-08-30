import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] รัศมีการ์ดฝั่ง buyer = **12px นิยามเดียวที่ธีม** (DESIGN.md §Shapes, user เคาะ 2026-08-30)
 *
 * อาการที่วัดได้ก่อนแก้ — ของอย่างเดียวกันคนละค่าบนหน้าที่ผู้ซื้อเดินสลับไปมา:
 *
 *     /o/[token]   `<Card>` ของธีม            6px
 *     /b, /u       การ์ดที่ประกอบเองด้วย div  12px
 *     หน้าแรก      การ์ดแพ็กเกจ (rounded-2xl) 16px · แผง FAQ 6px
 *     DESIGN.md    ประกาศไว้                  8px   ← ไม่มีใครทำตามสักหน้า
 *
 * ⇒ ยึด 12 เพราะเป็นค่าที่ surface สาธารณะใช้จริงมาก่อน แล้วให้เอกสารเดินตาม
 *
 * 🛑 แดง = ห้าม merge
 */
const ROOT = process.cwd()
const CARD_THEME = join(ROOT, 'src/@core/theme/overrides/card.ts')
const ACCORDION_THEME = join(ROOT, 'src/@core/theme/overrides/accordion.tsx')
const THEME_INDEX = join(ROOT, 'src/@core/theme/index.ts')

describe('[blocker] การ์ด buyer = 12px', () => {
  it('MuiCard ตั้ง 12px ที่ธีม', () => {
    expect(readFileSync(CARD_THEME, 'utf8')).toMatch(/borderRadius: 12\b/)
  })

  it('แผง Accordion ใช้ค่าเดียวกับการ์ด — เป็นภาชนะเหมือนกัน', () => {
    expect(readFileSync(ACCORDION_THEME, 'utf8')).toMatch(/borderRadius: 12\b/)
  })

  it('🛑 `shape.borderRadius` ต้องยังเป็น 6 — มันคือ *ตัวคูณ* ไม่ใช่ค่าการ์ด', () => {
    /* ถ้าใครขยับค่านี้เป็น 12 เพื่อ "ทำให้การ์ดกลมขึ้น" `borderRadius: 2` ทุกจุดในระบบ
       จะกลายเป็น 24px เงียบ ๆ — เป็นวิธีแก้ที่ดูได้ผลในจุดที่มองอยู่แล้วพังที่อื่นทั้งหมด */
    expect(readFileSync(THEME_INDEX, 'utf8')).toMatch(/borderRadius: 6\b/)
  })

  it('🛑 `<Card>` ห้ามใส่คลาสรัศมีทับธีม', () => {
    const dirs = ['src/views/front-pages', 'src/app/(marketing)', 'src/views/pages/user-profile']
    const bad: string[] = []
    const walk = (d: string) => {
      for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
        const rel = `${d}/${e.name}`
        if (e.isDirectory()) walk(rel)
        else if (e.name.endsWith('.tsx')) {
          const src = readFileSync(join(ROOT, rel), 'utf8')
          for (const m of src.matchAll(/<Card\b[^>]*className=(['"`])([^'"`]*)\1/g)) {
            if (/\brounded-/.test(m[2])) bad.push(`${rel}: ${m[2].match(/rounded-\S+/)?.[0]}`)
          }
        }
      }
    }
    dirs.forEach(walk)
    expect(bad, `<Card> ที่ทับรัศมีของธีม:\n${bad.join('\n')}`).toEqual([])
  })

  it('🛑 ห้ามใช้รัศมีนอกบันไดฝั่ง buyer (ยกเว้นที่มีคอมเมนต์กำกับ)', () => {
    /* บันได: rounded(6) · rounded-lg(8) · rounded-2xl(12) · rounded-full
       ที่ห้าม: xl(10) 3xl(16) 4xl(24) xs(2) sm(4) และ arbitrary [Npx] ทุกค่า
       — carve-out = เขียนคอมเมนต์บรรทัดเดียวกัน (ท่าเดียวกับ HR7 · `theme-guard.sh` ใช้กฎเดียวกัน) */
    const BANNED = /rounded-(xs|sm|xl|3xl|4xl)\b|rounded(-[tbse])?-\[\d+px\]/
    const bad: string[] = []
    const walk = (d: string) => {
      for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
        const rel = `${d}/${e.name}`
        if (e.isDirectory()) walk(rel)
        else if (/\.tsx?$/.test(e.name)) {
          /* ต้องไล่สถานะบล็อก ไม่ใช่ดูว่าบรรทัดมีเครื่องหมายไหม — บรรทัดกลาง `/* ... *\/`
             ไม่มีเครื่องหมายบนตัวเอง (บทเรียนเดียวกับที่ `theme-guard.sh` เขียนกำกับไว้) */
          let inBlock = false
          readFileSync(join(ROOT, rel), 'utf8')
            .split('\n')
            .forEach((line, i) => {
              const wasInBlock = inBlock
              if (inBlock) inBlock = !line.includes('*/')
              else if (line.includes('/*') && !line.includes('*/')) inBlock = true
              if (wasInBlock) return
              if (!BANNED.test(line)) return
              if (line.includes('//') || line.includes('/*')) return // carve-out บรรทัดเดียวกัน
              bad.push(`${rel}:${i + 1}  ${line.trim().slice(0, 70)}`)
            })
        }
      }
    }
    ;['src/app/(marketing)', 'src/views'].forEach(walk)
    expect(bad, `รัศมีนอกบันได:\n${bad.join('\n')}`).toEqual([])
  })

  it('ขอบเขต: ธีม MUI ชุดนี้ถูก mount จาก (marketing) เท่านั้น — (paces) ต้องไม่โดน', () => {
    /* ถ้าวันหนึ่งมีใคร import ธีมนี้เข้า (paces) การ์ดหลังบ้านจะกระโดดจาก 4px เป็น 12px
       ทั้งระบบโดยไม่มีอะไรฟ้อง — ด่านนี้คือสิ่งที่ฟ้อง */
    const walk = (d: string, out: string[] = []): string[] => {
      for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
        const rel = `${d}/${e.name}`
        if (e.isDirectory()) walk(rel, out)
        else if (/\.tsx?$/.test(e.name) && /@core\/theme|components\/theme/.test(readFileSync(join(ROOT, rel), 'utf8'))) out.push(rel)
      }
      return out
    }
    expect(walk('src/app/(paces)')).toEqual([])
  })
})
