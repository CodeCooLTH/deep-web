-- Order_cancel_reason: เพิ่ม PARCEL_RETURNED — "ลูกค้าไม่รับของ พัสดุตีกลับ" (ONLINE_SALES)
--
-- ที่มา (user report 2026-08-20, พัสดุ TH068661575518): ลูกค้าไม่รับของ ขนส่งตีกลับถึงร้านแล้ว
-- แต่คำสั่งซื้อค้างเป็น "จัดส่งแล้ว" ตลอดไป เพราะไม่มีทางปิดงานที่ตรงกับความจริง —
-- ชุดเหตุผลเดิมของ ONLINE_SALES มีแต่ "ลูกค้าไม่โอนเงิน / ลูกค้าขอยกเลิก / สินค้ามีปัญหา /
-- ตกลงกันได้" ซึ่งไม่มีข้อไหนจริงเลย ร้านที่อยากปิดงานต้องเลือกคำที่ผิดแล้วประวัติเพี้ยน
--
-- 🛑 ค่านี้ **ไม่มีอำนาจตัดสินตัวเลข** (BR-OSM-05) — การหักใบนี้ออกจากตัวหารอัตราความสำเร็จ
-- ตัดสินจาก `carrierStatus` ของพัสดุที่มีอยู่จริง (`isRateExcludedCancellation` ใน
-- lib/order-stats.ts) ซึ่งร้านสร้างขึ้นเองไม่ได้ ไม่ใช่จากเหตุผลที่ร้านเลือกเอง
--
-- เขียนแบบ additive ตาม docs/conventions/migration-check-constraint-additive.md:
-- อ่านนิยามเดิมจากฐานมาต่อท้าย ไม่ hardcode รายชื่อ (สอง branch แก้พร้อมกันแล้วลบค่ากันเงียบ ๆ ได้
-- — เคยเกิดจริงกับ 20260806120000 ที่ชนกับ _order_shipment_cod_settled)

DO $$
DECLARE
  def     text;
  vals    text;
  missing text[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
  FROM pg_constraint
  WHERE conname = 'Order_cancel_reason'
    AND conrelid = '"Order"'::regclass;   -- scope ด้วย table เสมอ กันชื่อซ้ำข้าม schema

  IF def IS NULL THEN
    -- ฐานที่ยังไม่มี constraint — ใส่รายชื่อของ branch นี้ไปก่อน ตัวที่มาทีหลังจะต่อท้ายเอง
    ALTER TABLE "Order" ADD CONSTRAINT "Order_cancel_reason"
      CHECK ("cancelReason" IS NULL OR "cancelReason" = ANY (ARRAY[
        'BUYER_NO_TRANSFER', 'BUYER_REQUESTED', 'SHOP_ISSUE', 'MUTUAL',
        'BUYER_NO_PAYMENT', 'BUYER_NO_SHOW', 'PARCEL_RETURNED'
      ]::text[])) NOT VALID;
    ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_cancel_reason";

  ELSE
    SELECT array_agg(v.val ORDER BY v.ord)
    INTO missing
    FROM unnest(ARRAY['PARCEL_RETURNED']) WITH ORDINALITY AS v(val, ord)
    WHERE position(v.val IN def) = 0;

    IF missing IS NOT NULL THEN
      SELECT string_agg(quote_literal(m[1]), ', ')
      INTO vals
      FROM regexp_matches(def, '''([A-Za-z0-9_]+)''', 'g') AS m;

      -- ล้มเสียงดังดีกว่าลบค่าเงียบ ๆ: ถ้าดึงค่าได้ไม่ครบเท่าจำนวน quote ในนิยามเดิม แปลว่ามีค่า
      -- ที่ regex ไม่รู้จัก (เช่นมีอักขระนอก [A-Za-z0-9_]) — หยุดทันที อย่าเขียนทับ
      IF vals IS NULL
         OR (length(def) - length(replace(def, '''', ''))) / 2
            <> array_length(string_to_array(vals, ', '), 1) THEN
        RAISE EXCEPTION 'ดึงรายชื่อค่าเดิมจาก CHECK ไม่ครบ — หยุดก่อนเขียนทับ (def: %)', def;
      END IF;

      ALTER TABLE "Order" DROP CONSTRAINT "Order_cancel_reason";
      EXECUTE format(
        'ALTER TABLE "Order" ADD CONSTRAINT "Order_cancel_reason" '
        'CHECK ("cancelReason" IS NULL OR "cancelReason" = ANY (ARRAY[%s, %s]::text[])) NOT VALID',
        vals,
        (SELECT string_agg(quote_literal(v), ', ') FROM unnest(missing) AS v)
      );
      ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_cancel_reason";
    END IF;
  END IF;
  -- ค่าครบอยู่แล้ว = ไม่ทำอะไร (idempotent)
END $$;
