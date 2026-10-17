/**
 * hasLiveIshipShipment — นิยามเดียวของ "ออเดอร์นี้มีพัสดุ iShip แล้ว" (CREATED && !isDryRun)
 *
 * ใบที่ยิงไม่ผ่าน (FAILED) และใบจำลองไม่นับ — ไม่งั้นร้านที่เปิดกับ iShip ไม่ได้
 * (เครดิตหมด/token เสีย) จะกรอกเลขพัสดุที่ส่งเองไม่ได้ทั้งที่ของส่งไปแล้ว
 * ใช้ทั้งหน้าคำสั่งซื้อและหน้าต่างพัสดุในแชท ห้ามเขียนเงื่อนไขนี้ซ้ำที่อื่น
 */
export function hasLiveIshipShipment(
  shipment: { status: string; isDryRun: boolean } | null | undefined,
): boolean {
  return shipment?.status === 'CREATED' && !shipment.isDryRun
}
