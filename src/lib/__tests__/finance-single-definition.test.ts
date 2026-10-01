import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { netOfReturns, costNetOfReturns, type ReturnAdjustment } from '@/lib/order-return'
import { computeOrderProfit } from '@/lib/order-profit'

/**
 * [blocker] audit ความสอดคล้องของตัวเลขเงินทุกจอ (2026-10-01)
 *
 * ก่อนแก้ (ข้อมูลจริง ร้านขายออนไลน์ ส.ค. 2569): "ยืนยันแล้ว" ชีต 114,230 vs /sales 86,040 · ต้นทุน 3 ค่า
 * (53,721 / 37,470 / 49,324) · กำไรสุทธิ P&L 64,905 > กำไรจากการขาย 54,011 (เป็นไปไม่ได้ตามนิยาม)
 * หลังแก้ สคริปต์เทียบบนข้อมูลจริง 39/39 ตรง — เทสนี้ปักหมุดกติกาที่ทำให้มันตรง ไม่ให้ถอยกลับ
 *
 * มติ user 2026-10-01: (1) ใช้สูตรกำไรเดียวกันทุกจอ (2) หักคืนบางส่วนทุกจอ
 */
const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/[ \t]\/\/ .*$/gm, '')
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), 'utf8'))
const D = 'src/app/(paces)/seller/(dashboard)/'

const ADJ: ReturnAdjustment = { refund: 300, returnedCost: 120, returnedQtyByItem: { i1: 2 } }

