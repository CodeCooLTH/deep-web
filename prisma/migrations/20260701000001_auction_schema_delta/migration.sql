-- Feature 00002 (Seller Auction) — Migration 1: auction_schema_delta
-- SSOT: docs/20 - Features/00002 - Seller Auction/DATABASE.md §2.1, §4 (Migration 1), §7, §8.2
-- ทุกคอลัมน์ใหม่ nullable หรือมี DEFAULT → additive-only, ไม่มี data loss, ไม่ต้อง backfill

-- AlterTable
ALTER TABLE "Auction"
  ADD COLUMN     "description" TEXT,
  ADD COLUMN     "startTime" TIMESTAMP(3),
  ADD COLUMN     "reservePrice" DECIMAL(12,2),
  ADD COLUMN     "buyNowPrice" DECIMAL(12,2),
  ADD COLUMN     "antiSnipeCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "cancelledAt" TIMESTAMP(3),
  ADD COLUMN     "expectedPrice" DECIMAL(12,2);

-- CreateIndex (DATABASE.md §7 — chip filter / seller list / scheduled→live lazy-cron)
-- หมายเหตุ: "Auction_status_idx" ซ้ำซ้อนบางส่วนกับ "Auction_status_endTime_idx" ที่มีอยู่แล้ว
-- (composite (status, endTime) ครอบคลุม query filter เฉพาะ status ได้ในระดับ leading column)
-- แต่ยังสร้างตามที่ DATABASE.md §7 ระบุชัดเจน — ต้นทุน index เพิ่มเล็กน้อย ไม่ destructive
CREATE INDEX "Auction_status_idx" ON "Auction"("status");
CREATE INDEX "Auction_shopId_status_idx" ON "Auction"("shopId", "status");
CREATE INDEX "Auction_startTime_idx" ON "Auction"("startTime");

-- AddCheckConstraint (DATABASE.md §8.2)
-- ROLLBACK NOTE: DROP CONSTRAINT ทั้งหมดด้านล่างด้วยชื่อเดียวกัน (ดู DATABASE.md §12)
-- ความเสี่ยง: "Auction_startPrice_positive" / "Auction_currentPrice_nonneg" / "Auction_bidIncrement_positive"
-- ตรวจกับคอลัมน์ที่มีอยู่แล้ว (มีข้อมูลเดิม) — ถ้าแถวเก่าละเมิดกฎ (ไม่ควรเกิดเพราะ app-layer บังคับมาตลอด)
-- ALTER TABLE จะ FAIL ทั้ง migration — Controller ควรรัน SELECT ตรวจก่อน approve (ดู flag ท้ายรายงาน)
ALTER TABLE "Auction"
  ADD CONSTRAINT "Auction_startPrice_positive" CHECK ("startPrice" > 0),
  ADD CONSTRAINT "Auction_currentPrice_nonneg" CHECK ("currentPrice" >= 0),
  ADD CONSTRAINT "Auction_bidIncrement_positive" CHECK ("bidIncrement" > 0),
  ADD CONSTRAINT "Auction_antiSnipeCount_range" CHECK ("antiSnipeCount" >= 0 AND "antiSnipeCount" <= 5),
  ADD CONSTRAINT "Auction_reservePrice_gte_startPrice" CHECK ("reservePrice" IS NULL OR "reservePrice" >= "startPrice"),
  ADD CONSTRAINT "Auction_buyNowPrice_gt_zero" CHECK ("buyNowPrice" IS NULL OR "buyNowPrice" > 0),
  ADD CONSTRAINT "Auction_expectedPrice_gt_zero" CHECK ("expectedPrice" IS NULL OR "expectedPrice" > 0);
