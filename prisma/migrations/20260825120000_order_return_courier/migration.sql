-- feature 00056 — ขนส่งขากลับเป็น "รหัส" ไม่ใช่ข้อความอิสระ + กล่องขากลับที่ร้านแก้เอง
--   (D-2 dropdown จากรายชื่อในระบบ · D-3 ขากลับเป็นพัสดุคนละใบ · D-5 แก้ขนาดกล่องได้)
--
-- 🛑 additive ล้วน: เพิ่มคอลัมน์ nullable 3 ตัว ไม่มี DROP ไม่มี CHECK ไม่มี NOT NULL
--    ⇒ metadata-only ใน Postgres (ไม่ rewrite ตาราง) และ deployment เก่าที่ยังเสิร์ฟอยู่
--    ระหว่าง build ไม่พัง เพราะไม่มีคอลัมน์ไหนหายไป
--
-- คอลัมน์เดิม "manualCourier" (ข้อความอิสระ) **ไม่ถูกลบและไม่ถูก backfill** — ยืนยันกับฐานจริง
-- 2026-08-25 ว่า OrderReturn มี 0 แถวทั้ง prod และ dev จึงไม่มีข้อมูลให้ย้าย ดู schema.prisma

ALTER TABLE "OrderReturn" ADD COLUMN IF NOT EXISTS "returnCourierCode" TEXT;
ALTER TABLE "OrderReturn" ADD COLUMN IF NOT EXISTS "returnCourierName" TEXT;
ALTER TABLE "OrderReturn" ADD COLUMN IF NOT EXISTS "returnParcel" JSONB;
