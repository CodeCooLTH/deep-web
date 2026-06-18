-- Feature: M00001-LoginOnboarding | DATABASE.md §5
-- Additive only (ไม่มี DROP / ALTER column เดิม)
--   Shop.categories/salesChannels: TEXT[] DEFAULT '{}' → row เดิมได้ empty array ทันที
--   Shop.latitude/longitude, Product.sku: nullable → row เดิมได้ NULL
-- ROLLBACK: DROP COLUMN ทีละตัว (data loss เฉพาะข้อมูลใหม่หลัง apply); category เดิมยังอยู่

-- Shop: multi-category (FR-LO-08, OD-4) + sales channels (FR-LO-07) + map pin (FR-LO-09, OD-1)
ALTER TABLE "Shop" ADD COLUMN "categories" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Shop" ADD COLUMN "salesChannels" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Shop" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Shop" ADD COLUMN "longitude" DOUBLE PRECISION;

-- Product: SKU (FR-LO-10)
ALTER TABLE "Product" ADD COLUMN "sku" TEXT;

-- GIN indexes สำหรับ array filter (analytics/search) — Prisma ไม่ generate GIN ให้ String[] เอง
CREATE INDEX "Shop_categories_gin_idx" ON "Shop" USING GIN ("categories");
CREATE INDEX "Shop_salesChannels_gin_idx" ON "Shop" USING GIN ("salesChannels");

-- Backfill: ย้าย category เดิม (single string) → categories array; ไม่ DROP category ในเฟสนี้
UPDATE "Shop" SET "categories" = ARRAY["category"] WHERE "category" IS NOT NULL;
