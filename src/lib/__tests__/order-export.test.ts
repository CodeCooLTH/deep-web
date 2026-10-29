import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { buildExportRow, exportColumns, exportFilename, guardFormula, toCsv, type ExportOrder } from '../order-export'
import { toXlsx } from '@/services/order-export.service'
import { parseCsv } from '../csv'

const base = (over: Partial<ExportOrder> = {}): ExportOrder => ({
  id: 'o1', orderNo: 'DP256910ABCD', shortCode: 'ABCD1234', createdAt: new Date('2026-10-01T02:00:00Z'),
  status: 'CONFIRMED', type: 'PHYSICAL', salesChannel: 'Facebook', buyerName: 'สมชาย', buyerAccountName: null,
  buyerContact: '0812345678', items: [{ name: 'โช้ค', qty: 1, price: 290, cost: 180 }, { name: 'น็อต', qty: 4, price: 15, cost: 5 }],
  discount: null, vatAmount: null, totalAmount: 350, depositAmount: null, paymentMethod: 'COD',
  codReceivedAt: new Date('2026-10-06T03:00:00Z'), paymentConfirmedAt: null, fulfillmentMode: 'SHIPPED',
  shippingAddress: { line1: '12/3', subdistrict: 'ในเมือง', district: 'เมือง', province: 'ขอนแก่น', postcode: '40000' },
  shipment: {
    courierName: 'Flash', trackingNo: 'TH01', carrierStatus: 'delivered', status: 'CREATED', isDryRun: false,
    direction: 'FORWARD', problemAt: null, problemCloseOutcome: null, problemCloseExcludesRevenue: null,
    deliveredAt: new Date('2026-10-03T07:00:00Z'), codAmount: 350, carrierPrice: 45, estimatedPrice: 40, codFee: 10.5,
  },
  manualTracking: null, returnShipping: [], serviceStart: null, serviceEnd: null, serviceClosedAt: null,
  appointmentStatus: null, serviceResourceName: null, payments: [], checkIn: null, checkOut: null, roomName: null,
  ...over,
})

describe('order-export: เงิน (HR16 — สูตรเดิมของระบบ)', () => {
  it('กำไรขั้นต้น = computeOrderProfit · กำไรหลังหักค่าส่ง = − (ค่าส่งจริง + ค่าธรรมเนียม COD)', () => {
    const r = buildExportRow(base(), 'ONLINE_SALES', undefined)
    expect(r.cogs).toBe(200)
    expect(r.grossProfit).toBe(150)
    expect(r.shippingTotal).toBe(55.5)
    expect(r.profitAfterShipping).toBe(94.5)
    expect(r.shippingSource).toBe('ราคาจริงจากขนส่ง')
  })

  it('ราคาประมาณติดป้าย · ส่งเองใช้ค่าที่ร้านกรอก · ส่งเองที่ยังไม่กรอกติดป้าย', () => {
    const est = buildExportRow(base({ shipment: { ...base().shipment!, carrierPrice: null } }), 'ONLINE_SALES', undefined)
    expect(est.shippingSource).toBe('ราคาประมาณ (ขนส่งยังไม่ชั่ง)')
    const manual = buildExportRow(
      base({ shipment: null, manualTracking: { provider: 'ไปรษณีย์', trackingNo: 'EF1', outboundShippingCost: 60 } }),
      'ONLINE_SALES', undefined,
    )
    expect(manual.shippingTotal).toBe(60)
    expect(manual.shippingSource).toBe('ร้านกรอกเอง')
    expect(manual.courier).toBe('ไปรษณีย์')
    const missing = buildExportRow(
      base({ status: 'SHIPPED', shipment: null, manualTracking: { provider: 'X', trackingNo: 'Y', outboundShippingCost: null } }),
      'ONLINE_SALES', undefined,
    )
    expect(missing.shippingSource).toBe('ยังไม่กรอกค่าส่ง')
  })

  it('ใบที่ไม่นับเป็นยอดขาย (ยกเลิก/รอดำเนินการ) ไม่มีต้นทุนและกำไร — ตามการ์ดกำไรหน้ารายละเอียด', () => {
    for (const status of ['CANCELLED', 'PENDING', 'DRAFTED']) {
      const r = buildExportRow(base({ status, shipment: null }), 'ONLINE_SALES', undefined)
      expect(r.grossProfit).toBeNull()
      expect(r.profitAfterShipping).toBeNull()
      expect(r.cogs).toBeNull()
    }
  })

  it('ใบที่ร้านปิดพัสดุแบบไม่นับยอดขาย (00085): กำไรหลังหักค่าส่ง = −ค่าส่ง ตาม /sales · ไม่มีค่าธรรมเนียม COD', () => {
    const r = buildExportRow(
      base({ status: 'SHIPPED', shipment: { ...base().shipment!, problemCloseExcludesRevenue: true } }),
      'ONLINE_SALES', undefined,
    )
    expect(r.grossProfit).toBeNull()
    expect(r.shippingTotal).toBe(45)
    expect(r.profitAfterShipping).toBe(-45)
  })

  it('ต้นทุนไม่ครบ → ธง "ใช่" และไม่นับรายการนั้นเป็น 0', () => {
    const r = buildExportRow(base({ items: [{ name: 'a', qty: 2, price: 100, cost: null }, { name: 'b', qty: 1, price: 50, cost: 20 }], totalAmount: 250 }), 'ONLINE_SALES', undefined)
    expect(r.missingCost).toBe('ใช่')
    expect(r.cogs).toBe(20)
  })

  it('คืนบางส่วนหักในกำไรเฉพาะร้านบริการ (finance-rules) — ร้านขายของแค่แสดงยอดคืน', () => {
    const adj = { refund: 100, returnedCost: 40, returnedQtyByItem: {} }
    const online = buildExportRow(base(), 'ONLINE_SALES', adj)
    expect(online.refund).toBe(100)
    expect(online.grossProfit).toBe(150)
    const svc = buildExportRow(
      base({ status: 'CONFIRMED', serviceClosedAt: new Date(), shipment: null, shippingAddress: null }),
      'SERVICE_QUEUE', adj,
    )
    expect(svc.grossProfit).toBe(150 - 100 + 40)
  })
})

