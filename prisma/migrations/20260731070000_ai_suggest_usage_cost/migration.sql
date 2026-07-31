-- feature 00019 (AI Reply Assistant) — เก็บต้นทุนจริงต่อการใช้ AI หนึ่งครั้ง
--
-- user 2026-07-31: "แสดง credit ที่ใช้ ในแต่ละรอบว่ากี่ $ ... จะได้คิดราคาขายได้"
--
-- 🛑 ห้ามรัน `prisma migrate dev` (dev = prod ตัวเดียวกัน จะ reset ลบข้อมูลลูกค้าจริงทิ้ง)
-- 🛑 ห้ามรัน `prisma db pull` — จะลบ EXCLUDE constraint ของ 00008/00017/00024 ทิ้ง
--
-- ปลอดภัย: ADD COLUMN แบบ nullable ล้วน ไม่มี DEFAULT ไม่ rewrite ตาราง
-- แถวเก่าเป็น NULL = "ไม่รู้ต้นทุน" ซึ่งตรงความจริง ไม่ใช่ 0 ที่จะทำให้ค่าเฉลี่ยเพี้ยนต่ำ

ALTER TABLE "AiSuggestUsageEvent"
  ADD COLUMN "aiModel"      TEXT,
  ADD COLUMN "inputTokens"  INTEGER,
  ADD COLUMN "outputTokens" INTEGER,
  ADD COLUMN "costUsd"      DECIMAL(12, 8);

-- token ติดลบไม่มีความหมาย — กันข้อมูลเพี้ยนตั้งแต่ที่ฐาน ไม่พึ่งวินัยโค้ด
ALTER TABLE "AiSuggestUsageEvent" ADD CONSTRAINT "AiSuggestUsageEvent_tokens_non_negative"
  CHECK (
    ("inputTokens"  IS NULL OR "inputTokens"  >= 0) AND
    ("outputTokens" IS NULL OR "outputTokens" >= 0) AND
    ("costUsd"      IS NULL OR "costUsd"      >= 0)
  );
