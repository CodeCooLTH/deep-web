import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * feature 00067 — TC-007, TC-024, TC-025, TC-028, TC-029
 *
 * กฎในไฟล์นี้ **พิสูจน์ด้วยการรันโค้ดไม่ได้** เพราะมันเป็นกฎว่า "ห้ามมีโค้ดแบบนี้อยู่" และ
 * หน้าเป็น RSC ที่แตะ prisma (รีโปนี้ไม่มี jsdom และ Hard Rule 13 ห้าม unit test แตะฐาน)
 * ⇒ สแกนซอร์สแทน
 *
 * 🛑 ทุกลูปต้องพิสูจน์ก่อนว่า **อ่านไฟล์เจอจริง** — เทสที่เดินไดเรกทอรีแล้วไม่เจอไฟล์เลย
 * จะเขียวตลอดโดยไม่ได้ตรวจอะไร (บทเรียน rule-must-be-enforced-not-described.md)
 */

const SALES_DIR = join(process.cwd(), 'src/app/(paces)/seller/(dashboard)/sales')
const PAGE = join(SALES_DIR, 'page.tsx')

/** ตัดคอมเมนต์ออกก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !e.name.includes('.test.'))
    .map((e) => join(e.parentPath ?? dir, e.name))
}

describe('[blocker] แท็บการเงินต้องโผล่เฉพาะร้านบริการ', () => {
  const page = stripComments(readFileSync(PAGE, 'utf8'))

  it('อ่านไฟล์ page.tsx เจอจริง', () => {
    expect(page.length).toBeGreaterThan(500)
  })

  it('ตัดสิน vertical ด้วย resolveShopVertical ไม่ใช่เทียบสตริงจาก shop.vertical ตรง ๆ', () => {
    // fail-closed อยู่ในตัว resolveShopVertical — เทียบเองจะตกไป branch ผิดเงียบ ๆ เมื่อมี vertical ที่สี่
    expect(page).toMatch(/resolveShopVertical\(\s*shop\.vertical\s*\)\s*===\s*'SERVICE_QUEUE'/)
    expect(page).not.toMatch(/shop\.vertical\s*===\s*'SERVICE_QUEUE'/)
  })

  it('เก็บผลไว้ในตัวแปรเดียว แล้วใช้ตัวนั้นคุมทุกจุด (ไม่กระจายเงื่อนไข)', () => {
    expect(page).toMatch(/const\s+isServiceQueue\s*=/)
    // จำนวนครั้งที่เทียบ 'SERVICE_QUEUE' ในหน้านี้ต้องมีครั้งเดียว = จุดตัดสินเดียว
    const comparisons = page.match(/'SERVICE_QUEUE'/g) ?? []
    expect(comparisons).toHaveLength(1)
  })

  it('ทุกจุดที่ render แถบแท็บ ต้องอยู่ใต้ด่าน isServiceQueue', () => {
    /**
     * 🛑 ห้ามเช็คด้วยการ "ย้อนขึ้นไป N ตัวอักษรแล้วหาคำว่า isServiceQueue" — ระยะห่างเปลี่ยนได้
     * ทุกครั้งที่มีคนเพิ่มบรรทัด แล้วเทสจะแดงจากการจัดรูปแบบ หรือแย่กว่านั้นคือเขียวทั้งที่ด่านหลุด
     * ต้องหาขอบเขตจริงของบล็อก `if (isServiceQueue && ...) { ... }` ด้วยการนับวงเล็บปีกกา
     */
    const guardStart = page.search(/if\s*\(\s*isServiceQueue\s*&&[^)]*\)\s*\{/)
    expect(guardStart, 'ไม่พบบล็อกที่กั้นด้วย isServiceQueue').toBeGreaterThan(-1)

    const openBrace = page.indexOf('{', guardStart)
    let depth = 0
    let guardEnd = -1
    for (let i = openBrace; i < page.length; i++) {
      if (page[i] === '{') depth++
      else if (page[i] === '}') {
        depth--
        if (depth === 0) {
          guardEnd = i
          break
        }
      }
    }
    expect(guardEnd, 'หาปีกกาปิดของบล็อกด่านไม่เจอ').toBeGreaterThan(openBrace)

    const usages = [...page.matchAll(/<FinanceTabs/g)]
    expect(usages.length).toBeGreaterThan(0)

    for (const m of usages) {
      const at = m.index!
      const insideGuardedBlock = at > openBrace && at < guardEnd
      // จุดที่อยู่นอกบล็อก ต้องถูกกั้นด้วยนิพจน์ `isServiceQueue && ...` บนบรรทัดเดียวกัน
      const lineStart = page.lastIndexOf('\n', at) + 1
      const inlineGuarded = /isServiceQueue\s*&&/.test(page.slice(lineStart, at))
      expect(
        insideGuardedBlock || inlineGuarded,
        `<FinanceTabs> ที่ตำแหน่ง ${at} ไม่ได้ถูกกั้นด้วย isServiceQueue`,
      ).toBe(true)
    }
  })

  it('สาขาของแท็บอื่นต้องกั้นด้วยทั้ง isServiceQueue และสิทธิ์การเงิน', () => {
    expect(page).toMatch(/if\s*\(\s*isServiceQueue\s*&&\s*canSeeFinance\s*&&\s*tab\s*!==\s*'collect'\s*\)/)
  })
})

describe('[blocker] ไม่มีไฟล์ไหนในหน้านี้คิดกำไรด้วยสูตรของตัวเอง', () => {
  const files = tsxFiles(SALES_DIR)

  it('เดินไฟล์เจอจริง', () => {
    expect(files.length).toBeGreaterThan(3)
  })

  it('คำ/สี/ไอคอนของกำไรมาจาก SSOT เท่านั้น — ห้าม hardcode คำว่ากำไรสุทธิ', () => {
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'))
      // 'กำไรสุทธิ' เป็นของ profitDisplay() ใน format-money.ts ที่เดียว
      expect(src, `${f} เขียนคำว่ากำไรสุทธิเอง`).not.toMatch(/'กำไรสุทธิ'|"กำไรสุทธิ"|>กำไรสุทธิ</)
    }
  })

  it('ไม่ import chart lib ตรง ๆ (Hard Rule 10)', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/from ['"](react-apexcharts|echarts|chart\.js|recharts)['"]/)
    }
  })

  it('ไม่มี arbitrary Tailwind value ใน (paces) (Hard Rule 7)', () => {
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'))
      expect(src, f).not.toMatch(/\b(text|bg|rounded|shadow|border)-\[/)
    }
  })

  it('ไม่มี emoji (Hard Rule 12)', () => {
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'))
      expect(src, f).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u)
    }
  })
})