describe('[blocker] คืนบางส่วน — ตัวกลางเดียว', () => {
  it('netOfReturns / costNetOfReturns หักเมื่อมีการคืน · ไม่มีการคืน = ค่าเดิม', () => {
    expect(netOfReturns(1000, ADJ)).toBe(700)
    expect(netOfReturns(1000, undefined)).toBe(1000)
    expect(costNetOfReturns(400, ADJ)).toBe(280)
    expect(costNetOfReturns(400, undefined)).toBe(400)
  })

  it('กำไรรายใบหักทั้งยอดคืนและต้นทุนชิ้นที่คืน', () => {
    const order = { totalAmount: 1000, items: [{ cost: 200, qty: 2 }] }
    expect(computeOrderProfit(order).amount).toBe(600)
    // (1000 − 300) − (400 − 120) = 420
    expect(computeOrderProfit(order, ADJ).amount).toBe(420)
  })

  it('ทุกจอที่รวมเงินดึงยอดคืนผ่านตัวกลาง **และใช้ผลนั้นหักจริง** (ไม่มีจอไหนหลุด)', () => {
    // 🛑 เช็คแค่ "เรียก getReturnAdjustments" ไม่พอ — mutation พิสูจน์แล้วว่าเรียกแต่ไม่ใช้ผลก็ยังเขียว
    //    ⇒ ทุกไฟล์ต้องมีจุดที่เอาผลไปหักจริง (regex ตัวที่สองของแต่ละคู่)
    const uses: [string, RegExp][] = [
      ['src/services/pnl.service.ts', /netOfReturns\(Number\(o\.totalAmount\), adj\)/],
      ['src/services/dashboard.service.ts', /const amt = netOfReturns\(Number\(r\.totalAmount\), adj\)/],
      ['src/services/receivable.service.ts', /totalAmount: netOfReturns\(Number\(r\.totalAmount\), returnAdj\.get\(r\.id\)\)/],
      ['src/services/product-sales-series.service.ts', /it\.qty - \(returnAdj\.get\(it\.orderId\)\?\.returnedQtyByItem\[it\.id\]/],
      ['src/services/customer-directory.service.ts', /const amount = netOfReturns\(Number\(o\.totalAmount\), returnAdj\.get\(o\.id\)\)/],
      [D + 'sales/page.tsx', /netOfReturns\(Number\(o\.totalAmount \?\? 0\), returnAdj\.get\(o\.id\)\)/],
      [D + 'dashboard/page.tsx', /netOfReturns\(Number\(o\.totalAmount\), returnAdj\.get\(o\.id\)\)/],
      [D + 'orders/[token]/page.tsx', /\(await getReturnAdjustments\(shop\.id\)\)\.get\(order\.id\)/],
    ]
    for (const [f, use] of uses) {
      const src = read(f)
      expect(src, f).toMatch(/getReturnAdjustments\(/)
      expect(src, `${f} เรียกแต่ไม่ได้ใช้ผลหัก`).toMatch(use)
    }
    expect(read('src/services/product.service.ts').match(/getReturnedQtyByProduct\(/g)?.length).toBeGreaterThanOrEqual(2)
    // รายงานผลงานแอดมินคิดเป็น SQL — ซับคิวรีหักยอดคืนที่รับของแล้ว
    expect(read('src/services/agent-performance.service.ts')).toMatch(
      /o\."totalAmount" - COALESCE\(\(\s*SELECT SUM\(r\."refundAmount"\) FROM "OrderReturn" r\s*WHERE r\."orderId" = o\."id" AND r\."status" = 'RECEIVED'/,
    )
  })
})

describe('[blocker] นิยามเดียวกันทุกจอ', () => {
  it('/sales นับยอดขายด้วย countsAsRevenue (SSOT) ไม่ใช่ status === CONFIRMED', () => {
    const page = read(D + 'sales/page.tsx')
    expect(page).not.toMatch(/status === 'CONFIRMED'/)
    expect(page).toMatch(/o\.status !== 'CANCELLED' && countsAsRevenue\(o\)/)
  })

  it('ชีตหน้าหลัก: กำไรจากการขาย = ยืนยันแล้ว − ต้นทุน(ยืนยัน) − ค่าส่ง(ยืนยัน) — สูตรเดียวกับ /sales', () => {
    const sheet = read(D + 'dashboard/components/SalesChartSheet.tsx')
    expect(sheet).toMatch(/const profit = confirmedTotal - cogsTotal - shippingTotal/)
    expect(sheet).toMatch(/const cogsTotal = \(series\.cogsConfirmedValues \?\? \[\]\)/)
    expect(sheet).toMatch(/const shippingTotal = \(series\.shippingConfirmedValues \?\? \[\]\)/)
    expect(sheet).toMatch(/value: \(isService \? series\.values\[i\] : series\.confirmedValues\[i\]\)/)
  })

  it('ชีตนับค่าส่งเฉพาะพัสดุขาไป', () => {
    expect(read('src/services/dashboard.service.ts')).toMatch(/sp\.direction === FORWARD_SHIPMENT/)
  })

  it('P&L นับค่าส่งขาไปเป็นค่าใช้จ่าย (D-EXT-10) — กำไรสุทธิไม่มีทางสูงกว่ากำไรจากการขาย', () => {
    const pnl = read('src/services/pnl.service.ts')
    expect(pnl).toMatch(/Number\(expenseAgg\._sum\.amount \?\? 0\) \+ shippingCost \+ returnShippingCost/)
    expect(pnl).toMatch(/prevSums\.shipping \+ prevReturnCost\.total/)
  })

  it('การ์ดหน้าแรกไม่นับร่าง และแท่งรายเดือนใช้ countsAsRevenue', () => {
    const home = read(D + 'dashboard/page.tsx')
    expect(home).toMatch(/const liveOrders = rawOrders\.filter\(\(o\) => o\.status !== DRAFTED_STATUS\)/)
    expect(home).toMatch(/const amt = countsAsRevenue\(o\) \? netAmount\(o\) : 0/)
  })

  it('สินค้าขายดี / รายงานรายสินค้า / หน้าร้านสาธารณะ ไม่นับใบคืนของทั้งใบ', () => {
    expect(read('src/services/product-sales-series.service.ts')).toMatch(/withoutDrafted\(\['CANCELLED', 'RETURNED'\]\)/)
    expect(read('src/services/product.service.ts').match(/withoutDrafted\(\["CANCELLED", "RETURNED"\]\)/g)?.length).toBe(2)
  })
})
