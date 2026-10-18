/**
 * manual-shipment — ตัวตัดสินขั้นของ "ส่งเอง" ตัวเดียว (feature 00080, SDS TD-001)
 *
 * "รอจัดส่ง" ไม่ใช่ค่าใน Order.status — คำนวณจาก PENDING + มีแถว ShipmentTracking + ไม่มีพัสดุ iShip live
 * (วันนี้ไม่มี flow iShip ไหนทิ้ง PENDING + แถว tracking ไว้: advanceOrderIfDispatched upsert+SHIPPED ใน tx เดียว ·
 * unlinkShipment ลบแถว+ถอย PENDING) ⇒ ใบเก่าไม่ตกเข้าขั้นนี้เอง
 *
 * 🛑 ใบที่มีพัสดุ iShip live = ไม่ใช่ส่งเอง เสมอ (iShip ชนะ — PRD §6.2) ถึงจะมีแถว tracking ก็ตาม
 * pure module — ห้าม import prisma (ใช้ทั้ง service, route, หน้าจอ)
 */

export type ManualShipmentFacts = {
  /** Order.status */
  status: string
  /** Order.fulfillmentMode — ส่งเองมีได้เฉพาะ SHIPPED */
  fulfillmentMode: string
  /** มีแถว ShipmentTracking ของออเดอร์นี้ */
  hasManualTracking: boolean
  /** มีพัสดุ iShip ที่ยัง live (LATEST_FORWARD_SHIPMENT / hasLiveIshipShipment) */
  hasLiveIshipShipment: boolean
}

export function isManualShipment(f: ManualShipmentFacts): boolean {
  return f.fulfillmentMode === 'SHIPPED' && f.hasManualTracking && !f.hasLiveIshipShipment
}

/** ขั้น "รอจัดส่ง" — มีเลขส่งเองแล้ว ของยังไม่ออกจากร้าน */
export function isAwaitingDispatch(f: ManualShipmentFacts): boolean {
  return isManualShipment(f) && f.status === 'PENDING'
}

/** ปุ่ม "จัดส่งแล้ว" (รอจัดส่ง → กำลังจัดส่ง) */
export function canMarkDispatched(f: ManualShipmentFacts): boolean {
  return isAwaitingDispatch(f)
}

/** ปุ่ม "ส่งสำเร็จ" (กำลังจัดส่ง → สำเร็จ) — รวมใบเก่าที่ SHIPPED อยู่ก่อนเปิดฟีเจอร์ */
export function canMarkDelivered(f: ManualShipmentFacts): boolean {
  return isManualShipment(f) && f.status === 'SHIPPED'
}
