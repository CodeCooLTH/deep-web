-- Account deletion (App Store Guideline 5.1.1(v)) — soft-delete ระดับผู้ใช้
--
-- เขียนมือ ไม่ได้ generate จาก `prisma migrate dev` โดยตั้งใจ:
-- Hard Rule 14 ห้ามรันคำสั่งที่ล้าง/สร้าง schema ใหม่ได้ เพราะ dev DB = prod DB ตัวเดียวกัน
-- (`migrate dev` ต้องใช้ shadow database ซึ่ง Prisma drop schema ทิ้งเสมอ — เคยล้าง prod มาแล้ว
--  2026-07-31) ไฟล์นี้มีแต่ ADD COLUMN / CREATE INDEX ซึ่ง additive ล้วน ไม่ทำลายข้อมูลเดิม
-- apply ด้วย `prisma migrate deploy` (vercel.json buildCommand รันให้อยู่แล้ว)
--
-- มิเรอร์คอลัมน์ชุดเดียวกับ Shop.deletedAt/deletedReason/purgedAt

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedReason" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMP(3);

-- cron account-purge สแกน "ถูกลบแล้วแต่ยังไม่ล้าง" ทุกคืน — กัน full-table scan
CREATE INDEX IF NOT EXISTS "User_deletedAt_purgedAt_idx" ON "User" ("deletedAt", "purgedAt");
