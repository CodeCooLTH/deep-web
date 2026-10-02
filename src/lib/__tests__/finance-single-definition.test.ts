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

/**
 * 🛑 มติ user 2026-10-02 — "นิยามเดียวกันทุกจอ" ใช้กับ **ร้านบริการเท่านั้น**
 * ลูกค้าร้านขายของรายงานว่าชีตขึ้นกำไร 0 / ต้นทุน — หลัง #97 ⇒ ร้านขายออนไลน์/บ้านพักกลับเป็นของเดิมทุกจุด
 * ตัวตัดสินกลาง: usesServiceFinanceRules (src/lib/finance-rules.ts) · พฤติกรรมจริงพิสูจน์ใน
 * src/services/__tests__/finance-rules-by-vertical.test.ts — ไฟล์นี้ปักหมุดว่าทุกจุด "แยกตามประเภทร้าน" จริง
 */
describe('[blocker] นิยามใหม่ใช้กับร้านบริการ — ร้านอื่นได้ของเดิม', () => {
  it('/sales: ร้านบริการนับ countsAsRevenue · ร้านอื่นนับ status === CONFIRMED ตามเดิม', () => {
    const page = read(D + 'sales/page.tsx')
    expect(page).toMatch(/const newRules = usesServiceFinanceRules\(shop\.vertical\)/)
    expect(page).toMatch(/const isSale = \(o: \(typeof shopOrders\)\[number\]\) => \(newRules \? countsAsRevenue\(o\) : o\.status === 'CONFIRMED'\)/)
    expect(page).toMatch(/o\.status !== 'CANCELLED' && isSale\(o\)/)
    // ห้ามมีที่ไหนเรียก countsAsRevenue ตรง ๆ แบบไม่ผ่าน isSale (จะหลุดไปใช้กับร้านขายของ)
    expect(page.match(/countsAsRevenue\(o\)/g)?.length).toBe(1)
  })

  it('ชีตหน้าหลัก: ร้านบริการ = ยืนยันแล้ว − … · ร้านอื่น = ยอดทุกบิล − ต้นทุนทุกบิล − ค่าส่งทุกบิล (สูตรเดิม)', () => {
    const sheet = read(D + 'dashboard/components/SalesChartSheet.tsx')
    expect(sheet).toMatch(
      /const profit = isService \? confirmedTotal - cogsTotal - shippingTotal : series\.total - cogsTotal - shippingTotal/,
    )
    expect(sheet).toMatch(/: \(series\.totalCogs \?\? 0\)/)
    expect(sheet).toMatch(/: \(series\.totalShipping \?\? 0\)/)
    // ตาราง: ยอดบิลทั้งหมด + ต้นทุน/ค่าส่งทุกใบ (คำว่า "—" ในคอลัมน์ต้นทุนกลับมาแปลว่า "ไม่ได้ตั้งต้นทุน" อย่างเดียว)
    expect(sheet).toMatch(/value: series\.values\[i\] \?\? 0,/)
    expect(sheet).toMatch(/cogs: series\.cogsValues\?\.\[i\] \?\? 0,/)
    // คำเดิมของร้านที่ไม่ใช่บริการ
    expect(sheet).toMatch(/hasFinance \? 'กำไร\/ขาดทุน' : 'ยอดขาย'/)
    expect(sheet).toMatch(/label="รอยืนยัน" value=\{unconfirmedTotal\}/)
  })

  it('ชีต/การ์ด: ค่าส่งเฉพาะพัสดุขาไป + ตัด RETURNED — ร้านบริการเท่านั้น', () => {
    const svc = read('src/services/dashboard.service.ts')
    expect(svc).toMatch(/const newRules = usesServiceFinanceRules\(vertical\)/)
    expect(svc).toMatch(/\(!newRules \|\| sp\.direction === FORWARD_SHIPMENT\)/)
    expect(svc).toMatch(/withoutDrafted\(newRules \? \['CANCELLED', 'RETURNED'\] : 'CANCELLED'\)/)
    expect(svc).toMatch(/newRules \? getReturnAdjustments\(shopId\) : Promise\.resolve\(new Map/)
  })

  it('P&L: ค่าส่งขาไปเป็นค่าใช้จ่าย + หักคืน — ร้านบริการเท่านั้น · vertical เป็นพารามิเตอร์บังคับ', () => {
    const pnl = read('src/services/pnl.service.ts')
    expect(pnl).toMatch(/vertical: string \| null \| undefined,\n\): Promise<PnlReport>/)
    expect(pnl).toMatch(/const shippingCost = newRules \? round2\(shipping\) : 0/)
    expect(pnl).toMatch(/\(newRules \? prevSums\.shipping : 0\)/)
    // ผู้เรียกทุกรายต้องส่ง vertical (ไม่มีค่าเริ่มต้นให้หลุดไปทางใดทางหนึ่งเงียบ ๆ)
    for (const f of [D + 'sales/page.tsx', D + 'expenses/page.tsx', 'src/app/api/expenses/report/route.ts']) {
      const src = read(f)
      const calls = src.match(/getPnlReport\([^)]*\)/g) ?? []
      expect(calls.length, f).toBeGreaterThan(0)
      for (const c of calls) expect(c, f).toMatch(/\.vertical\)$/)
    }
  })

  it('หน้าแรก desktop: ตัดร่าง/หักคืน/กราฟรายเดือนแบบใหม่ — ร้านบริการเท่านั้น', () => {
    const home = read(D + 'dashboard/page.tsx')
    expect(home).toMatch(/const newRules = usesServiceFinanceRules\(shop\.vertical\)/)
    expect(home).toMatch(/const liveOrders = newRules \? rawOrders\.filter\(\(o\) => o\.status !== DRAFTED_STATUS\) : rawOrders/)
    expect(home).toMatch(/const amt = newRules \? \(countsAsRevenue\(o\) \? netAmount\(o\) : 0\) : Number\(o\.totalAmount\)/)
  })

  it('สินค้าขายดี / รายงานรายสินค้า / หน้าร้าน / ลูกค้า / รายงานแอดมิน / กำไรรายใบ — ถามประเภทร้านก่อนใช้กติกาใหม่', () => {
    const prod = read('src/services/product.service.ts')
    expect(prod.match(/withoutDrafted\(newRules \? \["CANCELLED", "RETURNED"\] : "CANCELLED"\)/g)?.length).toBe(2)
    expect(read('src/services/product-sales-series.service.ts')).toMatch(
      /withoutDrafted\(newRules \? \['CANCELLED', 'RETURNED'\] : 'CANCELLED'\)/,
    )
    for (const f of [
      'src/services/product.service.ts',
      'src/services/product-sales-series.service.ts',
      'src/services/customer-directory.service.ts',
      'src/services/agent-performance.service.ts',
    ]) {
      expect(read(f), f).toMatch(/shopUsesServiceFinanceRules\(|productsUseServiceFinanceRules\(/)
    }
    expect(read(D + 'orders/[token]/page.tsx')).toMatch(
      /usesServiceFinanceRules\(shop\.vertical\) \? \(await getReturnAdjustments\(shop\.id\)\)\.get\(order\.id\) : undefined/,
    )
  })
})
