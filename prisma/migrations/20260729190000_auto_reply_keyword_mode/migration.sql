-- feature 00023 — โหมดของแต่ละการตั้งค่า (LIVE / TEST)
--
-- เขียนด้วยมือ (ไม่ใช่ `prisma migrate dev`) ตาม docs/conventions/prisma-shared-db-drift.md —
-- DB dev/prod เป็นตัวเดียวกัน apply ด้วย `migrate deploy -e .env.local` เท่านั้น
-- และต้องขอ user ยืนยันก่อนทุกครั้ง (ห้าม `migrate dev`/`db push`/`db pull` เด็ดขาด)
--
-- ทำไมต้องมี: ของเดิมโหมดทดสอบเป็นระดับร้าน (AutoReplyConfig.testMode) เปิดแล้ว "ทุก" การตั้งค่า
-- หยุดตอบลูกค้าจริง ซึ่งอันตรายมากถ้าร้านลืมปิด — แยกเป็นรายรายการทำให้ปล่อยของทีละตัวได้
-- โดยตัวที่ใช้งานจริงอยู่ไม่กระทบ
--
-- additive-safe: DEFAULT 'LIVE' ทำให้แถวเดิมทั้งหมดพฤติกรรมไม่เปลี่ยน ไม่ต้อง backfill
-- rollback: ALTER TABLE "AutoReplyKeyword" DROP COLUMN "mode";

ALTER TABLE "AutoReplyKeyword" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'LIVE';

-- index: gate ตอนประมวลผลโหลด "การตั้งค่าที่เปิดอยู่ของร้าน" แล้วต้องรู้โหมดของแต่ละตัว
-- ต่อท้าย index เดิม [shopId, isActive, priority] ด้วยคอลัมน์ใหม่ เพื่อให้ยัง cover query เดิมได้
CREATE INDEX "AutoReplyKeyword_shopId_isActive_mode_idx"
    ON "AutoReplyKeyword"("shopId", "isActive", "mode");
