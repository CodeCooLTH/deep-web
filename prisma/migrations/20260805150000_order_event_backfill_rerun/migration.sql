-- ═══ Backfill รอบสอง (รันซ้ำชุดเดิมจาก 20260805000000 ทั้งก้อน — idempotent ทุก INSERT
-- ด้วย NOT EXISTS) ═══
--
-- ทำไมต้องรันซ้ำ: migration รอบแรก backfill แล้วจบ แต่โค้ดฝั่งเขียนสด (recordOrderEvent)
-- ยังไม่ถูก wire เข้า mutation ใด ๆ เลยจนถึง 2026-08-05 — ทุก action ที่เกิด "หลัง backfill
-- รอบแรก แต่ก่อน deploy รอบนี้" จึงหายจากประวัติทั้งหมด (บั๊กจริง: ผูกพัสดุ iShip ออเดอร์
-- 1d04ecde แล้ว SHIPMENT_LINKED ไม่ขึ้น) การรันชุดเดิมซ้ำเก็บช่องว่างนั้นให้พอดีตัว
-- โดยไม่แตะแถวที่มีอยู่แล้ว
--
-- ไม่ backfill: ORDER_EDITED / TRACKING_ADDED / SMS_LINK_SENT / BUYER_CONFIRMED
-- เพราะไม่มีคอลัมน์ต้นทางให้ derive เลย — เดาแล้วใส่ = สร้างประวัติเท็จ ซึ่งขัดจุดประสงค์ทั้งหมด

-- 2.1 สร้างคำสั่งซื้อ — createdAt เป็น NOT NULL เสมอ ทุกออเดอร์จึงได้ event นี้ครบ 100%
INSERT INTO "OrderEvent" ("id", "orderId", "type", "actorUserId", "meta", "occurredAt", "createdAt")
SELECT gen_random_uuid()::text, o."id", 'ORDER_CREATED', o."createdByUserId",
       CASE WHEN o."createdByUserId" IS NOT NULL
            THEN jsonb_build_object('actorNameSnapshot', COALESCE(u."displayName", u."username"), 'backfilled', true)
            ELSE jsonb_build_object('backfilled', true) END,
       o."createdAt", CURRENT_TIMESTAMP
FROM "Order" o
LEFT JOIN "User" u ON u."id" = o."createdByUserId"
WHERE NOT EXISTS (SELECT 1 FROM "OrderEvent" oe WHERE oe."orderId" = o."id" AND oe."type" = 'ORDER_CREATED');

-- 2.2 เปิดพัสดุ iShip — meta.shipmentId กันกรณี 1 ออเดอร์เปิดพัสดุหลายรอบ (retry หลังยกเลิก)
INSERT INTO "OrderEvent" ("id", "orderId", "type", "actorUserId", "meta", "occurredAt", "createdAt")
SELECT gen_random_uuid()::text, os."orderId", 'SHIPMENT_CREATED', os."createdByUserId",
       jsonb_strip_nulls(jsonb_build_object(
         'shipmentId', os."id", 'courierName', os."courierName", 'backfilled', true,
         'actorNameSnapshot', COALESCE(u."displayName", u."username"))),
       os."createdAt", CURRENT_TIMESTAMP
FROM "OrderShipment" os
LEFT JOIN "User" u ON u."id" = os."createdByUserId"
WHERE os."source" = 'CREATED' AND os."status" = 'CREATED'
  AND NOT EXISTS (SELECT 1 FROM "OrderEvent" oe
                  WHERE oe."orderId" = os."orderId" AND oe."type" = 'SHIPMENT_CREATED'
                    AND (oe."meta"->>'shipmentId') = os."id");

-- 2.3 ยกเลิกพัสดุ
INSERT INTO "OrderEvent" ("id", "orderId", "type", "actorUserId", "meta", "occurredAt", "createdAt")
SELECT gen_random_uuid()::text, os."orderId", 'SHIPMENT_CANCELLED', os."cancelledByUserId",
       jsonb_strip_nulls(jsonb_build_object(
         'shipmentId', os."id", 'courierName', os."courierName", 'backfilled', true,
         'actorNameSnapshot', COALESCE(u."displayName", u."username"))),
       os."cancelledAt", CURRENT_TIMESTAMP
FROM "OrderShipment" os
LEFT JOIN "User" u ON u."id" = os."cancelledByUserId"
WHERE os."status" = 'CANCELLED' AND os."cancelledAt" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "OrderEvent" oe
                  WHERE oe."orderId" = os."orderId" AND oe."type" = 'SHIPMENT_CANCELLED'
                    AND (oe."meta"->>'shipmentId') = os."id");

-- 2.4 ผูกพัสดุที่มีอยู่แล้ว
INSERT INTO "OrderEvent" ("id", "orderId", "type", "actorUserId", "meta", "occurredAt", "createdAt")
SELECT gen_random_uuid()::text, os."orderId", 'SHIPMENT_LINKED', os."createdByUserId",
       jsonb_strip_nulls(jsonb_build_object(
         'shipmentId', os."id", 'courierName', os."courierName", 'backfilled', true,
         'actorNameSnapshot', COALESCE(u."displayName", u."username"))),
       os."linkedAt", CURRENT_TIMESTAMP
FROM "OrderShipment" os
LEFT JOIN "User" u ON u."id" = os."createdByUserId"
WHERE os."source" = 'LINKED' AND os."linkedAt" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "OrderEvent" oe
                  WHERE oe."orderId" = os."orderId" AND oe."type" = 'SHIPMENT_LINKED'
                    AND (oe."meta"->>'shipmentId') = os."id");

-- 2.5 ยกเลิกคำสั่งซื้อ — actorUserId เป็น NULL เสมอโดยตั้งใจ: ย้อนหลังรู้แค่บทบาท (cancelInitiator)
-- ไม่รู้ว่าใครกด ห้ามเดาใส่ · เวลาใช้ updatedAt ซึ่งเป็นค่าที่ใกล้เคียงที่สุดที่มี
INSERT INTO "OrderEvent" ("id", "orderId", "type", "actorUserId", "meta", "occurredAt", "createdAt")
SELECT gen_random_uuid()::text, o."id", 'ORDER_CANCELLED', NULL,
       jsonb_strip_nulls(jsonb_build_object('initiatorRole', o."cancelInitiator", 'backfilled', true)),
       o."updatedAt", CURRENT_TIMESTAMP
FROM "Order" o
WHERE o."status" = 'CANCELLED'
  AND NOT EXISTS (SELECT 1 FROM "OrderEvent" oe WHERE oe."orderId" = o."id" AND oe."type" = 'ORDER_CANCELLED');
