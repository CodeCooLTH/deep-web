-- AlterTable: Badge
-- (1) เพิ่ม column "audience" — NOT NULL with DEFAULT 'SELLER'
--     ปลอดภัยสำหรับ row เดิมทั้งหมด: ได้รับค่า 'SELLER' โดยอัตโนมัติ, ไม่ต้อง backfill แยก
ALTER TABLE "Badge" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'SELLER';

-- (2) DROP NOT NULL บน "icon" — Prisma จัดการผ่าน ALTER COLUMN
--     ค่าที่มีอยู่ (emoji strings) คงอยู่ ไม่มี data loss
ALTER TABLE "Badge" ALTER COLUMN "icon" DROP NOT NULL;

-- (3) UNIQUE constraint บน "nameEN" — business rule: ห้ามมี badge nameEN ซ้ำ
--     ก่อน apply ต้องไม่มี duplicate nameEN ในตาราง (seed ที่ผ่านมาไม่มี duplicate)
CREATE UNIQUE INDEX "Badge_nameEN_key" ON "Badge"("nameEN");

-- Data migration: badge "Fully Verified" เป็น VERIFICATION badge ที่ใช้ได้กับทุก user
-- ไม่ใช่ seller-only → ตั้ง audience = 'ANY'
-- Badge อื่นอีก 9 ตัวคงค่า DEFAULT 'SELLER' ไว้ (First Sale, Trusted Seller 50,
-- Century Club, Perfect Rating, Highly Rated, Zero Complaint, Veteran,
-- Speed Demon, Community Favorite)
UPDATE "Badge" SET "audience" = 'ANY' WHERE "nameEN" = 'Fully Verified';
