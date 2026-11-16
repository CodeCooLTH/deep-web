-- feature 00095 ส่วนต่อขยาย "ตามครบแล้วไม่ตอบ ทำอะไรต่อ" (EXT-2026-11-16-final-action.md) — additive ล้วน
-- ค่าตั้งต้น NONE/1440 = พฤติกรรมเดิม ไม่ backfill · ไม่แตะ CHECK/โครงเดิมของ 00095

-- AlterTable
ALTER TABLE "SalesFollowBot" ADD COLUMN "finalAction" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN "finalDelayMin" INTEGER NOT NULL DEFAULT 1440;

-- AlterTable
ALTER TABLE "SalesFollowRun" ADD COLUMN "finalActionAt" TIMESTAMPTZ(3),
ADD COLUMN "finalActionTaken" TEXT;

-- ที่ Prisma DSL ประกาศไม่ได้
ALTER TABLE "SalesFollowBot" ADD CONSTRAINT "SalesFollowBot_finalAction_check" CHECK ("finalAction" IN ('NONE','RESOLVE','HIDE','SPAM'));
ALTER TABLE "SalesFollowBot" ADD CONSTRAINT "SalesFollowBot_finalDelayMin_check" CHECK ("finalDelayMin" BETWEEN 0 AND 10080);
ALTER TABLE "SalesFollowRun" ADD CONSTRAINT "SalesFollowRun_finalActionTaken_check" CHECK ("finalActionTaken" IS NULL OR "finalActionTaken" IN ('RESOLVE','HIDE','SPAM'));
-- ตัวหยิบ run ที่ครบแล้วรอทำ action (partial — มีเฉพาะที่ยังไม่ทำ)
CREATE INDEX "SalesFollowRun_final_pending_idx" ON "SalesFollowRun"("lastSentAt") WHERE "status" = 'DONE' AND "finalActionAt" IS NULL;
