-- feature 00023 Deep Chat-Bot Assistant · phase `00023-ai-enhance` · A-01
-- SSOT: docs/scope/2026-08-01-00023-ai-enhance-scope-baseline.md
--       + PRD.md §3.9 (BR-AR-31..36) · BRD.md §2.8 (FR-025..028)
--
-- เขียนมือ ไม่ใช่ `prisma migrate dev` — ฐานนี้ใช้ร่วมกับข้อมูลจริง การ reset ไม่ใช่ตัวเลือก
-- (Hard Rule 14 / memory `project_shared_db_drift_no_migrate_dev`)
--
-- ADDITIVE ล้วน: เพิ่มคอลัมน์ที่มี DEFAULT และตารางใหม่เท่านั้น
-- ไม่มี DROP / ไม่มี ALTER ที่เปลี่ยนชนิด / ไม่มีคอลัมน์ NOT NULL ที่ไม่มี DEFAULT
-- แถวเดิมทุกแถวจึงยังใช้ได้ทันทีหลัง apply และโค้ดเวอร์ชันก่อนหน้ายังทำงานต่อได้
-- (คอลัมน์ใหม่ทุกตัวมีค่าเริ่มต้นที่แปลว่า "ปิด/ยังไม่มี" — ดูเหตุผลรายตัวใน schema.prisma)

-- 1) สวิตช์ AI Enhance ต่อกลุ่มคำ — false = ทุกกลุ่มที่มีอยู่แล้วบน prod พฤติกรรมไม่เปลี่ยน
ALTER TABLE "AutoReplyKeyword"
  ADD COLUMN "aiEnhanceEnabled" BOOLEAN NOT NULL DEFAULT false;

-- 2) เพดานค่าใช้จ่าย AI ต่อวัน + การแจ้งเตือน (ระดับร้าน)
ALTER TABLE "AutoReplyConfig"
  ADD COLUMN "aiDailyCapBaht"     INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "aiCapAlertSmsOptIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "aiCapAlertedDay"    TEXT;

-- เพดานต้องเป็นบวกเสมอ — 0 แปลว่า "ปิดฟีเจอร์" ซึ่งมีสวิตช์ของตัวเองอยู่แล้วที่ระดับกลุ่มคำ
-- ปล่อยให้ตั้ง 0 ได้จะเกิดสองทางที่ทำเรื่องเดียวกันแล้วขัดกันเอง
ALTER TABLE "AutoReplyConfig"
  ADD CONSTRAINT "AutoReplyConfig_aiDailyCapBaht_check" CHECK ("aiDailyCapBaht" > 0);

-- 3) เศษค่า AI ที่ยังไม่ถึงเกณฑ์หัก (สะสมจนครบ 1 บาทค่อยหักจาก balance)
ALTER TABLE "SellerWallet"
  ADD COLUMN "pendingAiCostBaht" DECIMAL(12,4) NOT NULL DEFAULT 0;

-- ห้ามติดลบ — ค่านี้ถูกบวกสะสมและถูกลบออกทีละก้อนจำนวนเต็ม ถ้าติดลบแปลว่าตรรกะการหักพัง
-- ต้องรู้ตั้งแต่ตอนเขียน ไม่ใช่ไปเจอตอนกระทบยอดเงินร้าน (หลักเดียวกับ CHECK balance >= 0 เดิม)
ALTER TABLE "SellerWallet"
  ADD CONSTRAINT "SellerWallet_pendingAiCostBaht_check" CHECK ("pendingAiCostBaht" >= 0);

-- 4) กฎห้ามตอบ (Guardrails) รายกลุ่มคำ
CREATE TABLE "AutoReplyGuardrail" (
  "id"               TEXT NOT NULL,
  "shopId"           TEXT NOT NULL,
  "keywordId"        TEXT NOT NULL,
  "rule"             TEXT NOT NULL,
  "denyPhrases"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isFromDefaultSet" BOOLEAN NOT NULL DEFAULT false,
  "isActive"         BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId"  TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AutoReplyGuardrail_pkey" PRIMARY KEY ("id")
);

-- query หลักตอนกำลังจะตอบ: กฎที่ใช้งานอยู่ของกลุ่มนี้ (อยู่ใน hot path ต้องเร็ว)
CREATE INDEX "AutoReplyGuardrail_keywordId_isActive_idx"
  ON "AutoReplyGuardrail"("keywordId", "isActive");

-- ทางกลับ: กฎทั้งหมดของร้าน (หน้ารวม/ตรวจสอบ)
CREATE INDEX "AutoReplyGuardrail_shopId_idx" ON "AutoReplyGuardrail"("shopId");

ALTER TABLE "AutoReplyGuardrail"
  ADD CONSTRAINT "AutoReplyGuardrail_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ลบกลุ่มคำ = ลบกฎของกลุ่มนั้นด้วย (กฎที่ไม่มีกลุ่มไม่มีความหมาย เหมือน AutoReplyRule)
ALTER TABLE "AutoReplyGuardrail"
  ADD CONSTRAINT "AutoReplyGuardrail_keywordId_fkey"
  FOREIGN KEY ("keywordId") REFERENCES "AutoReplyKeyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;
