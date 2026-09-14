-- OrderShipment.problemAt — "พัสดุใบนี้เคยมีปัญหาครั้งแรกเมื่อไร" (write-once)
--
-- ทำไมต้องมี: `carrierStatus` เป็นสถานะ *ปัจจุบัน* ซึ่งเดินถอยหลังได้ — ขนส่งไปส่งแล้วไม่เจอ
-- ผู้รับ (`issue`) วันถัดมากลับไปเป็น `progress` เพื่อลองส่งใหม่ ⇒ กอง "พัสดุมีปัญหา" หายไปเอง
-- ทั้งที่ยังไม่มีใครแก้อะไร (user เจอบน prod 2026-09-14)
ALTER TABLE "OrderShipment" ADD COLUMN "problemAt" TIMESTAMP(3);

-- ─── backfill ───────────────────────────────────────────────────────────────
-- 🛑 สองแหล่ง ไม่ใช่แหล่งเดียว เพราะแต่ละแหล่งเห็นคนละครึ่งของความจริง:
--   1) carrierStatus ปัจจุบัน — เห็นเฉพาะใบที่ "ยังค้างมีปัญหาอยู่ตอนนี้"
--   2) ShipmentEvent      — เห็นใบที่ "เคยมีปัญหาแล้วเดินต่อไปแล้ว" ซึ่งคือกลุ่มที่ฟีเจอร์นี้
--      ถูกสร้างมาเพื่อ แต่มีประวัติแค่บางใบ (prod 2026-08-24: พัสดุ active 399 ใบ ไม่มี event
--      เลย 255 ใบ = 64%) ⇒ กู้ได้เท่าที่มี ที่เหลือเริ่มนับจากปัญหาครั้งถัดไป
--
-- `LEAST` ของ Postgres **ข้าม NULL ให้เอง** (ต่างจาก `+`/comparison) ⇒ ใบที่มีแหล่งเดียว
-- ได้ค่าจากแหล่งนั้น ใบที่มีสองแหล่งได้ค่าที่เก่ากว่า — ซึ่งคือ "ครั้งแรก" ตามนิยามของคอลัมน์
--
-- รายชื่อสถานะยกมาจาก PROBLEM_CARRIER_STATUSES (src/lib/iship/status.ts) —
-- migration เป็นสแนปช็อต ณ วันนี้ ไม่ใช่ SSOT: ฝั่งโค้ดยังอ่านจากไฟล์นั้นที่เดียวเหมือนเดิม
UPDATE "OrderShipment" s
SET "problemAt" = LEAST(
  (
    SELECT MIN(e."occurredAt")
    FROM "ShipmentEvent" e
    WHERE e."shipmentId" = s."id"
      AND e."status" IN ('issue', 'cannot_pickup', 'is_expired', 'cod_refund')
  ),
  CASE
    WHEN s."carrierStatus" IN ('issue', 'cannot_pickup', 'is_expired', 'cod_refund')
    THEN COALESCE(s."carrierStatusAt", s."updatedAt")
  END
)
WHERE s."carrierStatus" IN ('issue', 'cannot_pickup', 'is_expired', 'cod_refund')
   OR EXISTS (
     SELECT 1
     FROM "ShipmentEvent" e
     WHERE e."shipmentId" = s."id"
       AND e."status" IN ('issue', 'cannot_pickup', 'is_expired', 'cod_refund')
   );
