-- feature 00023 (Chat Auto-Reply) — เวลาทำงานของระบบตอบกลับ
--
-- user 2026-07-31: "บางคนอยากให้ทำงานช่วง 18.00-9.00 เพื่อแทน admin ตอนหลับ /
-- บางคนอยากให้ทำทั้งวัน"
--
-- 🛑 ห้ามรัน `prisma migrate dev` (dev = prod ตัวเดียวกัน จะ reset ลบข้อมูลลูกค้าจริงทิ้ง)
-- 🛑 ห้ามรัน `prisma db pull` — จะลบ EXCLUDE constraint ของ 00008/00017/00024 ทิ้ง
--
-- ปลอดภัย: ADD COLUMN ที่มี DEFAULT + NOT NULL บน PostgreSQL 11+ ไม่ rewrite ตาราง
-- และค่าเริ่มต้น ALWAYS/127 = พฤติกรรมเดิมเป๊ะ ร้านที่ตั้งค่าไว้แล้วไม่มีอะไรเปลี่ยน

ALTER TABLE "AutoReplyConfig"
  ADD COLUMN "activeScheduleMode" TEXT NOT NULL DEFAULT 'ALWAYS',
  ADD COLUMN "activeStartMin"     INTEGER,
  ADD COLUMN "activeEndMin"       INTEGER,
  ADD COLUMN "activeDays"         INTEGER NOT NULL DEFAULT 127;

-- มีได้ 2 โหมดเท่านั้น (มิเรอร์ Shop_appointment_granularity ของ 00024)
ALTER TABLE "AutoReplyConfig" ADD CONSTRAINT "AutoReplyConfig_active_schedule_mode"
  CHECK ("activeScheduleMode" IN ('ALWAYS', 'WINDOW'));

-- นาทีจากเที่ยงคืน 0-1439 เท่านั้น
--
-- ไม่บังคับ start < end ตั้งใจ: end <= start = ช่วงข้ามเที่ยงคืน ซึ่งเป็นเคสหลักที่ร้านขอ
-- (18:00 → 09:00) การใส่ CHECK ห้ามไว้จะบล็อกความต้องการจริงตั้งแต่ที่ DB
ALTER TABLE "AutoReplyConfig" ADD CONSTRAINT "AutoReplyConfig_active_start_min_range"
  CHECK ("activeStartMin" IS NULL OR ("activeStartMin" >= 0 AND "activeStartMin" <= 1439));

ALTER TABLE "AutoReplyConfig" ADD CONSTRAINT "AutoReplyConfig_active_end_min_range"
  CHECK ("activeEndMin" IS NULL OR ("activeEndMin" >= 0 AND "activeEndMin" <= 1439));

-- bitmask 7 วัน: 0 = ไม่ทำงานเลยสักวัน (อนุญาต — เท่ากับปิดชั่วคราวโดยไม่ต้องล้างค่าช่วงเวลา)
ALTER TABLE "AutoReplyConfig" ADD CONSTRAINT "AutoReplyConfig_active_days_range"
  CHECK ("activeDays" >= 0 AND "activeDays" <= 127);

-- โหมด WINDOW ต้องมีช่วงเวลาครบทั้งคู่ ไม่งั้นตีความไม่ได้ว่าทำงานตอนไหน
-- (กันไว้ที่ DB เพราะ "ตั้งครึ่ง ๆ กลาง ๆ แล้วบอทเงียบทั้งวัน" คือบั๊กที่ร้านจะไล่ไม่เจอเอง)
ALTER TABLE "AutoReplyConfig" ADD CONSTRAINT "AutoReplyConfig_window_needs_range"
  CHECK (
    "activeScheduleMode" <> 'WINDOW'
    OR ("activeStartMin" IS NOT NULL AND "activeEndMin" IS NOT NULL)
  );
