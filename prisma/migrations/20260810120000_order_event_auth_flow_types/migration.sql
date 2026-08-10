-- feature 00041 — Buyer Order Experience: instrumentation event 2 ชนิดใหม่ (SRS TFR-013)
--   AUTH_FLOW_STARTED   — ผู้ซื้อกดปุ่ม login จากหน้า /o/{token} (guest เขียนได้, actorUserId=null)
--   AUTH_FLOW_COMPLETED — auth สำเร็จแล้ว claim ออเดอร์ได้จริง (dedupe โดยธรรมชาติจาก
--                          WHERE buyerUserId IS NULL ของ guaranteeOrderLink)
-- สองค่านี้ถูกกรองออกจากไทม์ไลน์ที่ผู้ใช้เห็นที่ getOrderEvents() — ไม่ทำให้ประวัติออเดอร์รก
--
-- 🛑 ห้าม DROP+ADD ด้วยรายชื่อ hardcode — ต้องอ่านของเดิมจากฐานมาต่อท้ายเสมอ
--    (docs/conventions/migration-check-constraint-additive.md) เหตุการณ์จริง 2026-08-06:
--    สอง branch รันคู่ขนานแล้วตัวที่รันทีหลังลบค่าของตัวแรกทิ้งเงียบ ๆ — migrate รายงานสำเร็จ
--    ทุกไฟล์ ไม่มี error ไปโผล่เป็น insert ล้มบนฐานจริงทีหลัง
--
-- ยืนยันกับ prod แล้ว 2026-08-10 (read-only): CHECK ปัจจุบันมี 15 ค่าตรงกับ
-- src/lib/order-event.ts::ORDER_EVENT_TYPES ⇒ หลัง migration นี้ต้องได้ 17 ค่า

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
    -- ฐานที่ยังไม่มี constraint (เผื่อฐานทดสอบใหม่ล้วน) — ใส่ชุดที่ branch นี้รู้จักทั้งหมด
    -- ตัวที่มาทีหลังจะอ่านของเราแล้วต่อท้ายเอง
    ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_type_check" CHECK ("type" IN (
      'ORDER_CREATED', 'ORDER_EDITED', 'ORDER_CANCELLED', 'TRACKING_ADDED',
      'SHIPMENT_CREATED', 'SHIPMENT_CANCELLED', 'SHIPMENT_LINKED', 'SMS_LINK_SENT',
      'BUYER_CONFIRMED', 'COD_SETTLED', 'SYSTEM_CONFIRMED', 'PAYMENT_METHOD_SYNCED',
      'ORDER_DATE_CHANGED', 'ORDER_DISPUTE_OPENED', 'ORDER_DISPUTE_RESOLVED',
      'AUTH_FLOW_STARTED', 'AUTH_FLOW_COMPLETED'
    )) NOT VALID;
    ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";

  ELSIF position('AUTH_FLOW_STARTED' IN def) = 0 THEN
    SELECT string_agg(quote_literal(m[1]), ', '), count(*)
    INTO vals, matched_count
    FROM regexp_matches(def, '''([A-Za-z0-9_]+)''', 'g') AS m;

    -- ล้มเสียงดังดีกว่าลบค่าทิ้งเงียบ ๆ: จำนวนค่าที่ regex จับได้ × 2 ต้องเท่ากับจำนวน quote
    -- ในนิยามเดิม ถ้าไม่เท่าแปลว่า regex อ่านนิยามไม่ครบ — หยุดทันที อย่าเขียนทับ
    quote_count := (length(def) - length(replace(def, '''', ''))) ;
    IF matched_count IS NULL OR matched_count * 2 <> quote_count THEN
      RAISE EXCEPTION
        'OrderEvent_type_check: regex จับค่าได้ % รายการ แต่พบ quote ในนิยามเดิม % ตัว (ต้องเป็น matched*2) — def=%',
        matched_count, quote_count, def;
    END IF;

    ALTER TABLE "OrderEvent" DROP CONSTRAINT "OrderEvent_type_check";
    EXECUTE format(
      'ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_type_check" CHECK ("type" = ANY (ARRAY[%s, ''AUTH_FLOW_STARTED'', ''AUTH_FLOW_COMPLETED'']::text[])) NOT VALID',
      vals
    );
    ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";
  END IF;
  -- มีค่าอยู่แล้ว = ไม่ทำอะไร (idempotent รันซ้ำได้ปลอดภัย)
END $$;
