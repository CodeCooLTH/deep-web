-- 00038 ส่วนขยาย E2 (2026-08-15) — ตอบคอมเมนต์ต่างกันตามคีย์เวิร์ด
--
-- ที่มา: ทุกคนได้ข้อความเดียวกันหมด ขณะที่นับจากฐาน prod วันนี้ คอมเมนต์ระดับบนของลูกค้า 472 ใบ
-- **ถามราคาตรง ๆ 164 ใบ (35%)** และบอกว่าสนใจ/ขอให้ทัก 92 ใบ (20%) — คำตอบใบเดียวจึงตอบตรง
-- คำถามได้จริงแค่กลุ่มเดียว ส่วนที่เหลือได้คำตอบที่ไม่ตรงคำถาม (และคอมเมนต์สาธารณะคือที่ที่
-- คำตอบถูกอ่านซ้ำโดยคนที่เลื่อนผ่าน มูลค่าจึงคูณ ต่างจากแชทที่อ่านคนเดียว)
--
-- D-EXT2-1 — ตารางของตัวเอง **ไม่ผูกกับ AutoReplyKeyword/AutoReplyRule ของแชท (00023)**
--   * AutoReplyKeyword.status มีโหมด TEST ที่ผูกกับ AutoReplyKeywordTestThread = เธรดแชท
--     ซึ่งไม่มีสิ่งเทียบเท่าในโลกของคอมเมนต์ ยัดเข้าไปจะได้ค่าที่ไม่มีความหมายในบริบทหนึ่งเสมอ
--   * AutoReplyRule มีมิติ adId/productId + specificity bitmask ที่ออกแบบเพื่อ 8 ระดับของแชท
--     การเติม discriminator scope='COMMENT' เข้าตารางที่ engine ตัวอื่นอ่านอยู่ = ความเสี่ยงที่
--     กฎคอมเมนต์รั่วไปตอบในแชท (คลาส "guard ที่หายไป = หายทั้งคลาส" ที่โปรเจกต์นี้เจอซ้ำ ๆ)
--   * ร้านแก้กลุ่มคำเพื่อแชท แล้วพฤติกรรมคอมเมนต์เปลี่ยนตามโดยไม่รู้ตัว = ผลข้างเคียงที่มองไม่เห็น
--   ยกมาใช้ซ้ำเฉพาะ `normalizeMessage()` ซึ่งเป็นส่วนที่ยากและต้องมีนิยามเดียวทั้งระบบ (HR16)
--
-- 🛑 `normalizedPhrases` เก็บผลของ normalizeMessage() ไว้ที่ฐาน (ไม่ normalize ตอน match)
-- ⇒ **แก้ auto-reply-normalize.ts เมื่อไหร่ ต้อง backfill คอลัมน์นี้ทั้งตารางในรอบ deploy เดียวกัน**
-- ข้อผูกมัดเดียวกับ AutoReplyPhrase.normalizedPhrase ที่เขียนเตือนไว้ในไฟล์นั้นแล้ว
-- ไม่งั้นกฎที่ร้านตั้งไว้เดิมจะ match ไม่ตรงแบบเงียบ ๆ (ไม่มี error ไม่มี log)
--
-- additive ล้วน: ตารางใหม่ทั้งตาราง ไม่แตะโครงสร้างเดิม ไม่มีข้อมูลเก่าต้องย้าย
-- ร้านที่ไม่ได้สร้างกฎเลย = พฤติกรรมเหมือนวันนี้เป๊ะ (ตกไปใช้ข้อความ fallback ของเพจ)

