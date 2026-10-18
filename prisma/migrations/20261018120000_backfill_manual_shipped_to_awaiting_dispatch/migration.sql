-- feature 00080 ext (TD-012) — ใบส่งเองที่บันทึกเลขก่อน deploy 00080 ถูก flow เก่าตั้งเป็น SHIPPED ทันที
-- user สั่ง 2026-10-18 ให้ย้ายกลับเป็น "รอจัดส่ง" (PENDING) ทั้งหมด (กลับมติ "ปล่อยไว้") · prod วันนั้น 45 ใบ
-- เกณฑ์ = isManualShipment (src/lib/manual-shipment.ts) + ยังไม่เคยกด "จัดส่งแล้ว" (dispatchedAt NULL)
--   ⇒ ใบที่กดจัดส่งแล้วหลัง deploy (dispatchedAt มีค่า) ไม่โดน · รันซ้ำได้ (ไม่มีแถวเข้าเกณฑ์อีก)
-- live iShip = ACTIVE_FORWARD_SHIPMENT (CREATED + ไม่ใช่ใบจำลอง + FORWARD) — ไม่ใช่ LATEST (retro 00080 ข้อ 1)
-- ไม่บันทึก OrderEvent: ไม่ใช่การกระทำของร้าน · ledger แจ้งเลขพัสดุมี UNIQUE กันส่งซ้ำตอนร้านกดจัดส่งแล้ว
SET LOCAL lock_timeout = '5s';

UPDATE "Order" o
SET status = 'PENDING', "updatedAt" = now()
FROM "ShipmentTracking" t
WHERE t."orderId" = o.id
  AND t."dispatchedAt" IS NULL
  AND o.status = 'SHIPPED'
  AND o."fulfillmentMode" = 'SHIPPED'
  AND NOT EXISTS (
    SELECT 1 FROM "OrderShipment" s
    WHERE s."orderId" = o.id AND s.status = 'CREATED' AND s."isDryRun" = false AND s.direction = 'FORWARD'
  );
