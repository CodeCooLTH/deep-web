-- feature 00033 — เพิ่มชนิดเหตุการณ์ ORDER_DATE_CHANGED (เลื่อนวันที่คำสั่งซื้อ)
--
-- 🛑 ทำไม migration นี้ไม่ hardcode รายชื่อค่า และทำไม timestamp เป็น 150000 ไม่ใช่ 120000
--
-- CHECK `OrderEvent_type_check` เป็น unmanaged SQL (Prisma DSL ประกาศไม่ได้) ทุก branch ที่เพิ่ม
-- ชนิดเหตุการณ์ใหม่จึงต้องเขียน migration เอง และที่ผ่านมาทุกตัวเขียนแบบ DROP แล้ว ADD ด้วย
-- "รายชื่อเต็มที่ตัวเองรู้จัก" ซึ่งพังทันทีเมื่อมีมากกว่าหนึ่ง branch ทำพร้อมกัน:
-- ตัวที่รันทีหลังจะลบค่าของตัวที่รันก่อนทิ้งโดยไม่มีใครรู้ (ไม่ error ไม่มี test จับ —
-- จะไปโผล่เป็น insert ล้มตอน runtime บนฐานจริงเท่านั้น)
--
-- เกิดขึ้นจริงแล้วบนฐาน dev 2026-08-06: ไฟล์นี้เคยชื่อ 20260806120000 ซึ่งชนกับ
-- 20260806120000_order_shipment_cod_settled (branch feat/i-ship-integrate) พอดีตัว
-- แล้ว 20260806140000_order_event_payment_synced ตามมาอีก — ทั้งคู่ hardcode รายชื่อที่ไม่มี
-- ORDER_DATE_CHANGED ค่าของเราจึงถูกลบทิ้งทั้งที่ migration รันสำเร็จครบ
--
-- แก้ 2 ชั้น:
--   1. timestamp เลื่อนไป 150000 ให้รัน "ทีหลัง" ทั้งสองตัวนั้น
--   2. SQL อ่านรายชื่อที่มีอยู่จริงจาก pg_constraint แล้ว "ต่อท้าย" ค่าของเรา แทนการ hardcode
--      → ไม่ว่า branch ไหนจะ merge เข้ามาก่อน/หลัง ค่าของทุกฝ่ายอยู่ครบเสมอ และรันซ้ำได้ (idempotent)
--
-- ห้าม `prisma db pull` / `migrate dev` เด็ดขาด — introspect ไม่เห็น CHECK นี้ แล้วจะสร้าง migration ที่ DROP ทิ้ง

DO $$
DECLARE
  def  text;
  vals text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
  FROM pg_constraint
  WHERE conname = 'OrderEvent_type_check';

  IF def IS NULL THEN
    -- ฐานที่ยังไม่มี constraint (เช่นฐานสร้างใหม่ที่ migration ของ branch อื่นยังไม่รัน)
    -- ใส่รายชื่อของ branch นี้ไปก่อน — ตัวที่มาทีหลังจะต่อท้ายเอง
    ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_type_check" CHECK ("type" IN (
      'ORDER_CREATED', 'ORDER_EDITED', 'ORDER_CANCELLED', 'TRACKING_ADDED',
      'SHIPMENT_CREATED', 'SHIPMENT_CANCELLED', 'SHIPMENT_LINKED', 'SMS_LINK_SENT',
      'BUYER_CONFIRMED', 'ORDER_DATE_CHANGED'
    )) NOT VALID;
    ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";

  ELSIF position('ORDER_DATE_CHANGED' IN def) = 0 THEN
    -- มี constraint อยู่แล้วแต่ยังไม่มีค่าของเรา — ดึงรายชื่อเดิมออกมาแล้วต่อท้าย
    SELECT string_agg(quote_literal(m[1]), ', ')
    INTO vals
    FROM regexp_matches(def, '''([A-Z_]+)''', 'g') AS m;

    ALTER TABLE "OrderEvent" DROP CONSTRAINT "OrderEvent_type_check";
    EXECUTE format(
      'ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_type_check" CHECK ("type" = ANY (ARRAY[%s, ''ORDER_DATE_CHANGED'']::text[])) NOT VALID',
      vals
    );
    ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";
  END IF;
  -- มีค่าอยู่แล้ว = ไม่ทำอะไร (รันซ้ำได้)
END $$;
