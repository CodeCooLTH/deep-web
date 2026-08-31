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

  it('🛑 เป้าที่กดได้ที่เขียนด้วย Tailwind ต้อง ≥44px ด้วย — ไม่ใช่เฉพาะที่ผ่านธีม', () => {
    /* 🛑 รูที่ทำให้เชลล์ `/m` ทั้งเชลล์หลุดรอบ 2026-08-30 ไปได้
       เคสข้างบนเฝ้า `minBlockSize` ในธีม ซึ่งครอบเฉพาะของที่ *เดินผ่าน MUI*
       แต่ `/m` เขียน Tailwind ล้วน — ปุ่มคือ `<button className='size-9'>` ลิงก์คือ
       `<Link className='h-8'>` ไม่มีคำว่า minBlockSize สักตัว ด่านจึงมองไม่เห็น
       ผลคือรายงานรอบนั้นสรุปว่า "ต่ำกว่า 44px = 0" ทั้งที่วัดจอจริงยังเหลืออีก 74 จุด

       บทเรียน: ด่านที่เขียนจากคำศัพท์ของหน้าที่เพิ่งตรวจ จะตาบอดกับหน้าที่เขียนด้วยคำศัพท์อื่น

       จับ h-N / size-N (N ≤ 10 = ต่ำกว่า 44px) เฉพาะที่มีร่องรอยว่ากดได้จริง
       — carve-out = คอมเมนต์บรรทัดเดียวกัน (ของที่ตาเห็นเล็กแต่พื้นที่แตะใหญ่) */
    const SMALL = /\b(h|size)-([1-9]|10)\b/
    const PRESSABLE = /cursor-pointer|no-underline|active:/
    const bad: string[] = []
    const walk = (d: string) => {
      for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
        const rel = `${d}/${e.name}`
        if (e.isDirectory()) walk(rel)
        else if (/\.tsx?$/.test(e.name)) {
          let inBlock = false
          readFileSync(join(ROOT, rel), 'utf8')
            .split('\n')
            .forEach((line, i) => {
              const wasInBlock = inBlock
              if (inBlock) inBlock = !line.includes('*/')
              else if (line.includes('/*') && !line.includes('*/')) inBlock = true
              if (wasInBlock) return
              if (!SMALL.test(line) || !PRESSABLE.test(line)) return
              if (line.includes('//') || line.includes('/*')) return
              bad.push(`${rel}:${i + 1}  ${line.trim().slice(0, 70)}`)
            })
        }
      }
    }
    ;['src/app/(marketing)', 'src/views'].forEach(walk)
    expect(bad, `เป้าที่กดได้เตี้ยกว่า 44px:\n${bad.join('\n')}`).toEqual([])
  })

  it('🛑 <CardContent> ห้ามเขียนคลาส padding ทับธีม — การ์ด = 20px นิยามเดียว', () => {
    /* วัดได้ก่อนแก้ 2026-08-30: ฝั่ง buyer มี 14 · 20 · 24 · 32px ปนกัน
       และการ์ด "การชำระเงิน" (14px) วางติดกับ "ช่องทางการชำระเงิน" (24px) บนจอเดียว
       ⇒ ต่างกัน 10px ซึ่งมองเห็นด้วยตา · ที่มาคือแต่ละใบเขียน padding เอง */
    /* `p-12` (48px) = การ์ด auth/OTP — **ขึ้นทะเบียนเป็นข้อยกเว้น** ไม่ใช่ของหลุด:
       มันคือการ์ดใบเดียวกลางหน้าว่าง คนละ archetype กับการ์ดที่เรียงกันเป็นรายการในหน้า
       (ยุบเหลือ 20px แล้วฟอร์มล็อกอินจะอัดจนดูผิดที่ผิดทาง — Vuexy ตั้งมาแบบนี้แต่แรก) */
    const PAD = /\b(p|px|py|pt|pb|pli|plb)-(\[|\d)/
    const AUTH_CARD_OK = /\bp-12\b/
    const bad: string[] = []
    const walk = (d: string) => {
      for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
        const rel = `${d}/${e.name}`
        if (e.isDirectory()) walk(rel)
        else if (e.name.endsWith('.tsx')) {
          const src = readFileSync(join(ROOT, rel), 'utf8')
          for (const m of src.matchAll(/<CardContent\b[^>]*className=(['"`])([^'"`]*)\1/g)) {
            if (AUTH_CARD_OK.test(m[2])) continue
            if (PAD.test(m[2])) bad.push(`${rel}: ${m[2].match(PAD.source ? new RegExp(PAD.source + '\\S*') : PAD)?.[0]}`)
          }
        }
      }
    }
    ;['src/app/(marketing)', 'src/views'].forEach(walk)
    expect(bad, `<CardContent> ที่เขียน padding เอง:\n${bad.join('\n')}`).toEqual([])
  })

  it('🛑 tap target 44px ตั้งที่ธีม — ห้ามหาย (The Forty-Four Rule)', () => {
    /* วัดจอจริง 390px 2026-08-31: ก่อนแก้ ฝั่ง buyer มีเป้าที่กดได้ต่ำกว่า 44px **48 จุด**
       (`/dashboard` หน้าเดียว 20 จุด) และปุ่มสูง 30/38/43px ปนกันทั้งระบบ
       ถ้าใครถอด `minBlockSize` ออกจากธีม ทุกหน้าจะกลับไปเตี้ยพร้อมกันโดยไม่มีอะไรฟ้อง */
    const T = (f: string) => readFileSync(join(ROOT, 'src/@core/theme/overrides', f), 'utf8')
    expect(T('button.ts'), 'ปุ่มต้อง ≥44px').toMatch(/minBlockSize: 44\b/)
    expect(T('icon-button.ts'), 'ปุ่มไอคอนต้อง 44×44').toMatch(/minInlineSize: 44,\s*\n\s*minBlockSize: 44\b/)
    expect(T('input.ts'), 'ช่องกรอกต้อง ≥44px (filled + outlined)').toMatch(
      /minBlockSize: 44[\s\S]*minBlockSize: 44/,
    )
  })

  it('ปุ่มต้องเป็นทรงเดียว — ห้ามเอารัศมีที่ไล่ตามขนาดกลับมา', () => {
    /* `sizeSmall`/`sizeLarge` เคยตั้ง 4px/8px ⇒ หน้าเดียวมีปุ่มสองสามทรง
       พอทุกใบสูง 44 เท่ากันแล้ว `size` ไม่ได้ทำให้ปุ่มเล็กลงจริง เหลือแค่ตัวอักษร */
    /* 🛑 ต้องตัดคอมเมนต์ก่อน match — คอมเมนต์ที่อธิบายว่า "ถอด borderRadius ออกแล้ว"
       มีคำว่า `borderRadius` อยู่ในตัวมันเอง ⇒ ด่านจะแดงเพราะคำอธิบายของการแก้ที่ถูกต้อง
       (พลาดจริงตอนเขียนด่านนี้เอง — คลาสเดียวกับที่ `theme-guard.sh` เขียนกำกับไว้) */
    const btn = readFileSync(join(ROOT, 'src/@core/theme/overrides/button.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(btn).not.toMatch(/sizeSmall[\s\S]{0,200}?borderRadius:/)
    expect(btn).not.toMatch(/sizeLarge[\s\S]{0,200}?borderRadius:/)
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
