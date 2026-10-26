import type { ParcelCloseOutcome } from './parcel-close'

/**
 * ข้อมูลพัสดุที่ผู้ซื้อเห็น — allow-list ทีละฟิลด์ (feature 00068 TD-003)
 *
 * ยกตรรกะจาก `buildGuestOrderData` มาตรง ๆ: สิ่งที่ร้าน "แจ้งเอง" (`ShipmentTracking`) มาก่อนเสมอ
 * แล้วค่อย fallback เป็นพัสดุ iShip ที่เปิดไว้ — เขียนที่เดียวเพื่อไม่ให้สองจอหลุดจากกันอีก
 * (เคยหลุดจริง: `courierCode` ขาดบนจอล็อกอิน)
 *
 * 🛑 รับ order ทั้งก้อนได้แต่คืนเฉพาะ 6 คีย์ — ห้ามใส่ที่อยู่/เบอร์/ชื่อผู้ซื้อ ปลายทางเป็น client component
 */
export type ShipmentViewInput = {
  /** Order.status — ใช้ตัดสินซ่อนเลขส่งเองระหว่าง "รอจัดส่ง" (00080 S-12) */
  status: string
  /**
   * จังหวะแจ้งเลขของร้าน — 🛑 บังคับส่ง ไม่มีค่าตั้งต้น: ค่าที่ลืมส่งแล้วกลายเป็น "ไม่ซ่อน" = เลขหลุดถึง client
   * (docs/conventions/permission-gate-follows-the-row.md) · tsc ต้องฟ้องผู้เรียกใหม่ทุกราย
   */
  trackingNoticeTiming: 'ON_SAVE' | 'ON_DISPATCH'
  shipmentTracking: { provider: string; trackingNo: string } | null
  shipments?: Array<{
    trackingNo: string | null
    courierName: string | null
    courierCode: string | null
    carrierStatus: string | null
    problemAt: Date | null
    returnStartedAt: Date | null
    returnedAt: Date | null
    returnDispatchedAt: Date | null
    /** 00085 — ผู้ซื้อได้แค่ outcome (ห้าม note/ผู้ปิด/refunded/excludesRevenue) */
    problemCloseOutcome: ParcelCloseOutcome | null
  }>
}

export type BuyerShipmentView = {
  shipmentTracking: { provider: string; trackingNo: string; courierCode: string | null } | null
  carrierStatus: string | null
  problemAt: string | null
  returnStartedAt: string | null
  returnedAt: string | null
  returnDispatchedAt: string | null
  /** 00085 — ผลที่ร้านปิดพัสดุ (ผู้ซื้อเห็นแค่ผล ไม่เห็นเหตุผล/หมายเหตุ/เรื่องเงิน) */
  problemCloseOutcome: ParcelCloseOutcome | null
  /**
   * feature 00080 — ป้อน `deriveShippingStage` ฝั่งผู้ซื้อ (ไม่ใช่ตัวแสดงเลข)
   * `shipmentTracking` ข้างบนอาจเป็น null เพราะร้านตั้งซ่อนเลขจนกด "จัดส่งแล้ว" (S-12) จึงใช้ตัดสินขั้นไม่ได้
   * hasManualTracking = มีแถว ShipmentTracking จริง · hasIshipTracking = มีพัสดุ iShip ที่มีเลขแล้ว (ชนะส่งเองเสมอ)
   */
  hasManualTracking: boolean
  hasIshipTracking: boolean
}

/**
 * 00080 S-12 — ร้านตั้ง "แจ้งเลขตอนกดจัดส่งแล้ว" ⇒ ระหว่างรอจัดส่ง (PENDING + เลขส่งเอง ไม่มี iShip)
 * เลขต้องไม่ถึง client เลย (ตัดที่ server ไม่ใช่ซ่อนด้วย CSS) · timing ต้องถูกส่งมาเสมอ (ผู้อ่านจาก getTrackingNoticeTiming: ไม่มีแถว config = ON_SAVE)
 */
export function shouldHideManualTracking(order: {
  status: string
  trackingNoticeTiming: 'ON_SAVE' | 'ON_DISPATCH'
  shipmentTracking: unknown
  shipments?: unknown[]
}): boolean {
  return (
    order.trackingNoticeTiming === 'ON_DISPATCH' &&
    order.status === 'PENDING' &&
    !!order.shipmentTracking &&
    !(order.shipments?.length)
  )
}

export function buildBuyerShipmentView(order: ShipmentViewInput): BuyerShipmentView {
  const shipment = order.shipments?.[0]
  return {
    shipmentTracking: shouldHideManualTracking(order)
      ? null
      : order.shipmentTracking
      ? {
          provider: order.shipmentTracking.provider,
          trackingNo: order.shipmentTracking.trackingNo,
          // ร้านแจ้งเลขเอง = ไม่มีรหัสขนส่งตั้งแต่ต้นทาง — null คือความจริง ไม่ใช่ข้อมูลหาย
          courierCode: null,
        }
      : shipment?.trackingNo
        ? {
            provider: shipment.courierName ?? shipment.courierCode ?? 'ขนส่ง',
            trackingNo: shipment.trackingNo,
            courierCode: shipment.courierCode,
          }
        : null,
    hasManualTracking: !!order.shipmentTracking,
    hasIshipTracking: !!shipment?.trackingNo,
    carrierStatus: shipment?.carrierStatus ?? null,
    problemAt: shipment?.problemAt?.toISOString() ?? null,
    returnStartedAt: shipment?.returnStartedAt?.toISOString() ?? null,
    returnedAt: shipment?.returnedAt?.toISOString() ?? null,
    returnDispatchedAt: shipment?.returnDispatchedAt?.toISOString() ?? null,
    problemCloseOutcome: shipment?.problemCloseOutcome ?? null,
  }
}
