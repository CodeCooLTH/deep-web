import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * [blocker] audit responsive หน้ารายงานฝั่งร้าน (2026-10-01) — มือถือ 320/390 · tablet 768–1023 · laptop 1024 · desktop ≥1280
 *
 * ทุกข้อเป็นเรื่อง "ขนาดจอ" ที่ tsc/build/เทสพฤติกรรมมองไม่เห็น และรีโปไม่มีเบราว์เซอร์ใน CI
 * ⇒ ปักหมุดคลาส/โครงที่แก้ไว้ด้วยการสแกนซอร์ส (ตัวเลขความกว้างอยู่ในคอมเมนต์ของแต่ละไฟล์)
 * 🛑 จอ 1024 แคบกว่า tablet (sidebar 245px) — grid หลายคอลัมน์ที่เริ่มที่ lg คือจุดที่ล้นบ่อยที่สุด
 */
// ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่แก้ถูกคือไฟล์ที่เขียนอธิบายคลาสเดิมไว้ในคอมเมนต์ (บทเรียนซ้ำของรีโปนี้)
const strip = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), 'utf8'))
const D = 'src/app/(paces)/seller/(dashboard)/'

describe('[blocker] รายงาน — responsive', () => {
  it('pagination ตัดบรรทัดได้ (จอ 320 ปุ่ม "ถัดไป" เคยถูกตัดหาย)', () => {
    const src = read('src/components/table/TablePagination.tsx')
    expect(src).toMatch(/'flex w-full flex-wrap items-center/)
    expect(src).toMatch(/pagination pagination-boxed pagination-sm mb-0 flex flex-wrap/)
  })

  it('การ์ดสรุป /sales ไม่ใช้ 6 คอลัมน์ / 4 คอลัมน์ที่ lg (ตัวเลขล้นการ์ด)', () => {
    const chart = read(D + 'sales/components/SalesChart.tsx')
    expect(chart).not.toMatch(/xl:grid-cols-6/)
    expect(chart).not.toMatch(/'lg:grid-cols-4'/)
    expect(read(D + '_shared/PacesStatCard.tsx')).toMatch(/my-5 flex min-w-0 flex-wrap items-center/)
  })

  it('การ์ด P&L 5 ใบ: 5 คอลัมน์เฉพาะ 2xl + การ์ดแรกเต็มแถวบน md', () => {
    const pnl = read(D + 'expenses/components/PnlReportCard.tsx')
    expect(pnl).not.toMatch(/lg:grid-cols-5/)
    expect(pnl).toMatch(/2xl:grid-cols-5/)
    expect(pnl).toMatch(/className="md:col-span-2 2xl:col-span-1"/)
  })

  it('ชีตเต็มจอรับ safe-area ที่เปลือก (แอป WebView เต็มจอ — หัวชีตเคยอยู่ใต้รอยบาก)', () => {
    for (const f of [
      'dashboard/components/SalesChartSheet.tsx',
      'reports/products/components/ProductDetailSheet.tsx',
      'reports/products/components/MonthPickerSheet.tsx',
    ]) {
      expect(read(D + f), f).toMatch(/fixed inset-0 z-\d+ flex flex-col[^'"]*pt-\[env\(safe-area-inset-top\)\] pb-\[env\(safe-area-inset-bottom\)\]/)
    }
  })

  it('ชีตยอดขายปิดตัวเองเมื่อจอข้ามเส้น lg (หมุน iPad แล้ว scroll ล็อกค้าง)', () => {
    expect(read(D + 'dashboard/components/SalesChartSheet.tsx')).toMatch(
      /matchMedia\('\(min-width: 1024px\)'\)[\s\S]{0,200}if \(e\.matches\) onClose\(\)/,
    )
  })

  it('รายงานสินค้าสลับ layout ที่ lg พร้อมหัวแอป ไม่ใช่ md', () => {
    const client = read(D + 'reports/products/components/ProductSalesClient.tsx')
    expect(client).not.toMatch(/\bmd:hidden\b|\bmd:flex\b/)
    const page = read(D + 'reports/products/page.tsx')
    expect(page).toMatch(/hideTitleBelowLg/)
    expect(page).not.toMatch(/max-md:hidden/)
  })

  it('รายงานผลงานแอดมินใช้ตัวเลือกช่วงเวลาตัวเดียวกับหน้าการเงิน', () => {
    const f = read(D + 'reports/agents/components/ReportFilters.tsx')
    expect(f).toMatch(/<DateRangeControl/)
    expect(f).not.toMatch(/type="date"/)
  })

  it('แถบปุ่มค่าใช้จ่ายบนมือถืออยู่เหนือเมนูล่าง 4.5rem พอดี', () => {
    expect(read(D + 'expenses/components/ExpenseWorkspace.tsx')).toMatch(
      /bottom: 'calc\(4\.5rem \+ env\(safe-area-inset-bottom\)\)'/,
    )
  })
})
