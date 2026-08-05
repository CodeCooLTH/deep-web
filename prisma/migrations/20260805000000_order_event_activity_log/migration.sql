-- feature 00031 — Order Activity Log (ประวัติกิจกรรมคำสั่งซื้อ) | 2026-08-05
-- เขียนมือ (ฐาน dev/prod แยกกันแล้วแต่ยังห้าม migrate dev/db pull — ดู Hard Rule 14)
--
-- SAFETY: additive ล้วน — สร้างตารางใหม่ 1 ตัวเท่านั้น ไม่ ALTER/DROP อะไรที่มีอยู่แม้แต่คอลัมน์เดียว
-- ปลอดภัย 100% กับข้อมูลเดิม (push main = migrate deploy บน prod ทันที ตาม Hard Rule 15)
--
-- ไฟล์นี้มี 2 ส่วนในทรานแซกชันเดียว (Prisma wrap ให้เอง):
--   1) DDL — ตาราง + index + FK + CHECK
--   2) DML — backfill ประวัติย้อนหลังจากคอลัมน์ที่มีอยู่แล้ว
-- backfill พัง = DDL rollback ตามไปด้วย ไม่มีสถานะครึ่ง ๆ กลาง ๆ
-- ทุก INSERT มี WHERE NOT EXISTS — รันซ้ำด้วยมือ (กู้ระบบ) ไม่เกิดแถวซ้ำ

-- ═══ 1) DDL ═══
CREATE TABLE "OrderEvent" (
    "id"          TEXT NOT NULL,
    "orderId"     TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "actorUserId" TEXT,
    "meta"        JSONB NOT NULL DEFAULT '{}',
    "occurredAt"  TIMESTAMP(3) NOT NULL,
    "seq"         SERIAL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id"),
    -- ตารางว่างตอนสร้าง จึงใส่ CHECK ตรง ๆ ได้ ไม่ต้องแยก NOT VALID + VALIDATE
    -- (ต่างจากตอน retrofit CHECK บนตารางที่มีข้อมูลแล้ว เช่น Shop_vertical_check)
    CONSTRAINT "OrderEvent_type_check" CHECK ("type" IN (
        'ORDER_CREATED',
        'ORDER_EDITED',
        'ORDER_CANCELLED',
        'TRACKING_ADDED',
        'SHIPMENT_CREATED',
        'SHIPMENT_CANCELLED',
        'SHIPMENT_LINKED',
        'SMS_LINK_SENT',
        'BUYER_CONFIRMED'
    ))
);

CREATE UNIQUE INDEX "OrderEvent_seq_key" ON "OrderEvent"("seq");

-- query หลัก: WHERE orderId = ? ORDER BY occurredAt DESC, seq DESC — index เดียวทั้งกรองและเรียง
CREATE INDEX "OrderEvent_orderId_occurredAt_seq_idx"
    ON "OrderEvent"("orderId", "occurredAt", "seq");

-- ไม่ใช่ product query — กัน full table scan ตอนลบบัญชีพนักงาน (FK SET NULL ต้องหาแถวลูก)
CREATE INDEX "OrderEvent_actorUserId_idx" ON "OrderEvent"("actorUserId");

ALTER TABLE "OrderEvent"
    ADD CONSTRAINT "OrderEvent_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderEvent"
    ADD CONSTRAINT "OrderEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══ 2) Backfill ═══
-- ค่า source/status ที่ใช้ในเงื่อนไขข้างล่าง query ยืนยันกับฐาน prod จริงแล้ว 2026-08-05
-- (source: CREATED|LINKED · status: CREATED|CANCELLED · cancelInitiator: seller)
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
