-- feature 00086 S-1 — เก็บ "ลูกค้ามาแบบไหน" ของร้านบริการลงแถว: Order.arrivalMode
--   'BOOKED'  = จองล่วงหน้า (ร้านเลือกวันและเวลานัดตอนเปิดบิล)
--   'WALK_IN' = หน้าร้าน (เปิดบิลตอนลูกค้ามาถึง · ระบบตั้ง serviceStart = ตอนนี้เอง)
--   NULL      = ยังไม่ระบุเวลา (ไม่มี serviceStart) หรือไม่ใช่ร้านบริการ (ร้านขายของ/ที่พักไม่เขียนค่านี้เลย)
--
-- ทำไมเพิ่งเก็บตอนนี้ (หัวไฟล์ src/lib/arrival-mode.ts เคยบอกว่า "derive ไม่ใช่เพิ่มคอลัมน์"):
--   เดิมระบบเดาจากส่วนต่าง serviceStart - createdAt เพราะตอนเปิดบิลไม่มีใครบอกว่าลูกค้ามายังไง
--   00086 ให้ร้าน "เลือกเอง" ตอนเปิดบิล (จองล่วงหน้า / หน้าร้าน) ⇒ ค่านี้กลายเป็นข้อเท็จจริงที่ร้านระบุ
--   ไม่ใช่ภาพนิ่งที่ระบบเดา · การเลื่อนนัดภายหลังไม่ได้เปลี่ยนว่าลูกค้า "จองมา" หรือ "เดินเข้ามา"
--   ใบเก่าที่เกิดก่อน 00086 ไม่มีใครเลือกไว้ ⇒ backfill ด้วยสูตรเดียวกับที่หน้าจอใช้แสดงอยู่แล้ว
--   (ผลบนจอจึงไม่เปลี่ยนสักใบ — ไม่ใช่การเดาใหม่ แค่ย้ายผลเดิมลงแถว)
--
-- backfill — ต้องตรงกับ resolveArrivalMode (src/lib/arrival-mode.ts) ทุกตัวอักษร:
--   JS: start - created > 30 * 60_000 ? 'BOOKED' : 'WALK_IN'   (ทางเดียว ห้าม abs · = 30 นาทีพอดี → WALK_IN)
--   ชนิดคอลัมน์ (ยืนยันกับฐาน local แล้ว): "createdAt" = timestamp(3) ไม่มีโซน เก็บเวลา UTC (Prisma)
--                                          "serviceStart" = timestamptz(3)
--   ⇒ ("createdAt" AT TIME ZONE 'UTC') แปลงเป็น timestamptz โดยตีความว่าเป็น UTC — ตรงกับที่ Prisma อ่านให้ JS
--     และไม่ขึ้นกับ timezone ของ session · ความละเอียด ms ทั้งคู่ เทียบเท่า getTime()
--   เฉพาะร้าน vertical = 'SERVICE_QUEUE' ที่มี serviceStart · ไม่มี serviceStart คง NULL (= ยังไม่ระบุเวลา)
--   🛑 ร้านขายของ/ที่พักไม่ถูกแตะแม้มี serviceStart (กั้นด้วย s."vertical")
--   🛑 backfill ต้องรันครั้งเดียว (migrate deploy รันครั้งเดียวอยู่แล้ว) · เงื่อนไข "arrivalMode" IS NULL ทำให้รันซ้ำ
--      ไม่ทับค่าที่ร้านเลือกเอง แต่จะไปเติมใบ "ยังไม่ระบุเวลา" ที่ภายหลังได้เวลานัด — ห้ามรันมือซ้ำหลังขึ้นจริง
--
-- ⚠️ Order เป็นตารางใหญ่บน prod:
--   · ADD COLUMN ไม่มี DEFAULT = แก้ metadata อย่างเดียว ไม่เขียนแถวใหม่ทั้งตาราง (แต่ขอ ACCESS EXCLUSIVE lock —
--     lock_timeout 5s กันไม่ให้ยืนรอคิวจนขวางทั้งระบบ · ล้ม = deploy ล้ม ลองใหม่ได้)
--   · migrate deploy รันทั้งไฟล์ใน transaction เดียว ⇒ lock ของ ADD COLUMN ถือยาวจนจบไฟล์
--     รวมเวลา UPDATE (แตะเฉพาะใบร้านบริการที่มี serviceStart — หลักร้อย–พัน) และ VALIDATE (สแกนทั้งตาราง 1 รอบ)
--     NOT VALID + VALIDATE จึงไม่ได้ย่น lock ในไฟล์นี้ แต่คงไว้ตามแบบแผนเดิม · ขนาดปัจจุบันสแกนเสร็จในไม่กี่วินาที
--
-- additive ล้วน · ไม่มี DROP ข้อมูล/ลบแถว
-- rollback: ALTER TABLE "Order" DROP CONSTRAINT "Order_arrivalMode_check"; แล้ว DROP COLUMN "arrivalMode"
--   (เฉพาะก่อนร้านเริ่มเลือกจริง — หลังมีข้อมูลที่ร้านเลือกเองต้องถาม user ก่อน เพราะค่าที่ร้านเลือกจะหายถาวร)
SET LOCAL lock_timeout = '5s';

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "arrivalMode" TEXT;

-- backfill (FR-002 · ร้านบริการเท่านั้น) — เทส arrival-mode-backfill.db.test.ts อ่านคำสั่งนี้ไปรัน
UPDATE "Order" o SET "arrivalMode" = CASE WHEN o."serviceStart" - (o."createdAt" AT TIME ZONE 'UTC') > interval '30 minutes' THEN 'BOOKED' ELSE 'WALK_IN' END
FROM "Shop" s WHERE s."id" = o."shopId" AND s."vertical" = 'SERVICE_QUEUE' AND o."serviceStart" IS NOT NULL AND o."arrivalMode" IS NULL;

-- CHECK: ค่าในชุดเท่านั้น และมีค่าได้ก็ต่อเมื่อมี serviceStart (ไม่มีเวลา = "ยังไม่ระบุเวลา" = NULL เสมอ)
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_arrivalMode_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_arrivalMode_check"
  CHECK ("arrivalMode" IS NULL OR ("arrivalMode" IN ('BOOKED','WALK_IN') AND "serviceStart" IS NOT NULL)) NOT VALID;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_arrivalMode_check";
