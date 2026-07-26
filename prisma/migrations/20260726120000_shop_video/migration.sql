-- ShopVideo — คลิปที่ร้านเลือกโชว์บนหน้าร้านสาธารณะ (2026-07-26)
--
-- ร้านเลือกจากคลิปของบัญชีตัวเองที่ระบบดึงมาให้ ไม่ได้วาง URL เอง จึงการันตีความเป็นเจ้าของ
-- เก็บเฉพาะ id ของคลิป ไม่เก็บ URL ดิบ — URL ฝังประกอบขึ้นใหม่ที่ชั้นแสดงผลเสมอ
--
-- เขียนด้วยมือตาม docs/conventions/prisma-shared-db-drift.md (DB dev/prod ตัวเดียวกัน
-- และมี unmanaged SQL ที่ introspection มองไม่เห็นแล้วจะสร้าง migration ที่ DROP ทิ้ง)
CREATE TABLE "ShopVideo" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "caption" TEXT,
    "thumbnailUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopVideo_pkey" PRIMARY KEY ("id")
);

-- กันเลือกคลิปเดิมซ้ำในร้านเดียวกัน
CREATE UNIQUE INDEX "ShopVideo_shopId_provider_videoId_key" ON "ShopVideo"("shopId", "provider", "videoId");

-- ดึงตามลำดับที่ร้านจัดไว้
CREATE INDEX "ShopVideo_shopId_sortOrder_idx" ON "ShopVideo"("shopId", "sortOrder");

-- ลบร้าน = คลิปที่ผูกไว้ไม่มีความหมายอีกต่อไป
ALTER TABLE "ShopVideo" ADD CONSTRAINT "ShopVideo_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
