-- feature 00082 — ลูกค้ายืนยันรับบริการ = ปิดงาน + ชำระครบ (ร้านบริการเท่านั้น · มติ user 2026-10-21/23)
--
-- ปรับใบเก่าให้ตรงกติกาใหม่ครั้งเดียว (ใบใหม่ทำที่ confirmOrder → settleServiceJobOnBuyerConfirm):
--   ใบที่ลูกค้ายืนยันแล้ว (status = CONFIRMED) ของร้าน vertical = 'SERVICE_QUEUE' ที่ไม่ใช่ "ไม่มาตามนัด"
--   1) ยังไม่ปิดงาน → บันทึกประวัติ "ปิดงาน" (ปิดให้เมื่อลูกค้ายืนยัน · ย้อนหลัง)
--   2) ยังค้างเงิน (ทั้งที่ยังไม่ปิด และที่ร้านปิดแบบค้าง — D-5) → รายการรับเงินยอดค้าง 1 แถว
--   3) ยังไม่ปิดงาน → ปิด: วันปิด = วันที่ลูกค้ายืนยัน (D-3) · มีนัดค้าง → ให้บริการแล้ว
--
-- 🛑 ร้านขายของ/ที่พักไม่ถูกแตะแม้แต่แถวเดียว (กั้นด้วย s."vertical" = 'SERVICE_QUEUE' ทุกคำสั่ง)
-- 🛑 ไม่ส่งข้อความหาใคร (migration ไม่เรียกระบบแจ้งเตือน)
-- 🛑 รันซ้ำได้: ข้อ 1 กันด้วย NOT EXISTS · ข้อ 2 คิดยอดค้างสด (จ่ายครบแล้ว = ไม่สร้าง) · ข้อ 3 เฉพาะที่ยังว่าง
--
-- วันที่ลูกค้ายืนยัน = occurredAt แรกของ BUYER_CONFIRMED/SYSTEM_CONFIRMED (นิยามเดียวกับ 00073 ข้อ 3b)
--   ไม่มี event → updatedAt · คอลัมน์พวกนี้เป็น timestamp ไม่มีโซน (UTC) ส่วน serviceClosedAt มีโซน
--   ⇒ แปลงด้วย AT TIME ZONE 'UTC' ตรง ๆ ไม่พึ่ง TimeZone ของ session
-- ยอดค้าง = ยอดรวม − เงินที่รับจริงที่ยังไม่ถูกยกเลิก (DEPOSIT + BALANCE) ไม่ต่ำกว่า 0 — สูตรเดียวกับ computeOrderMoney
-- หมายเหตุรายการรับเงิน = BUYER_CONFIRM_PAYMENT_NOTE ใน src/lib/service-job.ts (ต้องตรงกันทุกตัวอักษร)

-- ── 1) ประวัติ "ปิดงาน" ของใบที่จะถูกปิดในข้อ 3 (ก่อนปิด เพื่ออ่านยอดค้างก่อนบันทึกเงิน) ────────────
INSERT INTO "OrderEvent" ("id", "orderId", "type", "actorUserId", "meta", "occurredAt")
SELECT
  gen_random_uuid()::text,
  t."id",
  'SERVICE_CLOSED',
  t."buyerUserId",
  jsonb_build_object('outcome', 'SERVED', 'closedBy', 'BUYER', 'backfilled', true)
    || CASE WHEN t."outstanding" > 0 THEN jsonb_build_object('amount', t."outstanding") ELSE '{}'::jsonb END,
  t."confirmedAt"
