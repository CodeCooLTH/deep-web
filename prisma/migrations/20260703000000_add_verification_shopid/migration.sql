-- Migration: add_verification_shopid | Feature: 00008 Business Account & Packages, Phase 5 (P5-1)
-- SSOT: docs/superpowers/specs/2026-07-03-00008-phase5-business-reputation-design.md §3 (P5-1)
-- SAFETY: additive only — new column nullable, no backfill, no touch existing rows.
-- NULL shopId = user/personal-level verification เดิม (backward-compat, zero-regression Personal shop)
-- non-NULL shopId = verification ผูก Business shop โดยตรง (feature 00008 §4/§6.3 kind=BUSINESS)
-- ROLLBACK: DROP CONSTRAINT "VerificationRecord_shopId_fkey"; DROP INDEX "VerificationRecord_shopId_idx";
--           ALTER TABLE "VerificationRecord" DROP COLUMN "shopId"; — safe, ไม่มี data loss เพราะ column
--           เป็น nullable ล้วนและไม่มี logic อื่นอ่าน column นี้จนกว่า P5-1 service layer จะ ship

-- AlterTable
ALTER TABLE "VerificationRecord" ADD COLUMN "shopId" TEXT;

-- CreateIndex
CREATE INDEX "VerificationRecord_shopId_idx" ON "VerificationRecord"("shopId");

-- AddForeignKey
-- ON DELETE SET NULL: ถ้า shop ถูกลบ (soft-delete จริงคือ purgedAt tombstone — แต่ FK คุมกรณี hard-delete
-- เผื่ออนาคต) verification ไม่หาย แค่กลายเป็น user-level (shopId NULL) แทน ไม่ cascade ลบ record
ALTER TABLE "VerificationRecord" ADD CONSTRAINT "VerificationRecord_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
