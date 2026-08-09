-- ต้นทุนจริงของการจัดส่ง (FR-EXP-18/20/22, feature 00016 ส่วนขยาย 2026-08-09)
--
-- `carrierPrice` มีอยู่แล้วตั้งแต่ 20260726000000 แต่ไม่เคยถูกเขียนสำเร็จเลยสักแถวบน prod
-- (จุดเขียนเดียวคือ webhook ที่ไม่มี ISHIP_WEBHOOK_SECRET บน production → ตอบ 404 ทุกคำขอ)
-- รอบนี้ย้ายไปเขียนจาก `syncShipmentStatuses()` ซึ่งยิง `query_orders` อยู่แล้วทุก 15 นาที
--
-- เพิ่ม 2 คอลัมน์ที่ payload เดียวกันมีให้อยู่แล้วแต่เราไม่เคยประกาศ:
--   actualWeight = `actual_weight` น้ำหนักที่ขนส่งชั่งได้จริง (แยกจาก weight ที่ร้านแจ้ง)
--   codFee       = `cod_fee` ค่าธรรมเนียมเก็บเงินปลายทาง — เงินคนละก้อนกับค่าส่ง ไม่ทับซ้อน
--
-- additive ล้วน: ไม่มี NOT NULL ไม่มี default ไม่แตะ CHECK ที่มีอยู่ (ดู migration-check-constraint-additive.md)
-- แถวเดิมทั้งหมดได้ NULL = "ยังไม่รู้" ซึ่งต่างจาก 0 = "ไม่มีค่าใช้จ่าย" โดยตั้งใจ

ALTER TABLE "OrderShipment"
  ADD COLUMN IF NOT EXISTS "actualWeight" DECIMAL(6,2),
  ADD COLUMN IF NOT EXISTS "codFee"       DECIMAL(12,2);
