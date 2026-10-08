import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toCatalogProduct } from '@/app/(paces)/seller/(dashboard)/orders/new/components/to-catalog'

/**
 * [blocker] ต้นทุนรายบรรทัดในฟอร์มคำสั่งซื้อ — ฟอร์มในแชท + การแก้ไขคำสั่งซื้อ (ร้านแจ้ง 2026-10-08)
 *
 * บั๊ก 1: ฟอร์มสร้างคำสั่งซื้อในแชทใช้ mapper ของตัวเองที่ไม่มี `cost` ⇒ ทุกสินค้าขึ้น
 *         "ยังไม่ตั้งต้นทุน" ทั้งที่ร้านตั้งทุนไว้แล้ว (ร้าน tanapathardware ตั้งครบ 39/39)
 * บั๊ก 2: GET /api/orders/[token] (โหลดเข้าฟอร์มแก้ไข) ไม่ส่ง `cost` ⇒ ฟอร์มส่งทุนว่างตอนบันทึก
 *         ⇒ ทุนเดิมของใบถูกแทนด้วยทุนล่าสุดของสินค้า และรายการพิมพ์เองที่ใส่ทุนไว้ ทุนหายเป็น null
 */
const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), 'utf8'))

describe('[blocker] toCatalogProduct — ต้นทุนติดไปกับสินค้าเสมอ', () => {
  it('ต้นทุนแบบ Decimal ของ Prisma → number · ไม่มีต้นทุน = null (ไม่ใช่ 0)', () => {
    const base = { id: 'p1', name: 'โช๊คหลัง 110 สีดำ', price: '360', type: 'PHYSICAL', fulfillmentMode: 'SHIPPED', images: [] }
    expect(toCatalogProduct({ ...base, cost: { toString: () => '153' } as unknown }).cost).toBe(153)
    expect(toCatalogProduct({ ...base, cost: '153.5' }).cost).toBe(153.5)
    expect(toCatalogProduct({ ...base, cost: 0 }).cost).toBe(0)
    expect(toCatalogProduct({ ...base, cost: null }).cost).toBeNull()
  })
})

describe('[blocker] ทุกทางที่ส่งแคตตาล็อกเข้าฟอร์ม ใช้ mapper ตัวเดียว', () => {
  it('แชท (layout + shop-context) ใช้ toCatalogProduct — ห้ามมี mapper แยกที่ตัดฟิลด์', () => {
    for (const f of ['src/app/(paces)/seller/(chat)/layout.tsx', 'src/app/api/chat/shop-context/route.ts']) {
      const src = read(f)
      expect(src, f).toMatch(/const toCatalog = \(p: unknown\)(?:: CatalogProduct)? => toCatalogProduct\(p\)/)
      // mapper แยกแบบเดิมประกอบ object เอง (`stockQty: p.stockQty`) — ห้ามกลับมา
      expect(src, f).not.toMatch(/stockQty: p\.stockQty/)
    }
  })

  it('หน้าเต็ม (/orders/new) ใช้ toCatalogProduct ตัวเดียวกัน', () => {
    const src = read('src/app/(paces)/seller/(fullscreen)/orders/new/page.tsx')
    expect(src).toMatch(/products\.map\(toCatalogProduct\)/)
    expect(src).toMatch(/\.map\(toCatalogProduct\)/)
  })
})

describe('[blocker] แก้ไขคำสั่งซื้อ — ต้นทุนเดิมเดินทางไปกลับครบ', () => {
  it('GET /api/orders/[token] ดึงและส่ง cost ของแต่ละบรรทัด', () => {
    const src = read('src/app/api/orders/[token]/route.ts')
    expect(src).toMatch(/items: \{ select: \{[^}]*\bcost: true[^}]*\} \}/)
    expect(src).toMatch(/cost: it\.cost != null \? Number\(it\.cost\) : null,/)
  })

  it('ฟอร์มรับ cost จากคำสั่งซื้อเดิม แล้วส่งกลับตอนบันทึก (ส่งเฉพาะที่มีค่า)', () => {
    const form = read('src/app/(paces)/seller/(dashboard)/orders/new/components/OrderCreateForm.tsx')
    expect(form).toMatch(/cost: it\.cost \?\? null,/)
    expect(form).toMatch(/\.\.\.\(item\.cost != null \? \{ cost: item\.cost \} : \{\}\)/)
  })

  it('บันทึก: ทุนที่ฟอร์มส่งมา (ทุนเดิมของใบ) ชนะทุนปัจจุบันของสินค้า', () => {
    const svc = read('src/services/order.service.ts')
    // ทุกจุดที่เขียน OrderItem (สร้าง · ยืนยันร่าง · แก้ไข) ใช้กติกาเดียวกัน
    expect(svc.match(/cost: typedCost \?\? \(item\.productId \? \(costMap\.get\(item\.productId\) \?\? null\) : null\)/g)?.length).toBe(3)
  })
})
