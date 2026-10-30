-- feature 00086 (review P2 MINOR-3) — เติม Order.arrivalMode ให้ใบที่ "ตกช่อง" ระหว่างสอง deploy
--
-- ทำไมต้องมีไฟล์นี้: 2026-10-27 migration 20261027100200 (เพิ่มคอลัมน์ + backfill) ขึ้น prod ก่อน merge
-- โดยไม่ตั้งใจ (เหตุการณ์ prod-migrate-incident-00086) ⇒ backfill ของไฟล์นั้นรันไปแล้วตอนนั้น
-- แต่โค้ดบน prod ยังเป็นรุ่นเก่าที่ไม่รู้จักคอลัมน์นี้ ⇒ ใบร้านบริการที่สร้าง/ได้เวลานัดหลังจากนั้นจนถึง
-- deploy 00086 จริง มี serviceStart แต่ arrivalMode = NULL (ช่องโหว่ระหว่างสอง deploy)
-- ไฟล์ 100200 freeze แล้ว (อยู่บน prod) แก้ไม่ได้ ⇒ รัน backfill ชุดเดิมซ้ำอีกรอบในไฟล์ใหม่นี้
--
-- คำสั่ง UPDATE คัดลอกจาก 100200 ทุกตัวอักษร (เทส arrival-mode-backfill-gap.test.ts เทียบให้):
--   · เฉพาะร้าน vertical = 'SERVICE_QUEUE' · เฉพาะใบที่มี serviceStart · เฉพาะ "arrivalMode" IS NULL
--     ⇒ ไม่ทับค่าที่ร้านเลือกเองด้วยโค้ด 00086 · ร้านขายของ/ที่พักไม่ถูกแตะ
--   · สูตรเดียวกับ resolveArrivalMode (นัดหลังเปิดบิล > 30 นาที = BOOKED ไม่งั้น WALK_IN) ⇒ ผลบนจอไม่เปลี่ยน
--   · บนฐานที่ไม่ได้ตกช่อง (local/ฐานใหม่) = 0 แถว ไม่มีผลอะไร
-- 🛑 ห้ามรันมือซ้ำหลังขึ้นจริง (เหตุผลเดียวกับ 100200 — จะไปเติมใบ "ยังไม่ระบุเวลา" ที่ภายหลังได้เวลานัด)
--
-- lock: UPDATE แตะเฉพาะใบร้านบริการที่ยังไม่มีค่า (หลักสิบ–ร้อย) · lock_timeout 5s กันยืนรอคิวขวางระบบ
--   (ล้ม = deploy ล้ม ลองใหม่ได้)
-- additive ล้วน · ไม่มี DROP/ลบแถว · rollback: ไม่ต้อง (ค่าที่เติมตรงกับที่จอแสดงอยู่แล้ว)
SET LOCAL lock_timeout = '5s';

UPDATE "Order" o SET "arrivalMode" = CASE WHEN o."serviceStart" - (o."createdAt" AT TIME ZONE 'UTC') > interval '30 minutes' THEN 'BOOKED' ELSE 'WALK_IN' END
FROM "Shop" s WHERE s."id" = o."shopId" AND s."vertical" = 'SERVICE_QUEUE' AND o."serviceStart" IS NOT NULL AND o."arrivalMode" IS NULL;
