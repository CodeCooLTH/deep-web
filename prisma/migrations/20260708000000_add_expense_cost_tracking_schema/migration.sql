-- Migration: add_expense_cost_tracking_schema | Feature: M00016-ExpenseCostTracking | 2026-07-08
-- hand-written (shared dev/prod DB — ห้าม prisma migrate dev; ดู docs/conventions/prisma-shared-db-drift.md)
-- SAFETY: additive only — table ใหม่ 1 ตัว (Expense) + column ใหม่ nullable/DEFAULT บน
-- Product/OrderItem/Shop + index ใหม่บน Order/OrderItem — ไม่แตะ column/table เดิมแม้แต่จุดเดียว
-- Product/OrderItem มี row จริงบน prod (เหมือน feature 00003/00013) → cost ใช้ NOT VALID + VALIDATE CHECK
-- Shop.staffCanViewFinance NOT NULL DEFAULT false — metadata-only, ครอบร้านเดิมทุกแถวอัตโนมัติ (เหมือน pinSlots)
-- ดู DATABASE.md §6.2/§6.4 สำหรับ rollback SQL ต่อ step (Product.cost/OrderItem.cost rollback = data loss)

-- 1) Product.cost
ALTER TABLE "Product" ADD COLUMN "cost" DECIMAL(12,2);
ALTER TABLE "Product" ADD CONSTRAINT "Product_cost_nonneg"
    CHECK ("cost" IS NULL OR "cost" >= 0) NOT VALID;
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_cost_nonneg";

-- 2) OrderItem.cost + index ใหม่ (FK ไม่เคยมี index มาก่อนตั้งแต่ init migration — debt เดิมที่
--    ฟีเจอร์นี้ต้องปิดเพื่อให้ COGS query ไม่ sequential scan ทั้งตาราง)
ALTER TABLE "OrderItem" ADD COLUMN "cost" DECIMAL(12,2);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_cost_nonneg"
    CHECK ("cost" IS NULL OR "cost" >= 0) NOT VALID;
ALTER TABLE "OrderItem" VALIDATE CONSTRAINT "OrderItem_cost_nonneg";
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- 3) Order — composite index สำหรับ P&L Revenue query (ยังไม่เคยมี — dashboard.service.ts เดิม
--    query pattern เดียวกันแต่ไม่มี index รองรับมาตั้งแต่ launch)
CREATE INDEX "Order_shopId_status_createdAt_idx" ON "Order"("shopId", "status", "createdAt");

-- 4) Shop.staffCanViewFinance
ALTER TABLE "Shop" ADD COLUMN "staffCanViewFinance" BOOLEAN NOT NULL DEFAULT false;

-- 5) Expense (ใหม่)
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Expense_amount_positive" CHECK ("amount" > 0)
);

CREATE INDEX "Expense_shopId_expenseDate_idx" ON "Expense"("shopId", "expenseDate");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
