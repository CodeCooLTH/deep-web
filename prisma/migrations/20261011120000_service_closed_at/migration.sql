-- feature 00073 — งานบริการ 4 ขั้น: ร้านบริการ "ปิดงาน" (ขั้น 3) = จุดนับเงินภายในร้าน
--
-- 1) Order.serviceClosedAt + index (shopId, serviceClosedAt)
-- 2) OrderEvent.type + SERVICE_CLOSED / SERVICE_REOPENED (แพตเทิร์น CHECK additive —
--    docs/conventions/migration-check-constraint-additive.md · โครงจาก 20260828120000)
-- 3) ปิดงานย้อนหลังครั้งเดียว — เฉพาะร้าน vertical = 'SERVICE_QUEUE' เท่านั้น
--    ร้านขายของ/ที่พักไม่ถูกแตะแม้แต่แถวเดียว (มติ user 2026-10-11: กติกาเดิมคือค่าตั้งต้นถาวร)
--
-- ทุกขั้นรันซ้ำได้ (IF NOT EXISTS / IS NULL / NOT EXISTS)

-- ── 1) คอลัมน์ + index ────────────────────────────────────────────────────────
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "serviceClosedAt" TIMESTAMPTZ(3);

CREATE INDEX IF NOT EXISTS "Order_shopId_serviceClosedAt_idx" ON "Order"("shopId", "serviceClosedAt");

