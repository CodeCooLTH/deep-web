-- Migration: add_pin_products_schema | Feature: M00012-PinProducts | 2026-07-04
-- SAFETY: additive only. Shop.pinSlots NOT NULL DEFAULT 1 บน table ที่มี row จริง — Postgres 11+
--   เติม default ให้ทุก row เดิมแบบ metadata-only (ไม่ rewrite table, ไม่ lock ยาว). Product.pinnedAt
--   nullable ไม่มี default — row เดิมได้ NULL (= ไม่ปักหมุด) อัตโนมัติ (zero-regression).

-- 1) Shop.pinSlots — NOT NULL DEFAULT 1 (ครอบร้านเดิมทุกแถวอัตโนมัติ, FR-PIN-01-AC-02)
ALTER TABLE "Shop" ADD COLUMN "pinSlots" INTEGER NOT NULL DEFAULT 1;

-- CHECK NOT VALID (fast, ไม่สแกน) แล้ว VALIDATE แยก (ไม่บล็อก write) — Shop มี row จริงบน prod
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_pinSlots_min1" CHECK ("pinSlots" >= 1) NOT VALID;
ALTER TABLE "Shop" VALIDATE CONSTRAINT "Shop_pinSlots_min1";

-- 2) Product.pinnedAt — nullable, ไม่มี default (NULL = ไม่ปักหมุด)
ALTER TABLE "Product" ADD COLUMN "pinnedAt" TIMESTAMP(3);

-- CreateIndex — query "pinnedAt IS NOT NULL ORDER BY pinnedAt DESC" ต่อ shop (FR-PIN-06)
CREATE INDEX "Product_shopId_pinnedAt_idx" ON "Product"("shopId", "pinnedAt");

-- 3) WalletTransaction.reason — ไม่มี DDL (column TEXT NULL มีอยู่แล้วจาก 00003); ค่า "PIN_SLOT" ใช้ได้ทันที
