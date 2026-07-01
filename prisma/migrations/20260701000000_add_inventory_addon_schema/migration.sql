-- Migration: add_inventory_addon_schema | Feature: M00003-InventoryAddon | 2026-07-01
-- SAFETY: additive only ทุก column ใหม่ nullable, table ใหม่ไม่กระทบ table เดิม
-- Product/OrderItem มี row จริงบน prod แล้ว (ต่างจาก SellerWallet ตอนสร้าง) → ใช้ NOT VALID + VALIDATE CONSTRAINT
-- ROLLBACK: ดูตาราง §5.4 ของ DATABASE.md — Product.stockQty/OrderItem.stockDeducted rollback = DATA LOSS

-- 1) Enum + table ใหม่
-- CreateEnum
CREATE TYPE "InventoryEntitlementStatus" AS ENUM ('ACTIVE', 'LOCKED');

-- CreateTable
CREATE TABLE "InventoryEntitlement" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "status" "InventoryEntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "activatedAt" TIMESTAMP(3) NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "nextRenewalAt" TIMESTAMP(3) NOT NULL,
    "lastRenewalAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryEntitlement_shopId_key" ON "InventoryEntitlement"("shopId");

-- CreateIndex
CREATE INDEX "InventoryEntitlement_status_nextRenewalAt_idx" ON "InventoryEntitlement"("status", "nextRenewalAt");

-- AddForeignKey
ALTER TABLE "InventoryEntitlement" ADD CONSTRAINT "InventoryEntitlement_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Product.stockQty
-- AlterTable
ALTER TABLE "Product" ADD COLUMN "stockQty" INTEGER;

-- CreateIndex
CREATE INDEX "Product_shopId_stockQty_idx" ON "Product"("shopId", "stockQty");

-- NOT VALID ก่อน (fast, ไม่สแกน) แล้ว VALIDATE แยก (SHARE UPDATE EXCLUSIVE, ไม่บล็อก write) — Product มี row จริงบน prod
ALTER TABLE "Product" ADD CONSTRAINT "Product_stockQty_nonneg"
    CHECK ("stockQty" IS NULL OR "stockQty" >= 0) NOT VALID;
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_stockQty_nonneg";

-- 3) OrderItem.stockDeducted
-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "stockDeducted" INTEGER;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_stockDeducted_nonneg"
    CHECK ("stockDeducted" IS NULL OR "stockDeducted" >= 0) NOT VALID;
ALTER TABLE "OrderItem" VALIDATE CONSTRAINT "OrderItem_stockDeducted_nonneg";

-- 4) WalletTransaction.reason
-- AlterTable
ALTER TABLE "WalletTransaction" ADD COLUMN "reason" TEXT;

-- CreateIndex
CREATE INDEX "WalletTransaction_reason_idx" ON "WalletTransaction"("reason");

-- 5) Backfill (ปลอดภัยเพราะก่อนหน้านี้ DEDUCT มาจาก SMS Order Link เท่านั้น)
UPDATE "WalletTransaction" SET "reason" = 'SMS_ORDER_LINK' WHERE "type" = 'DEDUCT' AND "reason" IS NULL;
