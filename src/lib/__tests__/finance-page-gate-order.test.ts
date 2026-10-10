import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * 00071 T2 — ด่านเจ้าของร้านของหน้าการเงินต้อง "เรียกจริง" และอยู่ก่อน query ตัวแรก
 * (ผู้ไม่ใช่เจ้าของต้องไม่ถูกดึงข้อมูลเลย — ซ่อนใน JSX ไม่พอ) · ตัด import ออกก่อนหา
 * เพื่อไม่ให้ชื่อใน import บรรทัดบนสุดหลอกว่า "มี"
 */
const D = 'src/app/(paces)/seller/(dashboard)'
const PAGES: { file: string; gate: RegExp; queries: RegExp }[] = [
  { file: `${D}/sales/page.tsx`, gate: /await gatePage\([^)]*'F1'\)/,
    queries: /\b(resolveRangeFromParams|getOrdersByShop|getPnlReport|listExpenses|getCostCoverage)\(/ },
  { file: `${D}/expenses/page.tsx`, gate: /await gatePage\([^)]*'F1'\)/,
    queries: /\b(listExpenses|getPnlReport|hasAnyExpense)\(/ },
  { file: `${D}/reports/products/page.tsx`, gate: /await resolveProductReportAccess\(/,
    queries: /\b(getProductSalesMonth)\(/ },
]

describe('[blocker] ด่านเจ้าของร้านก่อน query ในหน้าการเงิน', () => {
  it.each(PAGES)('$file', ({ file, gate, queries }) => {
    const src = readFileSync(file, 'utf8').replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?$/gm, '')
    const g = src.search(gate)
    const q = src.search(queries)
    expect(g, 'ไม่พบการเรียกด่าน').toBeGreaterThan(-1)
    expect(q, 'ไม่พบ query').toBeGreaterThan(-1)
    expect(g).toBeLessThan(q)
  })
})
