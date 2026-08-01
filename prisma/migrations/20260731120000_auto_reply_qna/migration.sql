-- feature 00023 (Deep Chat-Bot Assistant) phase `00023-qna` — คลังคำถาม-คำตอบ + คิวคำถามที่ตอบไม่ได้
--
-- SSOT: docs/20 - Features/00023 - Deep Chat-Bot Assistant/DATABASE.md §3.9-§3.11, §5.1.1
--       docs/scope/2026-07-31-00023-qna-library-scope-baseline.md
--
-- 🛑 ห้ามรัน `prisma migrate dev` (dev = prod ตัวเดียวกัน จะ reset ลบข้อมูลลูกค้าจริงทิ้ง)
-- 🛑 ห้ามรัน `prisma db pull` — จะลบ EXCLUDE constraint ของ 00008/00017/00024 ทิ้ง
-- 🛑 apply ด้วย `npx prisma migrate deploy -e .env.local` เท่านั้น และต้องขอ user ยืนยันก่อน
--
-- additive 100%: CREATE TABLE ใหม่ 2 ตาราง + ADD COLUMN ที่ nullable หรือมี DEFAULT
-- ไม่มี DROP / ไม่มีการเปลี่ยนชนิด / ไม่มี NOT NULL ที่ไม่มี DEFAULT บนตารางเดิม
-- ⚠️ หลัง migrate ต้อง restart dev server (stale Prisma client → session 500)

-- ---------------------------------------------------------------------------
-- 1. AutoReplyQna — คลังคำถาม-คำตอบ ผูกกับ "กลุ่มคำ" ไม่ใช่คลังกลางของร้าน
-- ---------------------------------------------------------------------------

CREATE TABLE "AutoReplyQna" (
  "id"                 TEXT NOT NULL,
  -- ซ้ำกับ keyword.shopId ตั้งใจ — query ของหน้าจัดการและของ matcher กรอง shopId ตรง ๆ ไม่ต้อง join
  "shopId"             TEXT NOT NULL,
  "keywordId"          TEXT NOT NULL,
  "question"           TEXT NOT NULL,
  -- ผ่าน normalizeMessage() ตัวเดียวกับ AutoReplyPhrase.normalizedPhrase และข้อความลูกค้า
  "normalizedQuestion" TEXT NOT NULL,
  "answer"             TEXT NOT NULL,
  -- รูปแนบ สูงสุด 5 บังคับที่ Valibot (Messenger ส่งรูปกับข้อความเป็นคนละข้อความ — ดู DATABASE §3.11)
  "imageFileIds"       TEXT[] NOT NULL DEFAULT '{}',
  "isActive"           BOOLEAN NOT NULL DEFAULT true,
  -- นับที่คอลัมน์ ไม่ COUNT จาก AutoReplyLog (ตารางที่โตเร็วที่สุดในระบบ) ตอนเปิดหน้า
  "useCount"           INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt"         TIMESTAMP(3),
  "source"             TEXT NOT NULL DEFAULT 'MANUAL',
  "createdByUserId"    TEXT,
  "updatedByUserId"    TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AutoReplyQna_pkey" PRIMARY KEY ("id")
);

-- ค่าคงที่ String (มิเรอร์ AutoReplyConfig_active_schedule_mode ของรอบก่อน)
ALTER TABLE "AutoReplyQna" ADD CONSTRAINT "AutoReplyQna_source_check"
  CHECK ("source" IN ('MANUAL', 'QUEUE', 'IMPORT'));

-- คำถามซ้ำในกลุ่มเดียวกันต้องถูกปฏิเสธ — บังคับที่ DB ไม่พึ่งวินัยโค้ด
-- 🛑 unique ที่ระดับ "กลุ่ม" ไม่ใช่ "ร้าน" ตั้งใจ: คำถามเดียวกันอยู่ได้หลายกลุ่ม เพราะแต่ละกลุ่ม
--    มีน้ำเสียง/กฎ/ขอบเขตของตัวเอง — ตอนจับคู่ตัดสินด้วย priority → useCount → id (DATABASE §3.9.1)
CREATE UNIQUE INDEX "AutoReplyQna_keywordId_normalizedQuestion_key"
  ON "AutoReplyQna"("keywordId", "normalizedQuestion");

-- query หลักของ QnA matching: โหลดคลังที่เปิดใช้ของร้านในคิวรีเดียว (ตอน match ยังไม่รู้ว่ากลุ่มไหน)
CREATE INDEX "AutoReplyQna_shopId_isActive_idx" ON "AutoReplyQna"("shopId", "isActive");

-- หน้าจัดการรายกลุ่ม: เรียงตามที่ถูกใช้บ่อย + ตัวกรอง "ไม่เคยถูกใช้" (useCount = 0)
CREATE INDEX "AutoReplyQna_keywordId_isActive_useCount_idx"
  ON "AutoReplyQna"("keywordId", "isActive", "useCount");

ALTER TABLE "AutoReplyQna" ADD CONSTRAINT "AutoReplyQna_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cascade — ลบกลุ่มคำ ลบคลังของกลุ่มนั้นด้วย (คลังที่ไม่มีกลุ่มไม่มีความหมาย เพราะกติกาที่คุม
-- คำตอบทั้งหมดอยู่ที่กลุ่ม) หลักเดียวกับ AutoReplyPhrase/AutoReplyRule
ALTER TABLE "AutoReplyQna" ADD CONSTRAINT "AutoReplyQna_keywordId_fkey"
  FOREIGN KEY ("keywordId") REFERENCES "AutoReplyKeyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. AutoReplyUnansweredQuestion — คิวคำถามที่บอทตอบไม่ได้
