-- ข้อความสำเร็จรูป: ลำดับที่ร้านจัดเอง (user request 2026-07-30 "อยากลากสลับลำดับได้")
-- เดิมเรียงตาม category+createdAt เท่านั้น ร้านเอาอันที่ใช้บ่อยขึ้นก่อนไม่ได้เลย
ALTER TABLE "QuickMessage" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- backfill: ให้ลำดับเริ่มต้นตรงกับ "ที่เห็นอยู่ตอนนี้" (category asc, createdAt desc)
-- ไม่ตั้ง 0 ทั้งหมด ไม่งั้นพอเปลี่ยนไปเรียงด้วย sortOrder ลำดับที่ร้านคุ้นตาจะสลับมั่วทันทีที่ deploy
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "shopId" ORDER BY "category" ASC NULLS FIRST, "createdAt" DESC
  ) AS rn
  FROM "QuickMessage"
)
UPDATE "QuickMessage" q SET "sortOrder" = ranked.rn
FROM ranked WHERE q."id" = ranked."id";

-- index สำหรับ list ต่อร้านตามลำดับใหม่
CREATE INDEX "QuickMessage_shopId_sortOrder_idx" ON "QuickMessage"("shopId", "sortOrder");
