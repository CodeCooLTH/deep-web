import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * feature 00067 FR-FIN-16 — ด่านของชีตการเงินบนหน้าหลัก
 *
 * ชีตนี้เป็น client component ที่ผูกกับ ApexCharts และรีโปไม่มี jsdom ⇒ ทดสอบพฤติกรรมไม่ได้
 * กฎที่ต้องกันคือ "ห้ามมีโค้ดแบบนี้อยู่" ซึ่งพิสูจน์ด้วยการรันไม่ได้อยู่แล้ว ⇒ สแกนซอร์ส
 */

const DIR = join(process.cwd(), 'src/app/(paces)/seller/(dashboard)/dashboard/components')
const SHEET = join(DIR, 'SalesChartSheet.tsx')
const PANELS = join(DIR, 'FinancePanels.tsx')

/** ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

describe('[blocker] แท็บการเงินในชีต — โผล่เฉพาะร้านบริการ', () => {
  const sheet = strip(readFileSync(SHEET, 'utf8'))

  it('อ่านไฟล์ชีตเจอจริง', () => {
    expect(sheet.length).toBeGreaterThan(5000)
  })

  it('แถบแท็บถูกกั้นด้วย isService', () => {
    const at = sheet.indexOf('role="tablist"')
    expect(at, 'ไม่พบแถบแท็บในชีต').toBeGreaterThan(-1)
    // ย้อนหาจุดเปิดของนิพจน์เงื่อนไขที่ครอบมันอยู่
    const before = sheet.slice(0, at)
    const lastGuard = before.lastIndexOf('{isService && (')
    const lastJsxOpen = before.lastIndexOf('<nav')
    expect(lastGuard, 'แถบแท็บไม่ได้อยู่ใต้ {isService && (').toBeGreaterThan(-1)
    expect(lastGuard).toBeLessThan(lastJsxOpen)
  })

  it('เนื้อหาแท็บอื่นถูกกั้นด้วย isService ด้วย', () => {
    expect(sheet).toMatch(/\{isService && financeTab !== 'collect' && \(/)
  })

  it('แท็บเริ่มต้นของชีตคือ collect ไม่ใช่ pnl', () => {
    // ผู้ใช้กดการ์ด "ยอดขาย" เข้ามา — สลับเนื้อหาใต้นิ้วทันทีคือการตอบคำถามที่เขาไม่ได้ถาม
    expect(sheet).toMatch(/useState<FinanceTab>\('collect'\)/)
  })

  it('ป้ายแท็บต้องเป็นคำชุดเดียวกับหน้า /sales', () => {
    for (const label of ['กำไรขาดทุน', 'ยอดเก็บเงิน', 'ค่าใช้จ่าย']) {
      expect(sheet).toContain(label)
    }
  })
})

describe('[blocker] ตัวเลขกำไรในชีตต้องมาจาก SSOT เดียวกับหน้า /sales', () => {
  const panels = strip(readFileSync(PANELS, 'utf8'))
  const sheet = strip(readFileSync(SHEET, 'utf8'))

  it('อ่านไฟล์แผงเจอจริง', () => {
    expect(panels.length).toBeGreaterThan(2000)
  })

  it('ดึงจาก /api/expenses/report — endpoint เดียวกับการ์ด P&L ที่ /expenses', () => {
    expect(panels).toContain('/api/expenses/report')
  })

  it('🛑 ห้ามคำนวณกำไรเองจาก series ที่ชีตถืออยู่', () => {
    /**
     * `series` คิดด้วยสูตรของหน้า /sales (ยอดขาย − ต้นทุน − ค่าส่ง) ซึ่งไม่หักค่าใช้จ่ายร้าน
     * ถ้าแผงนี้ไปอ่านมันมาเรียกว่า "กำไร" จะได้ตัวเลขชุดที่สามของสิ่งเดียวกัน
     * = บั๊ก P0 แบบเดียวกับ 2026-08-08 ซึ่ง tsc/build/theme-guard จับไม่ได้เลย
     */
    expect(panels).not.toMatch(/\bseries\b/)
    expect(panels).not.toMatch(/totalShipping|receivedValues|confirmedValues/)
  })

  it('คำ/สี/ไอคอนของกำไรมาจาก profitDisplay ไม่ใช่เขียนเอง', () => {
    expect(panels).toContain('profitDisplay')
    expect(panels).not.toMatch(/'กำไรสุทธิ'|"กำไรสุทธิ"|>กำไรสุทธิ</)
  })

  it('สูตรถูก render ให้ผู้ใช้เห็น ไม่ใช่เก็บไว้ในคอมเมนต์', () => {
    expect(panels).toContain('netProfitFormula')
  })

  it('ชีตส่ง costNoun เข้าแผง ไม่ hardcode คำว่าต้นทุนสินค้าในแผง', () => {
    expect(sheet).toMatch(/costNoun=\{costNoun\}/)
    expect(panels).not.toMatch(/'ต้นทุนสินค้า'/)
  })

  it('โหลดเฉพาะตอนเปิดแท็บ — แผงถูก render ใต้เงื่อนไข financeTab', () => {
    const at = sheet.indexOf('<FinancePanels')
    expect(at).toBeGreaterThan(-1)
    expect(sheet.slice(Math.max(0, at - 300), at)).toMatch(/financeTab !== 'collect'/)
  })
})

describe('[blocker] กฎธีมของไฟล์ที่แตะ', () => {
  for (const f of [SHEET, PANELS]) {
    it(`ไม่มี emoji / chart lib ตรง ๆ — ${f.split('/').pop()}`, () => {
      const raw = readFileSync(f, 'utf8')
      expect(strip(raw)).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u)
      expect(raw).not.toMatch(/from ['"](react-apexcharts|echarts|chart\.js|recharts)['"]/)
    })
  }
})
