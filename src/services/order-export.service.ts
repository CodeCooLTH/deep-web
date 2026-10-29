/**
 * order-export.service.ts — ดึงออเดอร์ของร้านเป็นแถวสำหรับไฟล์ส่งออก (feature 00086)
 *
 * 🛑 `shopId` ต้องมาจาก session ของผู้เรียก (requireShopCapability) เท่านั้น — `tokens` จาก client
 * ถูกกรองด้วย shopId ซ้ำที่ where ⇒ token ของร้านอื่นที่ปนมาหลุดทิ้งเงียบ ๆ (BRD FR-EXP-12)
 */
import ExcelJS from 'exceljs'
import { prisma } from '@/lib/prisma'
import { ACTIVE_FORWARD_SHIPMENT } from '@/lib/shipment-direction'
import { RETURN_STATUS } from '@/lib/order-return'
import { getReturnAdjustments } from '@/services/return-adjustment.service'
import { asParcelClose } from '@/services/parcel-close-input'
import {
  EXPORT_MAX_ROWS,
  buildExportRow,
  exportColumns,
  type ExportColumn,
  type ExportOrder,
  type ExportRow,
} from '@/lib/order-export'

const num = (v: unknown): number | null => (v == null ? null : Number(v))

export type ExportResult =
  | { kind: 'ok'; columns: ExportColumn[]; rows: ExportRow[] }
  | { kind: 'empty' }
  | { kind: 'too_many'; count: number }