--    เขียนตอนเกิด NO_KEYWORD_MATCH หลังผ่านตัวกรอง PII (DATABASE §3.10.1)
-- ---------------------------------------------------------------------------

CREATE TABLE "AutoReplyUnansweredQuestion" (
  "id"                 TEXT NOT NULL,
  "shopId"             TEXT NOT NULL,
  "normalizedQuestion" TEXT NOT NULL,
  "rawSample"          TEXT NOT NULL,
  "hitCount"           INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status"             TEXT NOT NULL DEFAULT 'PENDING',
  "qnaId"              TEXT,
  "dismissedAt"        TIMESTAMP(3),
  "dismissedByUserId"  TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AutoReplyUnansweredQuestion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AutoReplyUnansweredQuestion" ADD CONSTRAINT "AutoReplyUnansweredQuestion_status_check"
  CHECK ("status" IN ('PENDING', 'DISMISSED', 'ANSWERED'));

-- 🛑 หัวใจของตาราง: ข้อความเดียวกันของร้านเดียวกัน = แถวเดียวตลอดกาล นับที่ hitCount
--    ทำให้ upsert ในเส้นทางร้อนเป็น operation เดียว และกันคิวบวมโดยไม่ต้องมี dedupe ในโค้ด
CREATE UNIQUE INDEX "AutoReplyUnansweredQuestion_shopId_normalizedQuestion_key"
  ON "AutoReplyUnansweredQuestion"("shopId", "normalizedQuestion");

CREATE INDEX "AutoReplyUnansweredQuestion_shopId_status_hitCount_idx"
  ON "AutoReplyUnansweredQuestion"("shopId", "status", "hitCount");

ALTER TABLE "AutoReplyUnansweredQuestion" ADD CONSTRAINT "AutoReplyUnansweredQuestion_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull — ลบข้อในคลังไม่ควรลบประวัติว่าคิวแถวนี้เคยถูกตอบไปแล้ว
-- (status ค้างเป็น ANSWERED โดยไม่มี qnaId = "เคยตอบแล้วแต่ข้อนั้นถูกลบ" ซึ่งเป็นความจริง)
ALTER TABLE "AutoReplyUnansweredQuestion" ADD CONSTRAINT "AutoReplyUnansweredQuestion_qnaId_fkey"
  FOREIGN KEY ("qnaId") REFERENCES "AutoReplyQna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. คอลัมน์ที่เพิ่มในตารางเดิม
-- ---------------------------------------------------------------------------

-- AutoReplyLog: ที่มาของคำตอบ
-- 🛑 nullable ทั้งคู่ **ไม่มี DEFAULT โดยเจตนา** — null = แถวที่บันทึกก่อน phase นี้ ซึ่งต้องอ่านว่า
--    "KEYWORD" เสมอ และ **ห้าม backfill ทับ**: การ backfill จะทำให้แยกไม่ออกระหว่างแถวที่ "รู้จริง"
--    กับแถวที่ "เดาให้" ซึ่งเป็นสิ่งเดียวที่ตารางบันทึกมีไว้ทำ
ALTER TABLE "AutoReplyLog"
  ADD COLUMN "matchedVia" TEXT,
  ADD COLUMN "qnaId"      TEXT;

ALTER TABLE "AutoReplyLog" ADD CONSTRAINT "AutoReplyLog_matched_via_check"
  CHECK ("matchedVia" IS NULL OR "matchedVia" IN ('KEYWORD', 'QNA'));

ALTER TABLE "AutoReplyLog" ADD CONSTRAINT "AutoReplyLog_qnaId_fkey"
  FOREIGN KEY ("qnaId") REFERENCES "AutoReplyQna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 🛑 ไม่สร้าง index ให้ qnaId/matchedVia โดยเจตนา — ป้าย DeepBot join ด้วย conversationId ซึ่งมี
--    index อยู่แล้ว · AutoReplyLog มี 5 index บนตารางที่โตเร็วที่สุดในระบบ การเพิ่มที่ 6-7
--    เพื่อ query ที่ยังไม่มีคนเรียก = จ่ายค่าเขียนฟรีทุกข้อความขาเข้าของทุกร้าน

-- AutoReplyKeyword: สวิตช์โหมดความคล้ายรายกลุ่ม
-- 🛑 คอลัมน์นี้ยัง **ไม่มีที่ไหนในโค้ดอ่านค่า** — ห้ามเข้าใจว่าเปิดใช้ได้แล้ว
--    user ตัดสิน 2026-07-31: "ตรงตัวก่อน ความคล้ายเปิดทีหลัง" (Scope Baseline A1)
--    ใส่มารอบนี้เพราะ dev DB = prod DB — กลับมา ALTER รอบสองแพงกว่าคอลัมน์ที่นอนเฉย ๆ 1 คอลัมน์
-- ปลอดภัย: ADD COLUMN ที่มี DEFAULT + NOT NULL บน PostgreSQL 11+ ไม่ rewrite ตาราง
ALTER TABLE "AutoReplyKeyword"
  ADD COLUMN "qnaSimilarityEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AutoReplyRule: รูปแนบในคำตอบ (user สั่ง 2026-07-31 "Auto Reply ต้องใส่รูปได้")
-- ลงรอบนี้แม้ UI ในหน้าแก้ไขกลุ่มคำจะยังทำไม่ได้ (งาน v3 ถือ KeywordEditorClient.tsx อยู่)
-- เพื่อไม่ต้องกลับมา ALTER รอบสองบน DB ที่ dev/prod แชร์กัน (user ตัดสิน A5)
ALTER TABLE "AutoReplyRule"
  ADD COLUMN "imageFileIds" TEXT[] NOT NULL DEFAULT '{}';