CREATE TABLE "CommentReplyRule" (
  "id"                TEXT NOT NULL,
  "shopId"            TEXT NOT NULL,
  -- NULL = ใช้กับทุกเพจของร้าน (D-EXT2-2) — กฎที่ระบุเพจตรงกันต้องชนะกฎ NULL เสมอ
  -- ไม่งั้นตัวเลือก "ต่อเพจ" ไม่มีความหมาย (บังคับที่ตัวเรียงใน src/lib/comment-rule-match.ts)
  "shopChannelId"     TEXT,
  "name"              TEXT NOT NULL,
  -- คำที่ร้านพิมพ์ (เก็บของเดิมไว้แสดงใน UI) คู่กับรูป normalize ที่ใช้เทียบจริง
  "phrases"           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "normalizedPhrases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- ทั้งสองช่องว่างพร้อมกันไม่ได้ (บังคับที่ Valibot + service) — กฎที่ match แล้วไม่ทำอะไรเลย
  -- จะ "กิน" คอมเมนต์นั้นไปจาก fallback ด้วย = เงียบกว่าไม่มีกฎ
  "publicReplyText"   TEXT,
  "publicReplyFileId" TEXT,
  "privateReplyText"  TEXT,
  "priority"          INTEGER NOT NULL DEFAULT 100,
  "isActive"          BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId"   TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommentReplyRule_pkey" PRIMARY KEY ("id")
);

-- Cascade: ลบร้าน = กฎหายตาม · แต่ **ถอดเพจต้องไม่ลบกฎ** (SetNull) กฎกลายเป็น "ทุกเพจ" แทน
-- แล้วร้านตัดสินใจเองว่าจะแก้ไหม ดีกว่าของที่ตั้งไว้หายเงียบ (หลักเดียวกับ AutoReplyRule)
ALTER TABLE "CommentReplyRule" ADD CONSTRAINT "CommentReplyRule_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommentReplyRule" ADD CONSTRAINT "CommentReplyRule_shopChannelId_fkey"
  FOREIGN KEY ("shopChannelId") REFERENCES "ShopChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- query เดียวที่ hot path ใช้: "กฎที่เปิดอยู่ของร้านนี้" แล้วคัด/เรียงต่อในหน่วยความจำ
-- (จำนวนกฎต่อร้านเป็นหลักสิบ ไม่ใช่หลักหมื่น — เรียงใน SQL ไม่ได้ช่วยอะไรและทำให้กติกาการเรียง
-- กระจายไปอยู่สองที่ ซึ่งเป็นที่ที่มันจะแตกกันเงียบ ๆ)
CREATE INDEX "CommentReplyRule_shopId_isActive_idx" ON "CommentReplyRule" ("shopId", "isActive");
CREATE INDEX "CommentReplyRule_shopChannelId_idx" ON "CommentReplyRule" ("shopChannelId");

-- CommentReplyLog.matchedRuleId — "คอมเมนต์นี้ถูกตอบด้วยกฎไหน" (null = ไม่มีกฎ match ตกไปใช้
-- ข้อความ fallback ของเพจ)
--
-- 🛑 มีไว้เพื่อให้หน้าประวัติตอบได้ว่า "ทำไมคอมเมนต์นี้ได้คำตอบแบบนี้" — ร้านที่มีกฎ 10 ข้อแล้ว
-- เห็นแต่คำตอบสุดท้ายจะสืบเองไม่ได้เลย ซึ่งเป็นคลาสปัญหาเดียวกับที่เพิ่งปิดไปเมื่อเช้า
-- (การข้ามที่ไม่มีร่องรอย) — ฟีเจอร์ที่ตัดสินใจแทนผู้ใช้ ต้องอธิบายการตัดสินใจนั้นได้เสมอ
--
-- SetNull ไม่ใช่ Cascade: ลบกฎแล้ว **ประวัติต้องไม่หายตาม** (หลักฐานว่าเคยตอบอะไรไปแล้วมีค่ากว่า
-- ความสะอาดของ FK) แถวเก่าทั้งหมดได้ NULL = "ยุคก่อนมีกฎ" ซึ่งเป็นความจริงตามตัวอักษร
ALTER TABLE "CommentReplyLog" ADD COLUMN IF NOT EXISTS "matchedRuleId" TEXT;
ALTER TABLE "CommentReplyLog" ADD CONSTRAINT "CommentReplyLog_matchedRuleId_fkey"
  FOREIGN KEY ("matchedRuleId") REFERENCES "CommentReplyRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "CommentReplyLog_matchedRuleId_idx" ON "CommentReplyLog" ("matchedRuleId");
