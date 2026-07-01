-- Feature 00002 (Seller Auction) — Migration 2: user_bid_level
-- SSOT: docs/20 - Features/00002 - Seller Auction/DATABASE.md §2.2, §4 (Migration 2), §5.1, §8.2
-- Additive-only: column ใหม่ NOT NULL DEFAULT 0 (แถวเดิมทั้งหมดได้ค่า 0 อัตโนมัติ) + backfill UPDATE จากประวัติ Order จริง

-- AlterTable
ALTER TABLE "User" ADD COLUMN "successfulBidCount" INTEGER NOT NULL DEFAULT 0;

-- AddCheckConstraint (DATABASE.md §8.2)
-- ROLLBACK NOTE: ALTER TABLE "User" DROP CONSTRAINT "User_successfulBidCount_nonneg";
ALTER TABLE "User" ADD CONSTRAINT "User_successfulBidCount_nonneg" CHECK ("successfulBidCount" >= 0);

-- Backfill: นับ "bid สำเร็จ" = ชนะ auction (Order.auctionId IS NOT NULL) ที่ Order ไม่ถูกยกเลิก
-- (DATABASE.md §4 Migration 2 + §5.1 นิยาม "bid สำเร็จ"). one-shot UPDATE ครั้งเดียวตอน migrate
-- (ไม่ใช่ trigger-based — ตรงตาม SQL ที่ DATABASE.md §4 ระบุไว้เป๊ะ)
UPDATE "User" u SET "successfulBidCount" = (
  SELECT COUNT(*) FROM "Order" o
  WHERE o."buyerUserId" = u.id AND o."auctionId" IS NOT NULL AND o.status NOT IN ('CANCELLED')
) WHERE EXISTS (
  SELECT 1 FROM "Order" o2 WHERE o2."buyerUserId" = u.id AND o2."auctionId" IS NOT NULL
);
