-- Order_cancel_reason: เปิดรับเหตุผลยกเลิกของร้านที่ไม่ใช่ที่พัก (feature 00039)
--
-- CHECK ตัวนี้ถูกวางไว้ตอน 20260722000100 สมัยที่ `cancelReason` ยังเป็นของระบบจองอย่างเดียว
-- (BR-LODG-36) จึงมีแค่ 4 ค่าของที่พัก. feature 00039 ขยายการเขียนคอลัมน์นี้ไปทุกประเภทออเดอร์
-- พร้อมชุดคำที่แยกตาม `Shop.vertical` แล้วเพิ่มมา 2 ค่า แต่ไม่มี migration ตัวไหนแตะ CHECK เลย:
--
--   BUYER_NO_SHOW    — SERVICE_QUEUE "ลูกค้าไม่มาตามนัด"
--   BUYER_NO_PAYMENT — ONLINE_SALES  "ลูกค้าไม่โอนเงิน"
--
-- ผลบน prod: ร้านคิวงาน/ร้านขายของกดยกเลิกด้วยเหตุผลตัวแรกของชุดตัวเอง แล้วได้ 23514 เต็ม ๆ
-- หน้าจอ (2026-08-12). อีก 3 ค่าใช้ร่วมกับที่พักอยู่แล้วจึงผ่าน — บั๊กเลยดูเหมือน "บางครั้ง"
--
-- ชุดค่าที่ถูกต้อง "ต่างกันตาม vertical" ซึ่ง CHECK ระดับแถวเขียนไม่ได้ (ไม่เห็น Shop.vertical)
-- ด่านต่อ vertical จึงอยู่ที่ service layer ตามเดิม (`isValidCancelReason` ใน lib/cancel-reasons.ts)
-- CHECK ตัวนี้ทำหน้าที่แค่กันค่าที่ไม่ใช่คำในระบบเลย — ไม่ใช่ตัวบังคับกติกาต่อประเภทร้าน
--
-- เขียนแบบ additive ตาม docs/conventions/migration-check-constraint-additive.md:
-- อ่านนิยามเดิมจากฐานมาต่อท้าย ไม่ hardcode รายชื่อ (สอง branch แก้พร้อมกันแล้วลบค่ากันเงียบ ๆ ได้)

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
        'BUYER_NO_PAYMENT', 'BUYER_NO_SHOW'
      ]::text[])) NOT VALID;
    ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_cancel_reason";

  ELSE
    SELECT array_agg(v.val ORDER BY v.ord)
    INTO missing
    FROM unnest(ARRAY['BUYER_NO_PAYMENT', 'BUYER_NO_SHOW']) WITH ORDINALITY AS v(val, ord)
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