describe('order-export: คอลัมน์ตามประเภทร้าน (BR-EXP-10)', () => {
  const keys = (v: string) => exportColumns(v).map((c) => c.key)
  it('ร้านขายของมีที่อยู่/พัสดุ/ค่าส่ง · ร้านบริการและที่พักไม่มี', () => {
    expect(keys('ONLINE_SALES')).toEqual(expect.arrayContaining(['address', 'trackingNo', 'shippingTotal', 'profitAfterShipping']))
    for (const v of ['SERVICE_QUEUE', 'LODGING']) {
      expect(keys(v)).not.toEqual(expect.arrayContaining(['address']))
      expect(keys(v)).not.toContain('trackingNo')
      expect(keys(v)).not.toContain('shippingTotal')
    }
    expect(keys('SERVICE_QUEUE')).toEqual(expect.arrayContaining(['serviceStart', 'resource', 'outstanding']))
    expect(keys('LODGING')).toEqual(expect.arrayContaining(['checkIn', 'room']))
  })
  it('ร้านบริการ: ที่อยู่ตกค้างในออเดอร์เก่าไม่หลุดเข้าแถว', () => {
    const r = buildExportRow(base({ serviceClosedAt: new Date() }), 'SERVICE_QUEUE', undefined)
    expect(r.address).toBeNull()
  })
})

describe('order-export: ไฟล์', () => {
  it('กันสูตร: ค่าที่ขึ้นต้นด้วย = + - @ ได้ \' นำหน้าใน CSV', () => {
    for (const s of ['=1+1', '+1', '-1', '@SUM(A1)']) expect(guardFormula(s)).toBe(`'${s}`)
    expect(guardFormula('สมชาย')).toBe('สมชาย')
    const csv = toCsv(exportColumns('ONLINE_SALES'), [buildExportRow(base({ buyerName: '=HYPERLINK("x")' }), 'ONLINE_SALES', undefined)])
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })
  it('ช่องเงินติดลบไม่ถูกกันสูตร (ยังเป็นตัวเลข)', () => {
    const r = buildExportRow(base({ totalAmount: 100, items: [{ name: 'a', qty: 1, price: 100, cost: 300 }] }), 'ONLINE_SALES', undefined)
    const csv = toCsv(exportColumns('ONLINE_SALES'), [r])
    expect(csv).toContain(',-200.00,')
  })
  it('CSV มี BOM · อ่านกลับได้จำนวนคอลัมน์เท่าหัว แม้ชื่อสินค้ามี , " ขึ้นบรรทัด', () => {
    const cols = exportColumns('ONLINE_SALES')
    const csv = toCsv(cols, [buildExportRow(base({ items: [{ name: 'a, "b"\nc', qty: 1, price: 1, cost: 1 }] }), 'ONLINE_SALES', undefined)])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const rows = parseCsv(csv.slice(1))
    expect(rows).toHaveLength(2)
    expect(rows[1]).toHaveLength(cols.length)
  })
  it('xlsx: ข้อความที่ขึ้นต้นด้วย = เป็นเซลล์ข้อความ ไม่ใช่สูตร · เบอร์ไม่ถูกตัด 0 · เงินเป็นตัวเลข', async () => {
    const cols = exportColumns('ONLINE_SALES')
    const buf = await toXlsx(cols, [buildExportRow(base({ buyerName: '=1+1' }), 'ONLINE_SALES', undefined)], 'ออเดอร์')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('ออเดอร์')!
    const col = (k: string) => cols.findIndex((c) => c.key === k) + 1
    expect(ws.getRow(2).getCell(col('buyerName')).value).toBe('=1+1')
    expect(ws.getRow(2).getCell(col('buyerName')).type).toBe(ExcelJS.ValueType.String)
    expect(ws.getRow(2).getCell(col('buyerPhone')).value).toBe('0812345678')
    expect(ws.getRow(2).getCell(col('total')).value).toBe(350)
  })
  it('ชื่อไฟล์: ปี พ.ศ. ติดกัน · ล้างอักขระพิเศษ · โหมดตามตัวกรองมีคำบอก', () => {
    const now = new Date('2026-10-29T05:00:00Z')
    expect(exportFilename('my-shop', 'all', 'xlsx', now)).toBe('deep-orders-my-shop-25691029.xlsx')
    expect(exportFilename('a/b"c', 'filtered', 'csv', now)).toBe('deep-orders-abc-filtered-25691029.csv')
  })
})