-- ── 2) ประเภท event ใหม่ ──────────────────────────────────────────────────────
-- ยืนยันแล้ว 2026-10-11 ว่า 20260828120000 เป็น migration ล่าสุดที่แก้ OrderEvent_type_check
-- และกิ่ง fallback ข้างล่างคือ 25 ค่าใน src/lib/order-event.ts ณ วันนี้ + 2 ค่าใหม่
DO $$
DECLARE
  def           text;
  vals          text;
  matched_count int;
  quote_count   int;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
  FROM pg_constraint
  WHERE conname = 'OrderEvent_type_check'
    AND conrelid = '"OrderEvent"'::regclass;

  IF def IS NULL THEN
    ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_type_check" CHECK ("type" IN (
      'ORDER_CREATED', 'ORDER_EDITED', 'ORDER_CANCELLED', 'TRACKING_ADDED',
      'SHIPMENT_CREATED', 'SHIPMENT_CANCELLED', 'SHIPMENT_LINKED', 'SMS_LINK_SENT',
      'BUYER_CONFIRMED', 'COD_SETTLED', 'SYSTEM_CONFIRMED', 'PAYMENT_METHOD_SYNCED',
      'ORDER_DATE_CHANGED', 'ORDER_DISPUTE_OPENED', 'ORDER_DISPUTE_RESOLVED',
      'AUTH_FLOW_STARTED', 'AUTH_FLOW_COMPLETED',
      'RETURN_REQUESTED', 'RETURN_SHIPPED', 'RETURN_RECEIVED', 'RETURN_CANCELLED',
      'HANDED_OVER', 'HANDOVER_REVERTED', 'PAYMENT_CONFIRMED', 'PAYMENT_CONFIRM_REVERTED',
      'SERVICE_CLOSED', 'SERVICE_REOPENED'
    )) NOT VALID;
    ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";

  ELSIF position('SERVICE_CLOSED' IN def) = 0 THEN
    SELECT string_agg(quote_literal(m[1]), ', '), count(*)
    INTO vals, matched_count
    FROM regexp_matches(def, '''([A-Za-z0-9_]+)''', 'g') AS m;

    -- ล้มเสียงดังดีกว่าลบค่าทิ้งเงียบ ๆ (ดู 20260828120000)
    quote_count := (length(def) - length(replace(def, '''', '')));
    IF matched_count IS NULL OR matched_count * 2 <> quote_count THEN
      RAISE EXCEPTION
        'OrderEvent_type_check: regex จับค่าได้ % รายการ แต่พบ quote ในนิยามเดิม % ตัว (ต้องเป็น matched*2) — def=%',
        matched_count, quote_count, def;
    END IF;

    ALTER TABLE "OrderEvent" DROP CONSTRAINT "OrderEvent_type_check";
    EXECUTE format(
      'ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_type_check" CHECK ("type" = ANY (ARRAY[%s, ''SERVICE_CLOSED'', ''SERVICE_REOPENED'']::text[])) NOT VALID',
      vals
    );
    ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";
  END IF;
END $$;

-- ── 3) ปิดงานย้อนหลัง (เฉพาะร้านบริการ) ───────────────────────────────────────
-- ลำดับสำคัญ: ข้อ a ก่อน (เวลาจบนัดใกล้ความจริงที่สุด) แล้ว b, c เติมเฉพาะที่ยังว่าง
-- ไม่แตะงาน CANCELLED/DRAFTED (ยกเลิก/ร่าง ไม่ใช่งานที่ปิด)

-- a) ร้านลงผลนัดแล้ว (ให้บริการแล้ว/ไม่มาตามนัด) → วันปิด = เวลาจบนัด
--    ทำไมไม่ใช้ updatedAt: ขยับทุกครั้งที่รับเงิน/แก้ไข · การลงผลถูกบังคับให้ทำหลังเวลาเริ่มนัด (BR-RSV-34)
--    ไม่มีเวลาจบนัด (ข้อมูลผิดรูป) → updatedAt — ต้องได้วันปิดทุกแถว ไม่งั้นป้าย "ปิดงานแล้ว" (อ่านผลนัด)
--    กับยอดขาย (อ่านวันปิด) จะไม่ตรงกัน: ขึ้นว่าปิดแล้วแต่ยอด ฿0 (audit 2026-10-11)
UPDATE "Order" o
SET "serviceClosedAt" = COALESCE(o."serviceEnd", o."updatedAt")
FROM "Shop" s
WHERE s."id" = o."shopId"
  AND s."vertical" = 'SERVICE_QUEUE'
  AND o."serviceClosedAt" IS NULL
  AND o."status" NOT IN ('CANCELLED', 'DRAFTED')
  AND o."appointmentStatus" IN ('COMPLETED', 'NO_SHOW');

-- b) ลูกค้ายืนยันรับบริการแล้วแต่ร้านไม่เคยปิด → วันปิด = วันที่ยืนยัน (มติ 2026-10-10 ข้อ 5)
UPDATE "Order" o
SET "serviceClosedAt" = COALESCE(
  (SELECT min(e."occurredAt") FROM "OrderEvent" e
    WHERE e."orderId" = o."id" AND e."type" IN ('BUYER_CONFIRMED', 'SYSTEM_CONFIRMED')),
  o."updatedAt"
)
FROM "Shop" s
WHERE s."id" = o."shopId"
  AND s."vertical" = 'SERVICE_QUEUE'
  AND o."serviceClosedAt" IS NULL
  AND o."status" = 'CONFIRMED';

-- b2) งานที่ลูกค้ายืนยันรับบริการแล้ว แต่สถานะนัดยังค้าง "นัดแล้ว/ลูกค้ายืนยันนัด/ขอเลื่อน" → ให้บริการแล้ว
--     (ไม่งั้นปฏิทิน/บอร์ดนัดยังโชว์ว่ารอให้บริการทั้งที่จบไปแล้ว) · งานที่ไม่มีนัด (NULL) ไม่แตะ
UPDATE "Order" o
SET "appointmentStatus" = 'COMPLETED'
FROM "Shop" s
WHERE s."id" = o."shopId"
  AND s."vertical" = 'SERVICE_QUEUE'
  AND o."status" = 'CONFIRMED'
  AND o."appointmentStatus" IN ('SCHEDULED', 'CONFIRMED_BY_BUYER', 'RESCHEDULE_REQUESTED');

-- c) ข้อมูลเก่าที่ค้าง "เริ่มให้บริการแล้ว" (SHIPPED — ก่อนบังคับ NO_SHIPPING) → ปิดตามวันที่เปลี่ยนสถานะ
UPDATE "Order" o
SET "serviceClosedAt" = COALESCE(
  (SELECT min(e."occurredAt") FROM "OrderEvent" e
    WHERE e."orderId" = o."id" AND e."type" = 'TRACKING_ADDED'),
  o."updatedAt"
)
FROM "Shop" s
WHERE s."id" = o."shopId"
  AND s."vertical" = 'SERVICE_QUEUE'
  AND o."serviceClosedAt" IS NULL
  AND o."status" = 'SHIPPED';

-- d) บันทึกประวัติ "ปิดงาน" ให้งานที่ปิดย้อนหลัง (meta.backfilled = ไทม์ไลน์บอกว่าเป็นข้อมูลย้อนหลัง)
--    ใส่เฉพาะงานที่ยังไม่มี SERVICE_CLOSED (รันซ้ำไม่เกิดแถวซ้ำ) · actor = null (ระบบ)
INSERT INTO "OrderEvent" ("id", "orderId", "type", "actorUserId", "meta", "occurredAt")
SELECT
  gen_random_uuid()::text,
  o."id",
  'SERVICE_CLOSED',
  NULL,
  jsonb_build_object(
    'backfilled', true,
    'outcome', CASE WHEN o."appointmentStatus" = 'NO_SHOW' THEN 'NO_SHOW' ELSE 'SERVED' END
  ),
  o."serviceClosedAt"
FROM "Order" o
JOIN "Shop" s ON s."id" = o."shopId"
WHERE s."vertical" = 'SERVICE_QUEUE'
  AND o."serviceClosedAt" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "OrderEvent" e WHERE e."orderId" = o."id" AND e."type" = 'SERVICE_CLOSED'
  );
