-- ล้างธง SHIPPED ที่ค้างอยู่บนสินค้าของร้านที่ "ไม่ส่งของ" (SERVICE_QUEUE / LODGING)
--
-- ที่มา: user report 2026-08-07 — ร้าน BT Premium (SERVICE_QUEUE) ถูกบังคับกรอกที่อยู่จัดส่ง
-- ตอนบันทึกการเข้ารับบริการ ทั้งที่ลูกค้าขับรถมาที่ร้าน ต้นเหตุคือสินค้าในแคตตาล็อกติดธง
-- fulfillmentMode='SHIPPED' ซึ่งเกิดได้ 2 ทาง:
--   1) Quick-Create ใน createOrder/updateOrder เขียน SHIPPED ตรง ๆ จาก order.type=PHYSICAL
--      โดยไม่ผ่าน resolveFulfillmentMode จึงรอดจากการล็อกของ BR-BKU-13 มาตลอด (แก้ในโค้ดแล้ว)
--   2) ร้านที่สร้างสินค้าไว้ตอนยังเป็น ONLINE_SALES แล้วเปลี่ยนประเภททีหลัง (BT 2026-08-05)
--
-- โค้ดฝั่ง service กันไม่ให้ธงนี้มีผลกับการบังคับที่อยู่แล้ว — migration นี้ล้างข้อมูลที่ค้าง
-- ไม่ให้เหลือกับดักไว้ให้เส้นทางอื่นที่อ่าน Product.fulfillmentMode ตรง ๆ (ฟอร์มแก้สินค้า,
-- ปุ่มเปิดพัสดุ iShip) ตีความผิดต่อ
--
-- ขอบเขต: เฉพาะ Product ของร้าน 2 ประเภทนี้เท่านั้น (ไม่แตะออเดอร์ที่ปิดไปแล้ว — ประวัติคือ
-- หลักฐาน ไม่เขียนทับ) และ idempotent: รันซ้ำได้ ไม่มีผลข้างเคียง
-- ข้อมูล prod ณ วันที่เขียน: 1 แถว (ร้าน SERVICE_QUEUE 1 ร้าน)
UPDATE "Product" p
SET "fulfillmentMode" = 'NO_SHIPPING'
FROM "Shop" s
WHERE p."shopId" = s.id
  AND p."fulfillmentMode" = 'SHIPPED'
  AND s.vertical IN ('SERVICE_QUEUE', 'LODGING');
