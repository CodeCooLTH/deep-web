import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * [blocker] 2026-10-01 — user: "อัตรากำไรสุทธิ 100% หลอกคนอ่าน · คอลัมน์ออเดอร์/กำไรไม่ตรงกับร้านบริการ ·
 * ยอดค้างรับต้องอยู่ในชีตที่ผู้ขายใช้จริง"
 *
 * คอมโพเนนต์เป็น client + ApexCharts และรีโปไม่มี jsdom ⇒ กฎ "ห้ามมีโค้ดแบบนี้" พิสูจน์ด้วยการสแกนซอร์ส
 * (ตัดคอมเมนต์ก่อน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎไว้ด้วย)
 */
const ROOT = join(process.cwd(), 'src/app/(paces)/seller/(dashboard)')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = (p: string) => strip(readFileSync(join(ROOT, p), 'utf8'))

describe('[blocker] อัตรากำไรห้ามเป็นตัวเลขเมื่อข้อมูลไม่ครบ', () => {
  const chart = read('sales/components/SalesChart.tsx')
  const pnl = read('expenses/components/PnlReportCard.tsx')

  it('การ์ดกำไร /sales: ต้นทุนไม่ครบ → "ตั้งต้นทุนไม่ครบ" มาก่อนสูตร %', () => {
    // ป้ายแถวผันตามประเภทร้าน (ร้านอื่น = คำเดิม "อัตรากำไรสุทธิ" — มติ user 2026-10-02)
    const at = chart.indexOf("metric={legacyWords ? 'อัตรากำไรสุทธิ' : 'อัตรากำไร'}")
    expect(at, 'ไม่พบแถวอัตรากำไร').toBeGreaterThan(-1)
    const block = chart.slice(at, at + 400)
    expect(block).toMatch(/profitCapped\s*\?\s*'ตั้งต้นทุนไม่ครบ'/)
    // เงื่อนไข capped ต้องมาก่อนสูตรคำนวณ % ไม่งั้นร้านที่ไม่เคยตั้งต้นทุนได้ "100%"
    expect(block.indexOf('ตั้งต้นทุนไม่ครบ')).toBeLessThan(block.indexOf('* 100'))
  })


  it('หน้า /sales: คำว่า "กำไรสุทธิ" อยู่ได้เฉพาะกิ่งคำเดิมของร้านที่ไม่ใช่บริการ (มติ user 2026-10-02)', () => {
    // ร้านบริการ (กติกาใหม่) ห้ามเห็นคำนี้ — ตัวเลขไม่หักค่าใช้จ่ายร้าน (HR16)
    // ร้านขายออนไลน์/บ้านพัก ได้คำเดิมก่อน 00067 กลับมาตามที่ user สั่ง "กลับเป็นคำเดิมด้วย"
    const hits = chart.match(/[^\n]*กำไรสุทธิ[^\n]*/g) ?? []
    expect(hits.length).toBeGreaterThan(0)
    for (const line of hits) expect(line, line).toMatch(/legacyWords \? 'อัตรากำไรสุทธิ' : 'อัตรากำไร'/)
  })

  it('การ์ด P&L: อัตรากำไรสุทธิ/ขั้นต้น ต้องไม่เป็น % เมื่อ capped / ต้นทุนไม่ครบ', () => {
    // % ได้ก็ต่อเมื่อไม่ capped · capped แล้วต้องบอกว่าขาดอะไร (ทางแก้) ไม่ใช่คำกลาง ๆ
    // 00073 เฟส B — ตัวตั้งคือกำไรที่แสดง (หักครบ = report.netProfit เป๊ะ · ดู shownProfit) · ด่าน !capped ยังอยู่
    expect(pnl).toMatch(/!capped\s*\?\s*pct\(\(shownProfit/)
    expect(pnl).toMatch(/exclusions\.length === 0\s*\?\s*report\.netProfit/)
    expect(pnl).toContain("'ยังไม่บันทึกค่าใช้จ่าย'")
    expect(pnl).toMatch(/report\.hasMissingCost\s*\?\s*'ตั้งต้นทุนไม่ครบ'/)
  })

  it('การ์ดต้นทุนใน P&L ใช้คำตามประเภทกิจการ ไม่ hardcode "ต้นทุนสินค้า"', () => {
    expect(pnl).toMatch(/title=\{costNoun\}/)
    expect(pnl).not.toMatch(/title="ต้นทุนสินค้า"/)
  })
})

describe('[blocker] ยอดค้างรับอยู่ในชีตการเงินร้านบนหน้าหลัก', () => {
  const sheet = read('dashboard/components/SalesChartSheet.tsx')

  it('ติดตั้งเฉพาะร้านบริการที่ดูการเงินได้ ด้วยช่วงเดียวกับที่ชีตแสดง', () => {
    expect(sheet).toMatch(/\{isService && hasFinance && rs\.receivables && <ReceivablesPanel start=\{financeStart\} end=\{financeEnd\} \/>\}/)
  })

  it('ใช้ ReceivableList ตัวเดียวกับ /sales และข้อความนิยามชุดเดียว', () => {
    const panel = read('dashboard/components/ReceivablesPanel.tsx')
    expect(panel).toMatch(/from '\.\.\/\.\.\/sales\/components\/ReceivableList'/)
    expect(panel).toMatch(/basisNote=\{RECEIVABLE_BASIS_NOTE\}/)
    // 403/404 = ไม่มีสิทธิ์/ไม่ใช่ร้านบริการ → ซ่อน ไม่ขึ้นจอ error
    expect(panel).toMatch(/res\.status === 403 \|\| res\.status === 404/)
  })
})

describe('[blocker] แท็บยอดเก็บเงินร้านบริการพูดแกนเงินชุดเดียวกับชีต (review HR8 2026-10-01)', () => {
  const chart = read('sales/components/SalesChart.tsx')
  const table = read('sales/components/SalesTable.tsx')

  it('คำเตือนกำไรเพดานบนต้องเห็นบนจอ (caption) ไม่ใช่แค่ tooltip', () => {
    expect(chart).toMatch(/caption=\{profitCapped \? /)
    expect(read('_shared/PacesStatCard.tsx')).toMatch(/\{caption && <p/)
  })

  it('ตารางกำไรที่ต้นทุนไม่ครบ: สีเตือน + "(ไม่เกิน)"', () => {
    expect(table).toMatch(/header: capped \? 'กำไร \(ไม่เกิน\)' : 'กำไร'/)
  })
})
