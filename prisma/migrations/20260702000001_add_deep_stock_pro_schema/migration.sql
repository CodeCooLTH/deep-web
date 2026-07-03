-- Migration: add_deep_stock_pro_schema | Feature: M00009-DeepStockPro | drafted 2026-07-02
-- SAFETY: additive only ทุก column ใหม่ nullable หรือมี DEFAULT ที่ backfill แถวเดิมในตัว
-- InventoryEntitlement/Product มี row จริงบน prod แล้ว → package ใช้ DEFAULT (metadata-only),
-- lowStockThreshold ใช้ NOT VALID + VALIDATE (เหมือน stockQty ของ M00003)
-- ROLLBACK: ดู docs/20 - Features/00009 - Deep Stock Pro/DATABASE.md §5.4 —
-- StockMovement/lowStockThreshold rollback = DATA LOSS ถ้ามี data จริงแล้ว

-- 1) InventoryEntitlement.package (enum + column พร้อม default = backfill ในตัว)
CREATE TYPE "InventoryPackage" AS ENUM ('BASIC', 'PRO');

ALTER TABLE "InventoryEntitlement"
    ADD COLUMN "package" "InventoryPackage" NOT NULL DEFAULT 'BASIC';

CREATE INDEX "InventoryEntitlement_status_package_idx"
    ON "InventoryEntitlement"("status", "package");

-- 2) StockMovement (table ใหม่)
CREATE TYPE "StockMovementSource" AS ENUM ('ORDER_DEDUCT', 'ORDER_RESTOCK', 'MANUAL_ADJUST');

CREATE TABLE "StockMovement" (
    "id"            TEXT NOT NULL,
    "shopId"        TEXT NOT NULL,
    "productId"     TEXT,
    "productName"   TEXT NOT NULL,
    "delta"         INTEGER NOT NULL,
    "resultingQty"  INTEGER NOT NULL,
    "source"        "StockMovementSource" NOT NULL,
    "refId"         TEXT,
    "note"          TEXT,
    "actorUserId"   TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");
CREATE INDEX "StockMovement_shopId_createdAt_idx" ON "StockMovement"("shopId", "createdAt");
CREATE INDEX "StockMovement_shopId_source_idx" ON "StockMovement"("shopId", "source");

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- กัน delta=0 สร้าง log ปลอม (ไม่มี movement จริง)
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_delta_nonzero" CHECK ("delta" <> 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_resultingQty_nonneg" CHECK ("resultingQty" >= 0);
-- table ใหม่ว่าง → ไม่ต้อง NOT VALID/VALIDATE แยก (ต่างจาก Product/InventoryEntitlement ที่มี row จริง)

-- 3) Product.lowStockThreshold
ALTER TABLE "Product" ADD COLUMN "lowStockThreshold" INTEGER;

ALTER TABLE "Product" ADD CONSTRAINT "Product_lowStockThreshold_nonneg"
    CHECK ("lowStockThreshold" IS NULL OR "lowStockThreshold" >= 0) NOT VALID;
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_lowStockThreshold_nonneg";

-- 4) WalletTransaction: ไม่มี DDL — reuse reason/description เดิม (ดู DATABASE.md §3.4)
