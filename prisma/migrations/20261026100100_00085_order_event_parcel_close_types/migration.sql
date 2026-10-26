-- feature 00085 — OrderEvent.type + PARCEL_PROBLEM_CLOSED / PARCEL_PROBLEM_REOPENED (SDS §6)
-- (แพตเทิร์น CHECK additive — docs/conventions/migration-check-constraint-additive.md · โครงจาก 20261018100300)
-- guard: ถ้านิยามเดิมมี PARCEL_PROBLEM_CLOSED แล้ว = ข้าม (รันซ้ำได้) · fallback = 33 ค่าเดิมใน ORDER_EVENT_TYPES + 2 = 35
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
      'PARCEL_PROBLEM_CLOSED', 'PARCEL_PROBLEM_REOPENED'
    )) NOT VALID;
    ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";

  ELSIF position('PARCEL_PROBLEM_CLOSED' IN def) = 0 THEN
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
      'ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_type_check" CHECK ("type" = ANY (ARRAY[%s, ''PARCEL_PROBLEM_CLOSED'', ''PARCEL_PROBLEM_REOPENED'']::text[])) NOT VALID',
      vals
    );
    ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";
  END IF;
END $$;
