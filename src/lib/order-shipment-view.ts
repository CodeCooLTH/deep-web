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
  }>
}

export type BuyerShipmentView = {
  shipmentTracking: { provider: string; trackingNo: string; courierCode: string | null } | null
  carrierStatus: string | null
  problemAt: string | null
  returnStartedAt: string | null
  returnedAt: string | null
  returnDispatchedAt: string | null
}

export function buildBuyerShipmentView(order: ShipmentViewInput): BuyerShipmentView {
  const shipment = order.shipments?.[0]
  return {
    shipmentTracking: order.shipmentTracking
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
    carrierStatus: shipment?.carrierStatus ?? null,
    problemAt: shipment?.problemAt?.toISOString() ?? null,
    returnStartedAt: shipment?.returnStartedAt?.toISOString() ?? null,
    returnedAt: shipment?.returnedAt?.toISOString() ?? null,
    returnDispatchedAt: shipment?.returnDispatchedAt?.toISOString() ?? null,
  }
}
