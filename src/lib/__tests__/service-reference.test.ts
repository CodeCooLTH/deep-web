import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as v from 'valibot'
import {
  acceptsServiceReference,
  normalizeServiceReference,
  compactForReferenceSearch,
  referenceMatchesQuery,
  orderSearchPlaceholder,
  omitServiceReference,
  SERVICE_REFERENCE_PLACEHOLDER,
} from '@/lib/service-reference'
import { searchOrders, isExactIdentifierMatch, type SearchableOrder } from '@/lib/order-search'
import { CreateOrderSchema } from '@/lib/validations'

/**
 * [blocker] ช่อง "ข้อมูลอ้างอิง" ของงานร้านบริการ (2026-10-04)
 *
 * ที่มา: ร้าน BT Premium พิมพ์ทะเบียนรถรวมไว้ในช่องชื่อลูกค้า ("4กฐ9100 คุณบุญคอง") เพราะไม่มีที่กรอก
 * กติกา: ร้านบริการเท่านั้น · ไม่บังคับ · ค้นหาได้ (ไม่สนช่องว่าง/ขีด) · ฝั่งร้านเท่านั้น ห้ามถึงผู้ซื้อ
 */
const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), 'utf8'))
const D = 'src/app/(paces)/seller/(dashboard)/orders/'

const order = (over: Partial<SearchableOrder>): SearchableOrder => ({
  id: 'abcd1234',
  publicToken: 'abcd1234efgh',
  shortCode: null,
  createdAtISO: '2026-10-04T05:00:00.000Z',
  buyerName: 'คุณบุญคอง',
  buyerUsername: null,
  buyerPhone: '0843287493',
  shipment: null,
  items: [{ name: 'ติดตั้งไฟหน้า' }],
  ...over,
})

describe('[blocker] ข้อมูลอ้างอิง — ตัวตัดสินและการเก็บค่า', () => {
  it('มีเฉพาะร้านบริการ · ค่าแปลก/ว่าง = ไม่มี', () => {
    expect(acceptsServiceReference('SERVICE_QUEUE')).toBe(true)
    for (const x of ['ONLINE_SALES', 'LODGING', 'GENERAL', '', null, undefined]) {
      expect(acceptsServiceReference(x), String(x)).toBe(false)
    }
  })

  it('ตัดช่องว่างหัวท้าย/ยุบช่องว่างซ้อน · ว่าง = null · ยาวเกิน 100 ถูกตัด', () => {
    expect(normalizeServiceReference('  4กฐ   9100 ')).toBe('4กฐ 9100')
    expect(normalizeServiceReference('   ')).toBeNull()
    expect(normalizeServiceReference(undefined)).toBeNull()
    expect(normalizeServiceReference('ก'.repeat(150))?.length).toBe(100)
  })

  it('สคีมา API รับ ≤100 ตัวอักษร ปฏิเสธ 101 · ไม่ส่งก็ได้', () => {
    const base = { items: [{ name: 'x', qty: 1, price: 0 }], type: 'SERVICE', buyerContact: '0843287493' }
    expect(v.safeParse(CreateOrderSchema, base).success).toBe(true)
    expect(v.safeParse(CreateOrderSchema, { ...base, serviceReference: 'ก'.repeat(100) }).success).toBe(true)
    expect(v.safeParse(CreateOrderSchema, { ...base, serviceReference: 'ก'.repeat(101) }).success).toBe(false)
  })
})

