-- feature 00011 ext #3: Scam-link Detection ในแชท
-- additive columns บน "ChatMessage" — heuristic scam-link flag ณ เวลาส่ง (snapshot, BR-SCAM-05 ไม่ re-scan ย้อนหลัง)
-- flaggedScam: NOT NULL DEFAULT false → row เดิมทุกแถว backfill เป็น false อัตโนมัติ (ไม่มี migration ข้อมูลเพิ่ม)
-- scamMatchedRules: nullable JSONB (audit rule IDs ที่ match) — ไม่กระทบ row เดิม
-- ไม่ drop / ไม่ rename ใด ๆ — ปลอดภัย 100% กับ data เดิม, ไม่มี rollback risk

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "flaggedScam" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChatMessage" ADD COLUMN "scamMatchedRules" JSONB;
