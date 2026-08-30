/**
 * ด่านของรายงานยอดขายรายสินค้า (feature 00063)
 *
 * 🛑 [blocker] — `docs/conventions/rule-must-be-enforced-not-described.md`: กฎที่ "เขียนไว้"
 * ยังไม่ใช่กฎที่ "บังคับได้" เอกสารของฟีเจอร์นี้เขียนไว้ 3 ที่ว่าหน้านี้เห็นเฉพาะร้าน
 * ONLINE_SALES และเฉพาะผู้มีสิทธิ์ — เทสชุดนี้คือสิ่งที่ทำให้คำนั้นเป็นจริง
 *
 * `seller-menu.ts` ประกาศตัวเองว่า "ทำหน้าที่แค่ไม่รกตา ไม่ได้ทำหน้าที่ป้องกัน" ⇒ การซ่อนเมนู
 * ไม่นับเป็นด่าน ต้องมี guard ที่ระดับหน้าด้วย และเทสต้องยืนยันว่า guard นั้น **ถูกเรียกจริง**
 * ไม่ใช่แค่ถูก import (บทเรียน `_shopId` ของ 00037: prop ที่ส่งมาแล้วไม่ถูกใช้ ไม่นับ)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { flattenSellerMenu, resolveVisibleSellerMenu, sellerMenuItems } from '../seller-menu'

const ROOT = join(__dirname, '..', '..', '..')
const PAGE = join(
  ROOT,
  'src/app/(paces)/seller/(dashboard)/reports/products/page.tsx',
)
const ACCESS = join(ROOT, 'src/services/product-report-access.service.ts')
const SLUG = 'seller:reports-products'

/** ตัดคอมเมนต์ออกก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

/** ctx เดียวกับ `seller-menu.test.ts` — เปิดทุกอย่างเท่าที่เปิดได้ ให้เหลือ vertical เป็นตัวแปรเดียว */
function menuFor(vertical: string) {
  return flattenSellerMenu(
    resolveVisibleSellerMenu(sellerMenuItems, {
      entitlement: { status: 'ACTIVE' as const, package: 'PRO' as const },
      staff: { kind: 'BUSINESS' as const, role: 'OWNER' as const },
      expense: { kind: 'GRANTED' } as never,
      shop: { kind: 'BUSINESS', vertical },
    }),
  ).map((i) => i.slug)
}

describe('[blocker] เมนูยอดขายรายสินค้าโผล่เฉพาะร้าน ONLINE_SALES', () => {
  it('ONLINE_SALES เห็น', () => {
    expect(menuFor('ONLINE_SALES')).toContain(SLUG)
  })

  it('SERVICE_QUEUE ไม่เห็น', () => {
    expect(menuFor('SERVICE_QUEUE')).not.toContain(SLUG)
  })

  it('LODGING ไม่เห็น', () => {
    expect(menuFor('LODGING')).not.toContain(SLUG)
  })

  it('vertical ที่ไม่รู้จัก fail-closed ไปทาง ONLINE_SALES (พฤติกรรมเดิมของระบบ)', () => {
    expect(menuFor('SOMETHING_NEW')).toContain(SLUG)
  })
})

describe('[blocker] หน้า /reports/products ต้องมี guard ฝั่งเซิร์ฟเวอร์จริง ไม่ใช่แค่ซ่อนเมนู', () => {
  const page = stripComments(readFileSync(PAGE, 'utf8'))

  it('เรียก resolveProductReportAccess() จริง ไม่ใช่แค่ import', () => {
    expect(page).toMatch(/resolveProductReportAccess\s*\(/)
  })

  it('จัดการครบทั้ง 3 ทางปฏิเสธ — ขาดทางไหนแปลว่าตกลงไปที่การแสดงข้อมูล', () => {
    for (const kind of ['NO_SHOP', 'WRONG_VERTICAL', 'FORBIDDEN']) {
      expect(page).toContain(`'${kind}'`)
    }
  })

  it('ไม่ query ยอดขายก่อนตัดสินสิทธิ์ — ด่านต้องอยู่เหนือการดึงข้อมูล', () => {
    const guardAt = page.indexOf('resolveProductReportAccess(')
    const queryAt = page.indexOf('getProductSalesMonth(')
    expect(guardAt).toBeGreaterThan(-1)
    expect(queryAt).toBeGreaterThan(-1)
    expect(guardAt).toBeLessThan(queryAt)
  })
})

describe('[blocker] product-report-access — fail-closed และไม่ตั้งธงใหม่', () => {
  const svc = stripComments(readFileSync(ACCESS, 'utf8'))

  it('ใช้ธงเดิม staffCanViewFinance ไม่สร้างคอลัมน์สิทธิ์ของตัวเอง', () => {
    expect(svc).toContain('staffCanViewFinance')
  })

  it('เทียบธงด้วย === true เท่านั้น — `!== false` จะทำให้สวิตช์ของเจ้าของร้านเป็นของหลอก', () => {
    expect(svc).toMatch(/staffCanViewFinance\s*===\s*true/)
    expect(svc).not.toMatch(/staffCanViewFinance\s*!==\s*false/)
  })

  it('OWNER ผ่านโดยไม่ต้องดูธง (เจ้าของร้านปิดสิทธิ์ตัวเองไม่ได้)', () => {
    const ownerAt = svc.indexOf("active.role === 'OWNER'")
    const flagAt = svc.indexOf('staffCanViewFinance')
    expect(ownerAt).toBeGreaterThan(-1)
    expect(ownerAt).toBeLessThan(flagAt)
  })

  /**
   * 🛑 ต้องวัดใน **ตัวฟังก์ชัน** ไม่ใช่ทั้งไฟล์ — `kind: 'OK'` โผล่ในประกาศ type ที่หัวไฟล์ก่อน
   * เสมอ เทสที่วัดทั้งไฟล์จะเทียบตำแหน่งของ *ประกาศชนิด* กับ *ตรรกะ* ซึ่งไม่เกี่ยวกันเลย
   * (คลาสเดียวกับเทสที่ผูกกับตำแหน่งสตริงแล้วแดงตอนเรียง CASE ใหม่ — retro 2026-08-10)
   */
  const body = svc.slice(svc.indexOf('export async function resolveProductReportAccess'))

  it('ตรวจ vertical ก่อนคืน OK — ไม่งั้นร้านคนละประเภทหลุดเข้ามาได้', () => {
    const vAt = body.indexOf('PRODUCT_REPORT_VERTICAL')
    const okAt = body.indexOf("kind: 'OK'")
    expect(vAt).toBeGreaterThan(-1)
    expect(okAt).toBeGreaterThan(-1)
    expect(vAt).toBeLessThan(okAt)
  })
})

describe('[blocker] แถบรายวันต้องไม่ถูกเปลี่ยนกลับไปใช้ ApexChart', () => {
  const strip = readFileSync(
    join(
      ROOT,
      'src/app/(paces)/seller/(dashboard)/reports/products/components/DayStrip.tsx',
    ),
    'utf8',
  )

  it('DayStrip ไม่ import ApexChart — 20-50 กราฟบนหน้าเดียวทำให้เกิดการวาดใหม่ระดับ O(N²)', () => {
    expect(stripComments(strip)).not.toMatch(/from\s+['"]@\/components\/wrappers\/ApexChart['"]/)
  })

  it('และไม่ import ไลบรารีกราฟตรง ๆ (Hard Rule 10)', () => {
    expect(strip).not.toMatch(/from\s+['"](react-apexcharts|apexcharts|echarts|chart\.js|recharts)['"]/)
  })
})
