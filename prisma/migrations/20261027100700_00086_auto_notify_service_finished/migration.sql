-- feature 00086 P3 (FR-015) — AutoNotify kind ใหม่ SERVICE_FINISHED: "ทำเสร็จแล้ว ดูรูปก่อน-หลังได้ที่ลิงก์งานบริการ"
--   ขยาย CHECK ของ kind ทั้ง 3 ตาราง (Switch · Template · Ledger) — 5 → 6 ค่า
-- ทำไมต้องครบ 3 ตาราง: ตัวจอง (reserve) insert ledger ด้วย kind นี้ · ถ้า CHECK ไม่รู้จัก insert ล้ม
--   (reserve ใช้ SAVEPOINT จึงไม่ล้มทั้งงาน แต่ข้อความจะไม่ถูกส่งเงียบ ๆ) · Switch/Template ขยายคู่กันให้ชุดค่าตรงกันทั้งระบบ
--   แม้ SERVICE_FINISHED ไม่มีแถวสวิตช์ในหน้าตั้งค่า (PRD §10.2 แถว 2026-10-27: ส่งตาม "ลูกค้าเห็นรูป" ไม่ต้องเปิดสวิตช์แยก)
-- ไม่แตะ CHECK ของ reason ใน ledger (20261017100200): เหตุผล "ร้านไม่เปิดให้ลูกค้าเห็นรูป" ตัดสินที่ eligibility ตอนจอง ⇒ ไม่เกิดแถว ledger
--   (reserveInner คืน null โดยไม่บันทึก) · ตอนส่งจริงถ้าไม่ผ่านแล้ว = 'NOT_ELIGIBLE_ANYMORE' ที่มีอยู่แล้ว
--
-- แพตเทิร์น CHECK additive (เหมือน 20261027100600): อ่านค่าเดิมจาก pg_get_constraintdef แล้วต่อท้าย — ไม่ hardcode ทับ
--   guard: นิยามเดิมมี SERVICE_FINISHED แล้ว = ข้าม (รันซ้ำได้) · quote-count ไม่ตรง = ล้มเสียงดัง
--   fallback (ไม่มี constraint) = 5 ค่าเดิม (ยืนยันจาก 20261017100100:27,42 · 20261017100200:21) + 'SERVICE_FINISHED'
-- AutoNotify* เป็นตารางเล็ก/กลาง (ledger โตตามข้อความที่ส่ง) · lock_timeout กันค้างคิว
-- rollback: ห้ามหด CHECK หลังมีแถว SERVICE_FINISHED แล้ว (DATABASE §5.2)
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t             text;
  cname         text;
  def           text;
  vals          text;
  matched_count int;
  quote_count   int;
BEGIN
  FOREACH t IN ARRAY ARRAY['AutoNotifySwitch', 'AutoNotifyTemplate', 'AutoNotifyLedger'] LOOP
    cname := t || '_kind_check';  -- AutoNotifySwitch_kind_check · AutoNotifyTemplate_kind_check · AutoNotifyLedger_kind_check

    SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint
    WHERE conname = cname
      AND conrelid = format('%I', t)::regclass;

    IF def IS NULL THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I CHECK ("kind" IN (''ORDER_SUMMARY'', ''TRACKING'', ''SERVICE_BOOKED'', ''SERVICE_STARTED'', ''SERVICE_CLOSED'', ''SERVICE_FINISHED'')) NOT VALID',
        t, cname
      );
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', t, cname);

    ELSIF position('SERVICE_FINISHED' IN def) = 0 THEN
      SELECT string_agg(quote_literal(m[1]), ', '), count(*)
      INTO vals, matched_count
      FROM regexp_matches(def, '''([A-Za-z0-9_]+)''', 'g') AS m;

      quote_count := (length(def) - length(replace(def, '''', '')));
      IF matched_count IS NULL OR matched_count * 2 <> quote_count THEN
        RAISE EXCEPTION
          '%: regex จับค่าได้ % รายการ แต่พบ quote ในนิยามเดิม % ตัว (ต้องเป็น matched*2) — def=%',
          cname, matched_count, quote_count, def;
      END IF;

      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', t, cname);
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I CHECK ("kind" = ANY (ARRAY[%s, ''SERVICE_FINISHED'']::text[])) NOT VALID',
        t, cname, vals
      );
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', t, cname);
    END IF;
  END LOOP;
END $$;
