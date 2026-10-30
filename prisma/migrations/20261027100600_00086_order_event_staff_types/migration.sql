-- feature 00086 P3 — OrderEvent.type + SERVICE_ASSIGNED / SERVICE_CLAIMED / SERVICE_UNASSIGNED / SERVICE_FINISHED (35 → 39)
--   มอบงาน · ช่างกดรับงาน · ยกเลิกผู้รับผิดชอบ (มือ หรือ ถูกลบออกจากร้าน) · ทำเสร็จแล้ว — ประวัติงานต้องตอบได้ว่าใครทำเมื่อไร (FR-007/010)
-- ทำไมต้องขยายในไฟล์แยก: recordOrderEvent อยู่ใน transaction เดียวกับการเริ่ม/ทำเสร็จ/มอบงาน (ไม่ใช่ SAVEPOINT)
--   ถ้า CHECK ไม่รู้จักชนิดใหม่ ทั้งการกระทำจะล้มไปด้วย
-- (แพตเทิร์น CHECK additive — docs/conventions/migration-check-constraint-additive.md · คัดลอกโครงจาก 20261026100100_00085)
-- guard: นิยามเดิมมี SERVICE_FINISHED แล้ว = ข้าม (รันซ้ำได้) · อ่านค่าเดิมจาก pg_get_constraintdef แล้วต่อท้าย
--   (ห้าม hardcode รายการทับเมื่อมีนิยามเดิม — ค่าที่ migration อื่นเพิ่มไว้จะหายเงียบ)
-- fallback (ไม่มี constraint เลย) = 35 ค่าใน ORDER_EVENT_TYPES ก่อน 00086 + 4 = 39
-- rollback: ห้ามหด CHECK หลังมีแถวชนิดใหม่แล้ว (DATABASE §5.2)
SET LOCAL lock_timeout = '5s';

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
      'SERVICE_CLOSED', 'SERVICE_REOPENED',
      'SERVICE_STARTED', 'AUTO_NOTICE_SENT', 'AUTO_NOTICE_FAILED',
      'MANUAL_DISPATCHED', 'SELLER_DELIVERED', 'MANUAL_DISPATCH_UNDONE',
      'PARCEL_PROBLEM_CLOSED', 'PARCEL_PROBLEM_REOPENED',
      'SERVICE_ASSIGNED', 'SERVICE_CLAIMED', 'SERVICE_UNASSIGNED', 'SERVICE_FINISHED'
    )) NOT VALID;
    ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";

  ELSIF position('SERVICE_FINISHED' IN def) = 0 THEN
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
      'ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_type_check" CHECK ("type" = ANY (ARRAY[%s, ''SERVICE_ASSIGNED'', ''SERVICE_CLAIMED'', ''SERVICE_UNASSIGNED'', ''SERVICE_FINISHED'']::text[])) NOT VALID',
      vals
    );
    ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";
  END IF;
END $$;