describe('[blocker] ข้อมูลอ้างอิง — ค้นหาได้ ไม่สนช่องว่าง/ขีด', () => {
  it('รูปเทียบตัดช่องว่าง/ขีด/จุด/ทับ และไม่สนตัวพิมพ์', () => {
    expect(compactForReferenceSearch('4กฐ - 9100')).toBe('4กฐ9100')
    expect(compactForReferenceSearch('AB.12/3')).toBe('ab123')
  })

  it('บันทึกแบบมีเว้นวรรค ค้นแบบติดกันก็เจอ (และกลับกัน)', () => {
    expect(referenceMatchesQuery('4กฐ 9100', '4กฐ9100')).toBe(true)
    expect(referenceMatchesQuery('4กฐ9100', '4กฐ 9100')).toBe(true)
    expect(referenceMatchesQuery('4กฐ-9100', '4กฐ9100')).toBe(true)
    expect(referenceMatchesQuery(null, '4กฐ9100')).toBe(false)
    expect(referenceMatchesQuery('4กฐ 9100', '5กฐ9100')).toBe(false)
  })

  it('searchOrders: เจอด้วยทะเบียนทุกรูปแบบ · ใบที่ไม่มีข้อมูลอ้างอิงไม่ถูกดึงมา', () => {
    const withRef = order({ id: 'ref00001', serviceReference: '4กฐ 9100' })
    const noRef = order({ id: 'none0001', buyerName: 'คุณทิพวรรณ', buyerPhone: '0971715631' })
    for (const q of ['4กฐ9100', '4กฐ 9100', '4กฐ-9100', '9100']) {
      expect(searchOrders([noRef, withRef], q).map((h) => h.order.id), q).toEqual(['ref00001'])
    }
  })

  it('ค้นหลายคำผสมกันได้ — ชื่อลูกค้า + ท่อนทะเบียน (ข้อมูลอ้างอิงต้องอยู่ในชุดฟิลด์ที่ค้นทีละคำด้วย)', () => {
    // 🛑 input นี้มีไว้จับ mutation "ถอดข้อมูลอ้างอิงออกจาก textFieldsOf" — กฎเทียบทั้งคำค้นอย่างเดียวไม่ครอบเคสนี้
    const withRef = order({ id: 'ref00001', serviceReference: '4กฐ 9100' })
    expect(searchOrders([withRef], 'บุญคอง 9100').map((h) => h.order.id)).toEqual(['ref00001'])
  })

  it('ตรงเต็มค่า (ไม่สนช่องว่าง) = ลอยขึ้นบนสุด', () => {
    expect(isExactIdentifierMatch(order({ serviceReference: '4กฐ 9100' }), '4กฐ9100')).toBe(true)
    expect(isExactIdentifierMatch(order({ serviceReference: '4กฐ 9100' }), '9100')).toBe(false)
  })

  it('ข้อความในช่องค้นหา: ร้านบริการบอกว่าค้นข้อมูลอ้างอิงได้ · ร้านอื่นได้ข้อความเดิมทุกตัวอักษร', () => {
    const old = 'ค้นหาเลขคำสั่งซื้อ / ชื่อลูกค้า / เบอร์ / เลขพัสดุ / สินค้า'
    expect(orderSearchPlaceholder('คำสั่งซื้อ', 'ONLINE_SALES')).toBe(old)
    expect(orderSearchPlaceholder('คำสั่งซื้อ', 'LODGING')).toBe(old)
    expect(orderSearchPlaceholder('งาน', 'SERVICE_QUEUE')).toBe(
      'ค้นหาเลขงาน / ชื่อลูกค้า / เบอร์ / เลขพัสดุ / สินค้า / ข้อมูลอ้างอิง',
    )
  })

  it('ข้อความในช่องตอนยังไม่กรอก = แบบ A3-2 ที่ user เลือก', () => {
    expect(SERVICE_REFERENCE_PLACEHOLDER).toBe('ค้นหางานด้วยคำนี้ได้ เช่น ทะเบียนรถ รุ่นมือถือ ฯลฯ')
  })
})

