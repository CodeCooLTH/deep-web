-- ขนาดพัสดุ (ซม.) Int → Decimal(6,2) — กล่องที่ร้านสร้างบน iShip มีทศนิยม (เช่น 20.8×42.2×15)
-- แล้วด่าน integer ของเราตีกลับ "Invalid integer: Received 20.8" (user report 2026-10-23)
-- ขยายชนิดอย่างเดียว ค่าจำนวนเต็มเดิมทุกแถวแปลงได้ตรงตัว ไม่มีข้อมูลหาย
-- rollback: ALTER ... TYPE INTEGER USING ceil(col)::int (ปัดขึ้น — ขนส่งคิดราคาตามขนาด)

ALTER TABLE "ShopShippingAccount"
    ALTER COLUMN "defaultWidth"  TYPE DECIMAL(6,2),
    ALTER COLUMN "defaultLength" TYPE DECIMAL(6,2),
    ALTER COLUMN "defaultHeight" TYPE DECIMAL(6,2);

ALTER TABLE "OrderShipment"
    ALTER COLUMN "width"  TYPE DECIMAL(6,2),
    ALTER COLUMN "length" TYPE DECIMAL(6,2),
    ALTER COLUMN "height" TYPE DECIMAL(6,2);
