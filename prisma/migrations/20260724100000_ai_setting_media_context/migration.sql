-- feature 00019 ext (user request 2026-07-24): สวิตช์ "ให้ AI อ่านรูป/ฟังข้อความเสียง" ต่อร้าน
--
-- additive อย่างเดียว: เพิ่มคอลัมน์ใหม่พร้อม DEFAULT true — แถวเดิมได้ค่า true อัตโนมัติโดยไม่ต้อง
-- backfill แยก และไม่กระทบ query เดิม (โค้ดเก่าที่ไม่ select คอลัมน์นี้ยังทำงานได้ปกติ)
-- ไม่มี index: ไม่เคยถูกใช้เป็นเงื่อนไข WHERE (อ่านคู่กับแถวที่ lookup ด้วย shopId @unique อยู่แล้ว)
--
-- DB dev/prod ใช้ร่วมกัน (docs/conventions/prisma-shared-db-drift.md) — apply ด้วย
-- `prisma migrate deploy -e .env.local` เท่านั้น ห้าม migrate dev (จะ reset ข้อมูลจริง)
ALTER TABLE "ShopAiSetting" ADD COLUMN IF NOT EXISTS "includeMediaContext" BOOLEAN NOT NULL DEFAULT true;
