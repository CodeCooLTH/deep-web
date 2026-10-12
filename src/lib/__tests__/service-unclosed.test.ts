import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isServiceUnclosed, serviceUnclosedOrderWhere } from '../order-revenue'
import { shopQuickLinks } from '../role-nav'

/** 00073 ภาคต่อ (FR-014 · FR-015) — ยังไม่ปิดงาน (สีเหลือง) + ทางเข้าตั้งค่ารายงานบนมือถือ */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('ยังไม่ปิดงาน — นิยามเดียว (query = หน่วยความจำ)', () => {
  it('[blocker] ยังไม่ปิด + ไม่ใช่ ยกเลิก/คืน/ร่าง = ยังไม่ปิดงาน · ปิดแล้ว (รวมไม่มาตามนัด) ไม่ใช่', () => {
    expect(isServiceUnclosed({ status: 'PENDING', serviceClosedAt: null })).toBe(true)
    expect(isServiceUnclosed({ status: 'CONFIRMED', serviceClosedAt: null })).toBe(true)
    expect(isServiceUnclosed({ status: 'PENDING', serviceClosedAt: new Date() })).toBe(false)
    for (const st of ['CANCELLED', 'RETURNED', 'DRAFTED']) expect(isServiceUnclosed({ status: st, serviceClosedAt: null })).toBe(false)
  })
  it('[blocker] where ใช้สถานะชุดเดียวกับยอดขายร้านบริการ + serviceClosedAt null + ตัดช่วงด้วยวันเปิดบิล', () => {
    const w = serviceUnclosedOrderWhere({ gte: new Date('2026-10-01'), lt: new Date('2026-11-01') })
    expect(w.serviceClosedAt).toBeNull()
    expect(w.status.notIn).toEqual(['CANCELLED', 'RETURNED', 'DRAFTED'])
    expect(w.createdAt).toEqual({ gte: new Date('2026-10-01'), lt: new Date('2026-11-01') })
  })
})

describe('การ์ดมือถือ — ร้านอื่นไม่เปลี่ยน', () => {
  const card = read('src/app/(paces)/seller/(dashboard)/dashboard/components/SalesChartCard.tsx')
  it('[blocker] ก้อนเหลือง/ยอดรวม ผันเฉพาะร้านบริการ — ร้านอื่นใช้ unconfirmed/total เดิม', () => {
    expect(card).toMatch(/const pendingValues = isServiceSeries \? \(initialSeries\.unclosedValues \?\? unconfirmedValues\.map\(\(\) => 0\)\) : unconfirmedValues/)
    expect(card).toMatch(/const grandTotal = isServiceSeries \? total \+ \(initialSeries\.unclosedTotal \?\? 0\) : total/)
    expect(card).toMatch(/const pendingLabel = isServiceCard \? t\.dashboard\.chartUnclosed : t\.dashboard\.chartUnconfirmed/)
  })
})

describe('ทางเข้าตั้งค่ารายงานบนมือถือ (FR-015)', () => {
  it('[blocker] แท็บร้านค้ามีแถวตั้งค่ารายงานเมื่อเมนูจริงมี · ไม่มีเมื่อเมนูไม่มี', () => {
    expect(shopQuickLinks(new Set(['/settings/reports', '/admins']))).toEqual(['/settings/reports', '/admins'])
    expect(shopQuickLinks(new Set(['/admins']))).not.toContain('/settings/reports')
  })
  it('คำ/ไอคอนตรงกับเมนูคอม', () => {
    const links = read('src/app/(paces)/seller/(dashboard)/shop/components/ShopQuickLinks.tsx')
    expect(links).toMatch(/url: '\/settings\/reports',\s*label: 'ตั้งค่ารายงาน',\s*icon: 'adjustments-horizontal'/)
  })
})
