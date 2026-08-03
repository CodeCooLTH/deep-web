-- feat 00028 Shop Business Type — Migration (P1)
-- ขอบเขต: ขยาย Shop.vertical จาก 2 ค่า (GENERAL/LODGING) เป็น 3 ค่า
--         (ONLINE_SALES/SERVICE_QUEUE/LODGING) + backfill ร้านเดิมทั้งหมด + CHECK constraint
--
-- hand-written (shared dev/prod DB — ห้าม prisma migrate dev/db push/db pull; ดู
-- docs/conventions/prisma-shared-db-drift.md, memory project_shared_db_drift_no_migrate_dev)
-- อ้างอิง: docs/20 - Features/00028 - Shop Business Type/DATABASE.md §5
--
-- 🛑 ก่อนรันไฟล์นี้ Controller ต้อง SELECT snapshot ตาม DATABASE.md §5.2 (Pre-flight) ก่อนเสมอ
-- (BR-SBT-04) — ไฟล์นี้มีแต่ DDL/DML ไม่มี SELECT เพราะ `prisma migrate deploy` ไม่คืนผลลัพธ์
-- query ให้เห็น (execute ผ่าน node-postgres ล้วน ๆ)
--
-- ความปลอดภัย:
--   - ไม่ลบแถวข้อมูลใด ๆ ทั้งสิ้น (BR-SBT-03, Hard Rule โครงการ) — มีแค่ ALTER COLUMN/UPDATE/ADD CONSTRAINT
--   - ไม่แตะ Shop ที่ vertical='LODGING' เลย (BR-SBT-02 — เดิมมี 0 แถวในฐาน ณ วันที่เขียน แต่เงื่อนไข
--     UPDATE ผูกกับ vertical='GENERAL' เท่านั้น จึงไม่แตะ LODGING ไม่ว่ากรณีใด)
--   - ไม่แตะ ServiceResource / Order แม้แต่คอลัมน์เดียว — ข้อมูลกำพร้าที่เกิดจาก backfill (ร้านที่มี
--     ServiceResource ผูกอยู่) ยังอยู่ครบ 100% (BR-SBT-04/05, FR-SBT-11) เพียงแต่เข้าถึงผ่าน UI ไม่ได้
--     อีกต่อไปเพราะเมนู "คิวงาน" gate ด้วย vertical='SERVICE_QUEUE' (แก้ที่ src/lib/seller-menu.ts
--     แยกต่างหาก ไม่ใช่ scope ของไฟล์นี้)
--   - CHECK ใช้ NOT VALID แล้ว VALIDATE แยกคำสั่ง (pattern เดียวกับ Shop_pinSlots_min1 migration
--     20260704095036) เพราะตาราง Shop มีข้อมูลจริงบน prod (10 users, 6 shop vertical='GENERAL')

-- ---------------------------------------------------------------------------
-- 1) เปลี่ยนค่า default ของคอลัมน์ที่มีอยู่แล้ว
-- ---------------------------------------------------------------------------
-- ร้านใหม่ที่ไม่ระบุ vertical ตอนสร้าง จะได้ 'ONLINE_SALES' แทน 'GENERAL' เดิม (BR-SBT-07)
-- ALTER COLUMN SET DEFAULT เป็น metadata-only ไม่แตะแถวเดิมแม้แต่แถวเดียว — ต้อง backfill แยกที่ข้อ 2
-- เพื่อย้ายแถวเดิมที่มีอยู่แล้ว (SET DEFAULT ไม่มีผลย้อนหลังกับแถวที่มีอยู่)
ALTER TABLE "Shop" ALTER COLUMN "vertical" SET DEFAULT 'ONLINE_SALES';

-- ---------------------------------------------------------------------------
-- 2) Backfill ร้านเดิมทั้งหมดที่ vertical='GENERAL' → 'ONLINE_SALES' (BR-SBT-01, FR-SBT-10)
-- ---------------------------------------------------------------------------
-- เหมารวมทุกแถวแบบไม่มี heuristic แยกแยะ แม้ร้านนั้นจะมี ServiceResource ผูกอยู่จริงก็ตาม
-- (ยืนยันจาก PRD §3.3 / BRD BR-SBT-01 — การพยายามแยกร้าน hybrid อัตโนมัติเสี่ยงเดาผิดมากกว่า)
-- statement นี้แตะเฉพาะคอลัมน์ "vertical" ของ "Shop" เท่านั้น ไม่มี JOIN ไปตารางอื่น ไม่มี DELETE
UPDATE "Shop" SET "vertical" = 'ONLINE_SALES' WHERE "vertical" = 'GENERAL';

-- ---------------------------------------------------------------------------
-- 3) CHECK constraint จำกัดค่าที่ยอมรับของ Shop.vertical (defense-in-depth, ใหม่ในงานนี้)
-- ---------------------------------------------------------------------------
-- feature 00017 (migration 20260722000000) ไม่เคยเพิ่ม CHECK ให้คอลัมน์นี้มาก่อน (มีแค่ default) —
-- งานนี้เพิ่มให้เพราะตอนนี้มีค่าที่ถูกต้อง 3 ค่าเป๊ะ ๆ และ string literal 'GENERAL' เดิมกำลังถูก
-- grep ออกจากทั้ง repo (BR-SBT-20) การมี CHECK ช่วยกัน literal หลุดเข้ามาใหม่โดยไม่ตั้งใจในอนาคต
-- ต้องรันหลังข้อ 2 เท่านั้น มิฉะนั้นแถว 'GENERAL' ที่ยังไม่ backfill จะทำให้ VALIDATE ล้มเหลว (23514)
-- 🛑 Prisma DSL ประกาศ CHECK ไม่ได้ (unmanaged SQL เหมือน Shop_pinSlots_min1, Room_price_positive
-- ฯลฯ) — ห้าม `prisma db pull` เด็ดขาด มิฉะนั้น introspection จะไม่เห็น constraint นี้แล้ว migration
-- ถัดไปอาจ DROP ทิ้งโดยไม่ตั้งใจ (ดู memory project_shared_db_drift_no_migrate_dev)
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_vertical_check"
    CHECK ("vertical" IN ('ONLINE_SALES', 'SERVICE_QUEUE', 'LODGING')) NOT VALID;

ALTER TABLE "Shop" VALIDATE CONSTRAINT "Shop_vertical_check";

-- ---------------------------------------------------------------------------
-- หมายเหตุ: "Shop_vertical_idx" (btree index บนคอลัมน์นี้) มีอยู่แล้วจาก feature 00017
-- (migration 20260722000000) — ไฟล์นี้ไม่ต้องสร้างซ้ำ ยังใช้ได้กับค่าใหม่ทั้ง 3 ค่าโดยไม่ต้องแก้ไข
-- ---------------------------------------------------------------------------
