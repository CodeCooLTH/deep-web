-- Migration: add_shop_trustscore | Feature: 00008 Business Account & Packages, Phase 5 (P5-3a)
-- SSOT: docs/superpowers/specs/2026-07-03-00008-phase5-business-reputation-design.md §P5-3
-- SAFETY: additive only — new columns, NOT NULL with DEFAULT 0 (existing Shop rows get trustScore=0
-- automatically, no NULL/no data loss). ไม่ backfill: business shop เริ่ม trustScore=0 → คำนวณจริงโดย
-- recalculateShopTrustScore(shopId) (service layer, P5-3b). ไม่แตะ User.trustScore เดิม (personal shop
-- ยังคำนวณ/แสดงผ่าน User.trustScore ตามเดิม — zero-regression)
--
-- NULL TrustScoreHistory.shopId = user-level history เดิม (backward-compat); non-NULL = ผูก Business shop

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN "trustScore" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TrustScoreHistory" ADD COLUMN "shopId" TEXT;

-- CreateIndex
CREATE INDEX "TrustScoreHistory_shopId_idx" ON "TrustScoreHistory"("shopId");

-- AddForeignKey
-- ON DELETE CASCADE: business shop ถูกลบ (hard-delete) → history ของ business นั้นไม่มีความหมายอีกต่อไป
-- (mirror UserBadge.shopId pattern — achievement/score history ผูกกับตัว shop โดยตรง)
ALTER TABLE "TrustScoreHistory" ADD CONSTRAINT "TrustScoreHistory_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ROLLBACK (safe เสมอ ไม่มี data loss เพราะ Shop.trustScore เป็น default 0 ล้วนที่ยังไม่มี logic อื่นอ่าน
-- จนกว่า P5-3b service จะ ship, และ TrustScoreHistory.shopId เป็น nullable ล้วน):
--   ALTER TABLE "TrustScoreHistory" DROP CONSTRAINT "TrustScoreHistory_shopId_fkey";
--   DROP INDEX "TrustScoreHistory_shopId_idx";
--   ALTER TABLE "TrustScoreHistory" DROP COLUMN "shopId";
--   ALTER TABLE "Shop" DROP COLUMN "trustScore";
