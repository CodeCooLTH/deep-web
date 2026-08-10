-- feature 00041 — Buyer Order Experience: คำตอบร้าน + รูปแนบ + soft-delete รีวิว
--
-- additive ล้วน: เพิ่ม 6 คอลัมน์ (ทุกตัว nullable หรือมี DEFAULT) + 1 FK (onDelete SET NULL)
-- + 2 index — ไม่มี backfill, ไม่มี UPDATE, ไม่มี DROP, ไม่แตะแถวเดิมเลย
-- ⇒ โค้ดเวอร์ชันก่อนหน้ารันกับ schema นี้ได้ปกติ (นี่คือเหตุผลที่ PR นี้แยก deploy ก่อนโค้ดได้)
--
-- ยืนยันกับ prod แล้ว 2026-08-10: Review มี 1 แถวทั้งระบบ ⇒ ไม่มีความเสี่ยง long-lock/data-loss
--
-- 🛑 deletedAt เป็น soft-delete ที่ "ต้องมี" ไม่ใช่ทางเลือกเชิงสไตล์:
--    canEditReview() นับหน้าต่าง 24 ชม. จาก Review.createdAt — ถ้า hard-delete แล้วสร้างใหม่ได้
--    แถวใหม่จะได้ createdAt ใหม่ = จับเวลาเริ่มนับใหม่ ⇒ ลบ-สร้างใหม่ทุก 23 ชม. ก็แก้รีวิวได้
--    ตลอดกาล ซึ่งทำลาย BR-BOE-17 ทั้งข้อ (ดู SRS §8)

ALTER TABLE "Review"
  ADD COLUMN IF NOT EXISTS "images"              JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "shopReplyComment"     TEXT,
  ADD COLUMN IF NOT EXISTS "shopRepliedAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "shopRepliedByUserId"  TEXT,
  ADD COLUMN IF NOT EXISTS "deletedAt"            TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- FK: ผู้ตอบรีวิวคือ Shop.userId (เจ้าของ) หรือ ShopMember(role='ADMIN') — บังคับสิทธิ์จริงที่
-- service layer ผ่าน canAccessShop() (BR-BOE-21); FK นี้รับประกันแค่ referential integrity
--
-- onDelete SET NULL มิเรอร์ Order.createdByUserId / OrderEvent.actorUserId ที่มีอยู่แล้ว:
-- ลบบัญชีพนักงานออกจากร้าน คำตอบที่เคยตอบไว้ต้องไม่หายตาม (เป็นประวัติสาธารณะของร้าน
-- ที่ผู้ซื้อคนอื่นใช้ประกอบการตัดสินใจ ไม่ใช่ข้อมูลส่วนตัวของพนักงานคนนั้น)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Review_shopRepliedByUserId_fkey'
      AND conrelid = '"Review"'::regclass
  ) THEN
    ALTER TABLE "Review"
      ADD CONSTRAINT "Review_shopRepliedByUserId_fkey"
      FOREIGN KEY ("shopRepliedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- index 1: รีวิวของผู้ซื้อคนนี้ที่ยังไม่ถูกลบ — getReviewsByBuyer() + count ที่
-- m/settings/profile:96 และ (buyer-app)/dashboard:62 ซึ่งทุกจุดจะเติม deletedAt: null
-- ตอน implement TFR-009 (DATABASE.md §8.1)
-- หมายเหตุ: Review ไม่เคยมี index บน reviewerUserId เลย แม้ query จะกรองด้วยคอลัมน์นี้มาตั้งแต่แรก
CREATE INDEX IF NOT EXISTS "Review_reviewerUserId_deletedAt_idx"
  ON "Review" ("reviewerUserId", "deletedAt");

-- index 2: กัน full table scan ตอนลบบัญชีพนักงาน/เจ้าของร้าน (onDelete SET NULL ต้องหาแถวลูก)
-- pattern เดียวกับ OrderEvent @@index([actorUserId]) ที่มีอยู่แล้ว
CREATE INDEX IF NOT EXISTS "Review_shopRepliedByUserId_idx"
  ON "Review" ("shopRepliedByUserId");