describe('[blocker] ข้อมูลอ้างอิง — ร้านบริการเท่านั้น ทุกทางเข้า', () => {
  it('service: ทุกจุดที่เขียน Order ผ่านตัวตัดสิน (สร้าง · ยืนยันร่าง · แก้ไข) — ร้านอื่นไม่ถูกเก็บ', () => {
    const svc = read('src/services/order.service.ts')
    expect(svc.match(/serviceReference: acceptsServiceReference\(shopRow\?\.vertical\)/g)?.length).toBe(2)
    expect(svc).toMatch(/serviceReference: acceptsServiceReference\(shopRowForShipping\?\.vertical\)/)
    // ห้ามมีที่ไหนเขียนค่าดิบจาก client ตรง ๆ
    expect(svc).not.toMatch(/serviceReference: data\.serviceReference/)
    // แก้เฉพาะช่องนี้ก็ต้องนับเป็นการแก้ไข (ไทม์ไลน์ ORDER_EDITED)
    expect(svc).toMatch(/strEq\(\s*existing\.serviceReference,/)
  })

  it('ฟอร์ม: แสดงช่องเฉพาะร้านบริการ ทั้งมือถือและเดสก์ท็อป', () => {
    const form = read(D + 'new/components/OrderCreateForm.tsx')
    expect(form).toMatch(/const showServiceReference = acceptsServiceReference\(shopVertical\)/)
    expect(read(D + 'new/components/CustomerQuickBlock.tsx')).toMatch(/\{showServiceReference && \(\s*<ServiceReferenceField/)
    expect(read(D + 'new/components/CustomerSelectBlock.tsx')).toMatch(/\{showServiceReference && \(\s*<ServiceReferenceField/)
    expect(read(D + 'new/components/QuickForm.tsx')).toMatch(/showServiceReference=\{showServiceReference\}/)
    expect(read(D + 'new/components/CartPanel.tsx')).toMatch(/showServiceReference=\{showServiceReference\}/)
    // ไม่บังคับ: ไม่มีดาวแดง
    expect(read(D + 'new/components/ServiceReferenceField.tsx')).not.toMatch(/text-danger">\*/)
  })

  it('หน้าแก้ไขโหลดค่าเดิม (ไม่งั้นกดบันทึกแล้วค่าเดิมถูกล้างเงียบ ๆ)', () => {
    const route = read('src/app/api/orders/[token]/route.ts')
    expect(route).toMatch(/serviceReference: true,/)
    expect(route).toMatch(/serviceReference: order\.serviceReference,/)
    expect(read(D + 'new/components/OrderCreateForm.tsx')).toMatch(/serviceReference: o\.serviceReference \?\? ''/)
  })

  it('หน้ารายการ/รายละเอียด: ส่งค่าเฉพาะร้านบริการ', () => {
    expect(read(D + 'page.tsx')).toMatch(/serviceReference: isServiceQueue \? \(o\.serviceReference \?\? null\) : null/)
    expect(read(D + '[token]/page.tsx')).toMatch(
      /serviceReference: acceptsServiceReference\(shop\.vertical\) \? \(order\.serviceReference \?\? null\) : null/,
    )
  })
})

describe('[blocker] ข้อมูลอ้างอิง — ห้ามถึงผู้ซื้อ', () => {
  it('omitServiceReference ตัดเฉพาะคีย์นี้ ที่เหลือคงเดิม', () => {
    const out = omitServiceReference({ id: 'x', status: 'CONFIRMED', serviceReference: '4กฐ 9100' })
    expect(out).toEqual({ id: 'x', status: 'CONFIRMED' })
    expect(omitServiceReference({ id: 'y' })).toEqual({ id: 'y' })
  })

  it('endpoint ที่ผู้ซื้อเรียกได้และคืน Order ทั้งแถว ต้องตัดก่อนส่ง', () => {
    expect(read('src/app/api/orders/route.ts')).toMatch(/NextResponse\.json\(orders\.map\(omitServiceReference\)\)/)
    expect(read('src/app/api/orders/[token]/confirm/route.ts')).toMatch(/NextResponse\.json\(omitServiceReference\(order\)\)/)
    expect(read('src/app/api/orders/[token]/cancel/route.ts')).toMatch(/NextResponse\.json\(omitServiceReference\(updated\)\)/)
  })

  it('หน้าออเดอร์ของผู้ซื้อ /o/[token] ไม่อ่านช่องนี้เลย', () => {
    for (const f of [
      'src/app/(marketing)/o/[token]/page.tsx',
      'src/app/(marketing)/o/[token]/guest-order-data.ts',
    ]) {
      expect(read(f), f).not.toMatch(/serviceReference/)
    }
  })
})