/** tokens = null → ทั้งร้าน · tokens = รายการ → เฉพาะใบเหล่านั้น เรียงตามลำดับที่ส่งมา (ลำดับบนจอ) */
export async function loadOrderExport(shopId: string, vertical: string, tokens: string[] | null): Promise<ExportResult> {
  const where = { shopId, ...(tokens ? { publicToken: { in: tokens } } : {}) }
  const count = await prisma.order.count({ where })
  if (count === 0) return { kind: 'empty' }
  if (count > EXPORT_MAX_ROWS) return { kind: 'too_many', count }

  const [orders, returnAdj] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, publicToken: true, orderNo: true, shortCode: true, createdAt: true, status: true, type: true,
        salesChannel: true, buyerName: true, buyerContact: true, discount: true, vatAmount: true, totalAmount: true,
        depositAmount: true, paymentMethod: true, codReceivedAt: true, paymentConfirmedAt: true,
        fulfillmentMode: true, shippingAddress: true, serviceStart: true, serviceEnd: true, serviceClosedAt: true,
        appointmentStatus: true, checkIn: true, checkOut: true,
        buyer: { select: { displayName: true } },
        items: { select: { name: true, qty: true, price: true, cost: true } },
        // พัสดุขาไปใบล่าสุดที่ active — ชุดเดียวกับหน้ารายการ/รายงานกำไร (ACTIVE_FORWARD_SHIPMENT)
        shipments: {
          where: ACTIVE_FORWARD_SHIPMENT,
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            courierName: true, trackingNo: true, carrierStatus: true, status: true, isDryRun: true, direction: true,
            problemAt: true, problemCloseOutcome: true, problemCloseExcludesRevenue: true, deliveredAt: true,
            codAmount: true, carrierPrice: true, estimatedPrice: true, codFee: true,
          },
        },
        shipmentTracking: { select: { provider: true, trackingNo: true, outboundShippingCost: true } },
        // ค่าส่งขากลับของใบคืนที่รับของแล้ว — select ชุดเดียวกับ pnl.service
        returns: {
          where: { status: RETURN_STATUS.RECEIVED },
          select: { countAsCost: true, shippingCost: true, shipment: { select: { carrierPrice: true, estimatedPrice: true } } },
        },
        serviceResource: { select: { name: true } },
        room: { select: { name: true } },
        payments: { select: { kind: true, amount: true, voidedAt: true } },
      },
    }),
    getReturnAdjustments(shopId),
  ])

  if (tokens) {
    const rank = new Map(tokens.map((t, i) => [t, i]))
    orders.sort((a, b) => (rank.get(a.publicToken) ?? 0) - (rank.get(b.publicToken) ?? 0))
  }

  const rows = orders.map((o) => {
    const sp = o.shipments[0]
    const input: ExportOrder = {
      id: o.id,
      orderNo: o.orderNo,
      shortCode: o.shortCode,
      createdAt: o.createdAt,
      status: o.status,
      type: o.type,
      salesChannel: o.salesChannel,
      buyerName: o.buyerName,
      buyerAccountName: o.buyer?.displayName ?? null,
      buyerContact: o.buyerContact,
      items: o.items.map((it) => ({ name: it.name, qty: it.qty, price: Number(it.price), cost: num(it.cost) })),
      discount: num(o.discount),
      vatAmount: num(o.vatAmount),
      totalAmount: Number(o.totalAmount),
      depositAmount: num(o.depositAmount),
      paymentMethod: o.paymentMethod,
      codReceivedAt: o.codReceivedAt,
      paymentConfirmedAt: o.paymentConfirmedAt,
      fulfillmentMode: o.fulfillmentMode,
      shippingAddress: o.shippingAddress,
      shipment: sp
        ? {
            courierName: sp.courierName, trackingNo: sp.trackingNo, carrierStatus: sp.carrierStatus, status: sp.status,
            isDryRun: sp.isDryRun, direction: sp.direction, problemAt: sp.problemAt,
            problemCloseOutcome: asParcelClose(sp.problemCloseOutcome),
            problemCloseExcludesRevenue: sp.problemCloseExcludesRevenue, deliveredAt: sp.deliveredAt,
            codAmount: Number(sp.codAmount), carrierPrice: num(sp.carrierPrice), estimatedPrice: num(sp.estimatedPrice),
            codFee: num(sp.codFee),
          }
        : null,
      manualTracking: o.shipmentTracking
        ? {
            provider: o.shipmentTracking.provider,
            trackingNo: o.shipmentTracking.trackingNo,
            outboundShippingCost: num(o.shipmentTracking.outboundShippingCost),
          }
        : null,
      returnShipping: o.returns.map((r) => ({
        countAsCost: r.countAsCost,
        shippingCost: num(r.shippingCost),
        carrierPrice: num(r.shipment?.carrierPrice),
        estimatedPrice: num(r.shipment?.estimatedPrice),
      })),
      serviceStart: o.serviceStart,
      serviceEnd: o.serviceEnd,
      serviceClosedAt: o.serviceClosedAt,
      appointmentStatus: o.appointmentStatus,
      serviceResourceName: o.serviceResource?.name ?? null,
      payments: o.payments.map((p) => ({ kind: p.kind as 'DEPOSIT' | 'BALANCE', amount: Number(p.amount), voidedAt: p.voidedAt })),
      checkIn: o.checkIn,
      checkOut: o.checkOut,
      roomName: o.room?.name ?? null,
    }
    return buildExportRow(input, vertical, returnAdj.get(o.id))
  })

  return { kind: 'ok', columns: exportColumns(vertical), rows }
}

/** แถว → ไฟล์ xlsx — ช่องข้อความเป็นเซลล์ข้อความ (ไม่ตัด 0 หน้าเบอร์ · ไม่ประมวลผลเป็นสูตร) ช่องเงินเป็นตัวเลข */
export async function toXlsx(columns: ExportColumn[], rows: ExportRow[], sheetName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.key === 'items' || c.key === 'address' ? 40 : Math.max(12, c.header.length + 4),
    style: c.kind === 'money' ? { numFmt: '#,##0.00' } : c.kind === 'text' ? { numFmt: '@' } : {},
  }))
  ws.getRow(1).font = { bold: true }
  for (const r of rows) {
    // ExcelJS เขียน string ที่ขึ้นต้นด้วย "=" เป็นเซลล์ข้อความ (สูตรต้องส่งเป็น { formula }) ⇒ ไม่ต้องเติม '
    ws.addRow(Object.fromEntries(columns.map((c) => [c.key, r[c.key] ?? null])))
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}
