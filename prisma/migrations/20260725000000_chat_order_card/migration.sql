-- feature 00018 ext (user request 2026-07-24): การ์ดออเดอร์/ใบเสนอราคาในแชท (type=ORDER)
--
-- additive อย่างเดียว: เพิ่มคอลัมน์ nullable เก็บ Order.publicToken ที่การ์ดอ้างถึง (live-join enrich
-- ตอน GET เหมือน productRefId ของ PRODUCT card) — ไม่ FK เพื่อไม่ให้ลบ order แล้วลบข้อความในเธรด
-- ไม่มี index: อ่านคู่กับข้อความในเธรด (join แบบ batch ตาม token ที่ enrich ทีละหน้า) ไม่ query ตรง
--
-- DB dev/prod ใช้ร่วมกัน (docs/conventions/prisma-shared-db-drift.md) — apply ด้วย
-- `prisma migrate deploy -e .env.local` เท่านั้น ห้าม migrate dev (จะ reset ข้อมูลจริง)
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "orderRefToken" TEXT;