FROM (
  SELECT
    o."id",
    o."buyerUserId",
    COALESCE(
      (SELECT min(e."occurredAt") FROM "OrderEvent" e
        WHERE e."orderId" = o."id" AND e."type" IN ('BUYER_CONFIRMED', 'SYSTEM_CONFIRMED')),
      o."updatedAt"
    ) AS "confirmedAt",
    GREATEST(0, o."totalAmount" - COALESCE(
      (SELECT sum(p."amount") FROM "OrderPayment" p
        WHERE p."orderId" = o."id" AND p."voidedAt" IS NULL AND p."kind" IN ('DEPOSIT', 'BALANCE')),
      0
    )) AS "outstanding"
  FROM "Order" o
  JOIN "Shop" s ON s."id" = o."shopId"
  WHERE s."vertical" = 'SERVICE_QUEUE'
    AND o."status" = 'CONFIRMED'
    AND o."serviceClosedAt" IS NULL
    AND o."appointmentStatus" IS DISTINCT FROM 'NO_SHOW'
) t
WHERE NOT EXISTS (
  SELECT 1 FROM "OrderEvent" x
  WHERE x."orderId" = t."id" AND x."type" = 'SERVICE_CLOSED' AND x."meta" ->> 'closedBy' = 'BUYER'
);

-- ── 2) รายการรับเงินยอดค้าง (ลูกค้ายืนยัน = ชำระแล้ว) ─────────────────────────────────────────────
--    method = OTHER ⇒ ใบเสร็จไม่ติ๊กเงินสด/โอน (BR-RCP-13) · ผู้รับ = ลูกค้าที่ยืนยัน (ใบเก่าไม่มีบัญชีลูกค้า → เจ้าของร้าน)
INSERT INTO "OrderPayment" ("id", "orderId", "shopId", "kind", "amount", "method", "receivedAt", "receivedByUserId", "note")
SELECT
  gen_random_uuid()::text,
  t."id",
  t."shopId",
  'BALANCE',
  t."outstanding",
  'OTHER',
  t."confirmedAt",
  t."receiverId",
  'ลูกค้ายืนยันรับบริการและชำระแล้ว'
FROM (
  SELECT
    o."id",
    o."shopId",
    COALESCE(o."buyerUserId", s."userId") AS "receiverId",
    COALESCE(
      (SELECT min(e."occurredAt") FROM "OrderEvent" e
        WHERE e."orderId" = o."id" AND e."type" IN ('BUYER_CONFIRMED', 'SYSTEM_CONFIRMED')),
      o."updatedAt"
    ) AS "confirmedAt",
    GREATEST(0, o."totalAmount" - COALESCE(
      (SELECT sum(p."amount") FROM "OrderPayment" p
        WHERE p."orderId" = o."id" AND p."voidedAt" IS NULL AND p."kind" IN ('DEPOSIT', 'BALANCE')),
      0
    )) AS "outstanding"
  FROM "Order" o
  JOIN "Shop" s ON s."id" = o."shopId"
  WHERE s."vertical" = 'SERVICE_QUEUE'
    AND o."status" = 'CONFIRMED'
    AND o."appointmentStatus" IS DISTINCT FROM 'NO_SHOW'
) t
WHERE t."outstanding" > 0;

-- ── 3) ปิดงานที่ยังไม่ปิด — วันปิด = วันที่ลูกค้ายืนยัน · นัดที่ค้างอยู่ → ให้บริการแล้ว ─────────────────
UPDATE "Order" o
SET
  "serviceClosedAt" = COALESCE(
    (SELECT min(e."occurredAt") FROM "OrderEvent" e
      WHERE e."orderId" = o."id" AND e."type" IN ('BUYER_CONFIRMED', 'SYSTEM_CONFIRMED')),
    o."updatedAt"
  ) AT TIME ZONE 'UTC',
  "appointmentStatus" = CASE
    WHEN o."appointmentStatus" IN ('SCHEDULED', 'CONFIRMED_BY_BUYER', 'RESCHEDULE_REQUESTED') THEN 'COMPLETED'
    ELSE o."appointmentStatus"
  END
FROM "Shop" s
WHERE s."id" = o."shopId"
  AND s."vertical" = 'SERVICE_QUEUE'
  AND o."status" = 'CONFIRMED'
  AND o."serviceClosedAt" IS NULL
  AND o."appointmentStatus" IS DISTINCT FROM 'NO_SHOW';
