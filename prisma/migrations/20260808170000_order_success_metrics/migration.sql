-- feature 00039 — ตัวชี้วัดความสำเร็จของคำสั่งซื้อ
--
-- additive ล้วน: เพิ่ม 3 คอลัมน์ nullable + 1 partial index + ต่อท้ายค่า CHECK ของ OrderEvent.type
-- ไม่มี backfill · ไม่มี UPDATE · ไม่มี DROP · ไม่แตะข้อมูลเดิมเลย
--
-- timestamp 20260808170000 เลือกให้ "รันทีหลัง" migration ที่มีอยู่ในทุก branch ณ วันที่เขียน
-- (ล่าสุดคือ 20260808120000_comment_auto_reply) ตามบทเรียน 2026-08-06 ที่สอง branch สร้าง
-- migration เวลาชนกันแล้วตัวที่รันทีหลังลบงานของตัวแรกทิ้งโดยไม่มี error

-- ─────────────────────────────────────────────────────────────
-- 1) OrderShipment.deliveredAt — เวลาที่พัสดุถึงมือผู้รับครั้งแรก
-- ─────────────────────────────────────────────────────────────
-- 🛑 ต้องเป็นคอลัมน์แยก ใช้ carrierStatusAt ที่มีอยู่แล้วแทนไม่ได้ เพราะค่านั้นถูกเขียนทับ
-- ทุกครั้งที่สถานะขยับ ใบ COD ที่เดินต่อจาก delivered ไป payment_success จะทำให้ carrierStatusAt
-- กลายเป็นเวลาที่เงินเข้า ไม่ใช่เวลาที่ของถึง → กำหนดปิดอัตโนมัติ 7 วันจะถูกเลื่อนออกทุกครั้ง
-- ที่มี webhook ใหม่เข้ามา และอาจไม่ปิดเลย โดยไม่มีอะไรฟ้อง
ALTER TABLE "OrderShipment" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);

-- index สำหรับงานเบื้องหลังที่สแกน "ใบที่ส่งถึงเกิน 7 วันแล้ว" ทุกวัน
-- partial เพราะแถวส่วนใหญ่เป็น NULL (พัสดุที่ยังไม่ถึง / ใบเก่าที่ไม่มี backfill)
CREATE INDEX IF NOT EXISTS "OrderShipment_deliveredAt_idx"
  ON "OrderShipment" ("deliveredAt")
  WHERE "deliveredAt" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2) Order — ธงข้อพิพาท (กันการปิดอัตโนมัติ BR-OSM-03)
-- ─────────────────────────────────────────────────────────────
-- ใช้เวลา 2 ช่องแทน boolean ตัวเดียว เพื่อรู้ด้วยว่าเรื่องเปิด/ปิดเมื่อไร โดยไม่ต้องมีตารางใหม่
-- (PRD กันระบบข้อพิพาทเต็มรูปไว้ใน Out of Scope — ที่ต้องการจริงคือธงกันการปิด)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "disputeOpenedAt"   TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "disputeResolvedAt" TIMESTAMP(3);

-- ─────────────────────────────────────────────────────────────
-- 3) OrderEvent.type — เพิ่ม 2 ชนิด แบบ "ต่อท้าย" ไม่ hardcode รายชื่อ
-- ─────────────────────────────────────────────────────────────
-- ยกแพตเทิร์นมาจาก 20260806150000_order_event_date_changed ทั้งก้อน (รวม sanity check)
-- เหตุผลเต็มอยู่ในหัวไฟล์นั้น: hardcode รายชื่อ = branch ที่รันทีหลังลบค่าของ branch ก่อนทิ้งเงียบ ๆ
--
-- 🛑 ไม่เพิ่ม SYSTEM_CONFIRMED ที่นี่ — ชนิดนั้นมีอยู่แล้ว การปิดอัตโนมัติของฟีเจอร์นี้ใช้ชนิดเดิม
-- แล้วแยกด้วย meta.reason = 'AUTO_CONFIRM_DELIVERED' (ชนิด event ตอบว่า "เกิดอะไรขึ้น"
-- ส่วน "เพราะอะไร" เป็นรายละเอียด — enum ที่โตทุกครั้งที่มีสาเหตุใหม่คือที่มาของบั๊ก
-- "ค่าใหม่ตกเข้า branch ผิดเงียบ ๆ")
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
    -- ฐานที่ยังไม่มี constraint (migration ของ branch อื่นยังไม่รัน) — ใส่ชุดที่ branch นี้รู้จัก
    -- ตัวที่มาทีหลังจะต่อท้ายเอง
    ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_type_check" CHECK ("type" IN (
      'ORDER_CREATED', 'ORDER_EDITED', 'ORDER_CANCELLED', 'TRACKING_ADDED',
      'SHIPMENT_CREATED', 'SHIPMENT_CANCELLED', 'SHIPMENT_LINKED', 'SMS_LINK_SENT',
      'BUYER_CONFIRMED', 'SYSTEM_CONFIRMED', 'COD_SETTLED', 'PAYMENT_METHOD_SYNCED',
      'ORDER_DATE_CHANGED', 'ORDER_DISPUTE_OPENED', 'ORDER_DISPUTE_RESOLVED'
    )) NOT VALID;
    ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";

  ELSIF position('ORDER_DISPUTE_OPENED' IN def) = 0 THEN
    SELECT string_agg(quote_literal(m[1]), ', '), count(*)
    INTO vals, matched_count
    FROM regexp_matches(def, '''([A-Za-z0-9_]+)''', 'g') AS m;

    -- ล้มเสียงดังดีกว่าลบค่าทิ้งเงียบ ๆ: จำนวนค่าที่ regex จับได้ × 2 ต้องเท่ากับจำนวน quote ใน def
    quote_count := regexp_count(def, '''');
    IF matched_count IS NULL OR matched_count * 2 <> quote_count THEN
      RAISE EXCEPTION
        'OrderEvent_type_check: regex จับค่าได้ % รายการ แต่พบ quote ในนิยามเดิม % ตัว (ต้องเป็น %*2) — def=%',
        matched_count, quote_count, matched_count, def;
    END IF;

    ALTER TABLE "OrderEvent" DROP CONSTRAINT "OrderEvent_type_check";
    EXECUTE format(
      'ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_type_check" CHECK ("type" = ANY (ARRAY[%s, ''ORDER_DISPUTE_OPENED'', ''ORDER_DISPUTE_RESOLVED'']::text[])) NOT VALID',
      vals
    );
    ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";
  END IF;
  -- มีค่าอยู่แล้ว = ไม่ทำอะไร (รันซ้ำได้)
END $$;
