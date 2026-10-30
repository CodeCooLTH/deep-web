-- feature 00086 — สิทธิ์เพิ่มรายคนของพนักงาน (ร้านบริการเท่านั้น · S-1)
--   canCloseJob      = ให้ "ปิดงาน" ได้ (ต้องถือบทบาทที่เริ่มงานได้ — CHAT หรือ TECHNICIAN — ตัดสินที่ shop-permissions.ts)
--   canRecordExpense = ให้บันทึกค่าใช้จ่ายของตัวเองได้
--
-- ทำไมเป็น boolean แยก ไม่ยัดลง roles[]:
--   roles[] มี CHECK จำกัด 1..4 ค่าในชุด MANAGER/CHAT/BILLING/TECHNICIAN และถูกอ่านโดย can()/moneyLevel ทั้งระบบ
--   ⇒ ถ้าเพิ่มค่าใหม่ลง roles จะรั่วไปเปิดสิทธิ์อื่นของร้านทุกประเภท · flag แยกจึงไม่แตะของเดิมเลย
-- ทำไมมีบน ShopInvite/ShopInviteLink ด้วย: ตอนรับคำเชิญต้องคัดลอกสองค่านี้ไปเป็นของสมาชิก (service layer)
--
-- CHECK ShopMember_flags_admin_only_check: เจ้าของร้าน (OWNER) ต้องเป็น false ทั้งคู่เสมอ
--   (เจ้าของทำได้ทุกอย่างอยู่แล้ว · กันข้อมูลเพี้ยนตอนโอนความเป็นเจ้าของ — service ต้องล้าง flag ก่อนเปลี่ยน role)
--
-- ปรับของเดิมครั้งเดียว (backfill):
--   เฉพาะร้าน vertical = 'SERVICE_QUEUE' · เฉพาะ ADMIN ที่ถือ CHAT หรือ TECHNICIAN → canCloseJob = true
--   เหตุผล: ก่อน 00086 คนกลุ่มนี้ปิดงานได้อยู่แล้ว — ติ๊กให้เพื่อไม่ให้ใครเสียสิทธิ์ทันทีที่ deploy
--   🛑 ร้านขายของ/ที่พักไม่ถูกแตะแม้แต่แถวเดียว (กั้นด้วย s."vertical" = 'SERVICE_QUEUE')
--   🛑 คำเชิญ/ลิงก์ที่ยังค้างไม่ backfill — คนใหม่เริ่มแบบไม่ติ๊ก (ตาม PRD)
--   🛑 canRecordExpense ไม่ backfill — เป็นสิทธิ์ใหม่ เจ้าของต้องเปิดเอง
--   🛑 ห้ามรัน UPDATE นี้ซ้ำหลังขึ้นจริง (จะทับค่าที่เจ้าของร้านเอาติ๊กออกเอง) — migrate deploy รันครั้งเดียวอยู่แล้ว
--
-- additive ล้วน · DDL รันซ้ำได้ (IF NOT EXISTS + DROP CONSTRAINT IF EXISTS ก่อน ADD) · backfill ต้องรันครั้งเดียว
-- rollback: DROP CONSTRAINT "ShopMember_flags_admin_only_check" แล้ว DROP COLUMN 6 ตัว
--   (เฉพาะก่อนเจ้าของร้านเริ่มตั้งค่าจริง — หลังมีข้อมูลต้องถาม user ก่อน)
SET LOCAL lock_timeout = '5s';

ALTER TABLE "ShopMember"
  ADD COLUMN IF NOT EXISTS "canCloseJob" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canRecordExpense" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShopInvite"
  ADD COLUMN IF NOT EXISTS "canCloseJob" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canRecordExpense" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShopInviteLink"
  ADD COLUMN IF NOT EXISTS "canCloseJob" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canRecordExpense" BOOLEAN NOT NULL DEFAULT false;

-- NOT VALID แล้ว VALIDATE ต่อทันที: migrate deploy รันทั้งไฟล์ใน transaction เดียว ⇒ ไม่ได้ย่น
--   ACCESS EXCLUSIVE lock ของ ADD COLUMN ข้างบน (lock ถือยาวจนจบ transaction อยู่ดี)
--   ไม่เป็นปัญหาเพราะ ShopMember เล็ก (หลักร้อย–พันแถว) · แถวเก่าทุกแถว = false อยู่แล้ว VALIDATE ผ่านแน่นอน
ALTER TABLE "ShopMember" DROP CONSTRAINT IF EXISTS "ShopMember_flags_admin_only_check";
ALTER TABLE "ShopMember" ADD CONSTRAINT "ShopMember_flags_admin_only_check"
  CHECK ("role" = 'ADMIN' OR (NOT "canCloseJob" AND NOT "canRecordExpense")) NOT VALID;
ALTER TABLE "ShopMember" VALIDATE CONSTRAINT "ShopMember_flags_admin_only_check";

-- backfill (ร้านบริการเท่านั้น · ADMIN ที่ถือ CHAT/TECHNICIAN) — เทส member-flags-backfill.db.test.ts อ่านคำสั่งนี้ไปรัน
UPDATE "ShopMember" m SET "canCloseJob" = true FROM "Shop" s
WHERE s."id" = m."shopId" AND s."vertical" = 'SERVICE_QUEUE' AND m."role" = 'ADMIN' AND m."roles" && ARRAY['CHAT','TECHNICIAN']::text[] AND m."canCloseJob" = false;
