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
    const at = chart.indexOf("metric=\"อัตรากำไร\"")
    expect(at, 'ไม่พบแถวอัตรากำไร').toBeGreaterThan(-1)
    const block = chart.slice(at, at + 400)
    expect(block).toMatch(/profitCapped\s*\?\s*'ตั้งต้นทุนไม่ครบ'/)
    // เงื่อนไข capped ต้องมาก่อนสูตรคำนวณ % ไม่งั้นร้านที่ไม่เคยตั้งต้นทุนได้ "100%"
    expect(block.indexOf('ตั้งต้นทุนไม่ครบ')).toBeLessThan(block.indexOf('* 100'))
  })

  it('ธง capped ผูกกับ summary.hasMissingCost ที่ RSC คำนวณ', () => {
    expect(chart).toMatch(/const profitCapped = summary\.hasMissingCost === true/)
    expect(read('sales/page.tsx')).toMatch(/hasMissingCost = true/)
  })

  it('หน้า /sales ห้ามมีคำว่า "กำไรสุทธิ" ในการ์ด (Hard Rule 16 — ตัวเลขนี้ไม่หักค่าใช้จ่ายร้าน)', () => {
    expect(chart).not.toMatch(/กำไรสุทธิ/)
  })

  it('การ์ด P&L: อัตรากำไรสุทธิ/ขั้นต้น ต้องไม่เป็น % เมื่อ capped / ต้นทุนไม่ครบ', () => {
    // % ได้ก็ต่อเมื่อไม่ capped · capped แล้วต้องบอกว่าขาดอะไร (ทางแก้) ไม่ใช่คำกลาง ๆ
    expect(pnl).toMatch(/!capped\s*\?\s*pct\(\(report\.netProfit/)
    expect(pnl).toContain("'ยังไม่บันทึกค่าใช้จ่าย'")
    expect(pnl).toMatch(/report\.hasMissingCost\s*\?\s*'ตั้งต้นทุนไม่ครบ'/)
  })

  it('การ์ดต้นทุนใน P&L ใช้คำตามประเภทกิจการ ไม่ hardcode "ต้นทุนสินค้า"', () => {
    expect(pnl).toMatch(/title=\{costNoun\}/)
    expect(pnl).not.toMatch(/title="ต้นทุนสินค้า"/)
  })
})

describe('[blocker] ร้านบริการในแท็บยอดเก็บเงิน /sales', () => {
  const page = read('sales/page.tsx')
  const chart = read('sales/components/SalesChart.tsx')

  it('ไม่แสดงกำไร/ค่าส่ง (กำไรอยู่แท็บกำไรขาดทุน) — ทั้งการ์ดและตาราง', () => {
    expect(chart).toMatch(/const showFinance = summary\.totalShippingCost != null && !isServiceQueue/)
    expect(page).toMatch(/showFinance=\{canSeeFinance && !isServiceQueue\}/)
  })

  it('นับเป็น "งาน" ไม่ใช่ "ออเดอร์"', () => {
    expect(chart).toMatch(/const noun = isServiceQueue \? 'งาน' : 'ออเดอร์'/)
    expect(page).toMatch(/countNoun=\{isServiceQueue \? 'งาน' : 'ออเดอร์'\}/)
    // ไม่มี "ออเดอร์" ตายตัวเหลือในการ์ด/หัวตาราง
    expect(chart).not.toMatch(/(title|metric)="[^"]*ออเดอร์/)
    expect(read('sales/components/SalesTable.tsx')).not.toMatch(/header: '(เฉลี่ย\/)?ออเดอร์'/)
  })
})

describe('[blocker] ยอดค้างรับอยู่ในชีตการเงินร้านบนหน้าหลัก', () => {
  const sheet = read('dashboard/components/SalesChartSheet.tsx')

  it('ติดตั้งเฉพาะร้านบริการที่ดูการเงินได้ ด้วยช่วงเดียวกับที่ชีตแสดง', () => {
    expect(sheet).toMatch(/\{isService && hasFinance && <ReceivablesPanel start=\{financeStart\} end=\{financeEnd\} \/>\}/)
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
  const page = read('sales/page.tsx')
  const chart = read('sales/components/SalesChart.tsx')
  const table = read('sales/components/SalesTable.tsx')

  it('การ์ด/legend ใช้ receivable summary (รับจริง + ค้างรับ = ยอดขาย) เมื่อเป็นร้านบริการ', () => {
    expect(page).toMatch(/collect=\{receivables\?\.summary\}/)
    expect(chart).toMatch(/const moneyAxis = isServiceQueue && collect != null/)
    for (const w of ['เงินที่รับจริง', 'ค้างรับ', 'รับจริง']) expect(chart).toContain(w)
    expect(chart).toMatch(/collect\.salesTotal/)
  })

  it('ตารางร้านบริการเป็นแกนเงิน (งาน | ยอดขาย) ไม่ใช่ สำเร็จ/ยืนยันแล้ว', () => {
    expect(page).toMatch(/moneyAxis=\{isServiceQueue && receivables != null\}/)
    expect(table).toMatch(/if \(moneyAxis\) return buildMoneyColumns\(countNoun\)/)
  })

  it('ร่าง (DRAFTED) + คืนของครบใบ (RETURNED) ไม่ถูกนับ — ชุดแถวเดียวกับ receivable.service และชีต', () => {
    expect(page).toMatch(/o\.status !== DRAFTED_STATUS && o\.status !== 'RETURNED'/)
    const recv = readFileSync(join(process.cwd(), 'src/services/receivable.service.ts'), 'utf8')
    expect(recv).toMatch(/withoutDrafted\(\['CANCELLED', 'RETURNED'\]\)/)
    const dash = readFileSync(join(process.cwd(), 'src/services/dashboard.service.ts'), 'utf8')
    expect(dash).toMatch(/withoutDrafted\(\['CANCELLED', 'RETURNED'\]\), createdAt: \{ gte: prevGte/)
  })

  it('กราฟ/ตารางร้านบริการแยก รับจริง | ค้างรับ รายวัน จาก receivable.daily', () => {
    expect(page).toMatch(/received: receivables\.daily\[d\.date\]\?\.received \?\? 0/)
    expect(chart).toMatch(/name: 'รับจริง', group: 'sales'/)
    expect(chart).toMatch(/name: 'ค้างรับ',\s*group: 'sales'/)
    expect(table).toMatch(/id: 'received'/)
    expect(table).toMatch(/id: 'outstanding'/)
  })

  it('คำเตือนกำไรเพดานบนต้องเห็นบนจอ (caption) ไม่ใช่แค่ tooltip', () => {
    expect(chart).toMatch(/caption=\{profitCapped \? /)
    expect(read('_shared/PacesStatCard.tsx')).toMatch(/\{caption && <p/)
  })

  it('ตารางกำไรที่ต้นทุนไม่ครบ: สีเตือน + "(ไม่เกิน)"', () => {
    expect(table).toMatch(/header: capped \? 'กำไร \(ไม่เกิน\)' : 'กำไร'/)
  })
})
