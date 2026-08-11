-- CR 2026-08-11 — ถูกใจสินค้าบนหน้าร้านสาธารณะ
-- docs/20 - Features/00035 - Shop Page Builder/EXTENSIONS-2026-08-11-product-likes.md
--
-- additive ล้วน: เพิ่มคอลัมน์ที่มี DEFAULT และตารางใหม่ ไม่แตะข้อมูลเดิมเลย
-- (ไม่มี CHECK constraint แบบรายชื่อ จึงไม่เข้าเคสที่ต้องอ่านของเดิมมาต่อท้าย —
--  docs/conventions/migration-check-constraint-additive.md)

ALTER TABLE "Product" ADD COLUMN "likeCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ProductLike" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "deviceKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductLike_pkey" PRIMARY KEY ("id")
);

-- BR-LIKE-01 — กันกดซ้ำที่ระดับฐาน ไม่ใช่ที่แอป (กดรัวยังชนกันได้)
CREATE UNIQUE INDEX "ProductLike_productId_deviceKey_key" ON "ProductLike"("productId", "deviceKey");
CREATE INDEX "ProductLike_productId_idx" ON "ProductLike"("productId");

ALTER TABLE "ProductLike" ADD CONSTRAINT "ProductLike_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
