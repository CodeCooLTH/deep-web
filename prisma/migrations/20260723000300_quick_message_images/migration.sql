-- QuickMessage: รองรับรูปแนบหลายรูป (feature 00018 — user สั่ง 2026-07-23 "ใส่รูปได้มากกว่า 1")
-- hand-written (DB dev=prod แชร์กัน — ห้าม migrate dev, ใช้ migrate deploy) ดู docs/conventions/prisma-shared-db-drift.md
--
-- additive ล้วน + backfill: คอลัมน์เดิม imageFileId ยังอยู่ (deprecated) เพื่อให้ deploy ไม่มีช่วง
-- ที่โค้ดเก่าอ่านไม่ได้ — service เขียนทั้งสองคอลัมน์ (imageFileId = รูปแรก) จนกว่าจะถอดทีหลัง

ALTER TABLE "QuickMessage" ADD COLUMN "imageFileIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ย้ายรูปเดิม 1 รูป → อาร์เรย์ (แถวที่ไม่มีรูปคงเป็นอาร์เรย์ว่างตาม default)
UPDATE "QuickMessage"
SET "imageFileIds" = ARRAY["imageFileId"]
WHERE "imageFileId" IS NOT NULL AND cardinality("imageFileIds") = 0;
