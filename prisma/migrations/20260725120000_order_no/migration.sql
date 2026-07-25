-- เลขคำสั่งซื้ออ่านง่าย orderNo (user request 2026-07-25) — `DP` + ปีพ.ศ. + เดือน + publicToken 8 หลัก
-- additive ล้วน (คอลัมน์ nullable + index ธรรมดา) — ปลอดภัยกับ shared DB dev=prod
-- deterministic (จาก publicToken + createdAt) → ไม่มี counter/lock/race; index ไม่ unique (เป็นป้าย ไม่ใช่ identity)

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "orderNo" TEXT;

-- CreateIndex
CREATE INDEX "Order_orderNo_idx" ON "Order"("orderNo");
