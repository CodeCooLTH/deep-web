-- CR 2026-08-25 (feature 00058) — index รองรับการย้ายกรอง/ค้นหา/แบ่งหน้าไปที่ server
--
-- ทำไมเพิ่มก่อนที่จะมี query ที่ใช้: user สั่งไว้ตรง ๆ ว่า "ตรงไหนควรมี index ให้ทำตั้งแต่วันนี้"
-- และ index เป็นของที่ **เพิ่มความเร็วอย่างเดียว ไม่เปลี่ยนผลลัพธ์** จึงขึ้นก่อนได้อย่างปลอดภัย
-- (ตรงข้ามกับการรอให้ช้าก่อนแล้วค่อยเพิ่ม ซึ่งแปลว่ามีคนเจอความช้าไปแล้ว)
--
-- ข้อมูลที่ใช้ตัดสิน (prod 2026-08-25): ร้านใหญ่สุด 431 ใบ · 97% มีพัสดุ active
-- ⇒ LATERAL join หาพัสดุใบล่าสุดต้องทำแทบทุกแถว = จุดที่เจ็บที่สุดถ้าไม่มี index
--
-- 🛑 ทุกคำสั่งในไฟล์นี้เป็น CREATE INDEX / CREATE EXTENSION ล้วน — ไม่มี DROP ไม่มี ALTER ที่ลบข้อมูล
--    ถ้า migration นี้ล้ม build จะล้มและ deploy ไม่ขึ้น (ของเก่ายังเสิร์ฟอยู่ ไม่มีสถานะครึ่งกลาง)

-- ── 1. keyset pagination ────────────────────────────────────────────────────
-- ตัวหลักของทุก query ในหน้า /orders: เรียงใหม่→เก่าแล้วตัดด้วย cursor
-- `id` ต่อท้ายเพื่อให้ลำดับ deterministic เมื่อ createdAt ซ้ำกัน (ผู้ขายเลือกวันที่เองได้ตาม 00033
-- ⇒ ออเดอร์หลายใบมี createdAt เท่ากันเป๊ะได้จริง ไม่ใช่เคสทฤษฎี)
CREATE INDEX IF NOT EXISTS "Order_shopId_createdAt_id_idx"
  ON "Order" ("shopId", "createdAt" DESC, "id" DESC);

-- ── 2. LATERAL join หาพัสดุ active ใบล่าสุดของออเดอร์ ───────────────────────
-- ต้องตรงกับ predicate ของ ACTIVE_FORWARD_SHIPMENT (src/lib/shipment-direction.ts) เป๊ะ:
--   status='CREATED' AND "isDryRun"=false AND direction='FORWARD'
-- 🛑 ถ้าใครแก้ ACTIVE_FORWARD_SHIPMENT ต้องมาแก้ index นี้ด้วย ไม่งั้น index จะถูกมองข้ามเงียบ ๆ
--    แล้วกลายเป็น seq scan โดยไม่มีอะไรฟ้อง (query ยังถูก แค่ช้าลงเรื่อย ๆ ตามจำนวนพัสดุ)
CREATE INDEX IF NOT EXISTS "OrderShipment_active_forward_latest_idx"
  ON "OrderShipment" ("orderId", "createdAt" DESC)
  WHERE "status" = 'CREATED' AND "isDryRun" = false AND "direction" = 'FORWARD';

-- ── 3. ค้นด้วยเลขพัสดุ ──────────────────────────────────────────────────────
-- เลขพัสดุมี 2 ทางเข้าเก็บคนละตาราง (docs/conventions/one-value-many-entry-points.md):
--   iShip → OrderShipment.trackingNo · ร้านแจ้งเอง → ShipmentTracking.trackingNo
-- OrderShipment มี partial unique อยู่แล้ว (WHERE trackingNo IS NOT NULL) ใช้ค้นได้ ไม่ต้องเพิ่ม
CREATE INDEX IF NOT EXISTS "ShipmentTracking_trackingNo_idx"
  ON "ShipmentTracking" ("trackingNo");

-- ── 4. ค้นข้อความแบบ contains ───────────────────────────────────────────────
-- 🛑 pg_trgm เป็น extension ตัวแรกของโปรเจกต์นี้ (ก่อนหน้านี้ไม่มี trgm/tsvector/GIN บน text เลย)
-- จำเป็นเพราะกติกาค้นหาของ 00058 คือ **substring กลางคำ** (`ยีนส์` ต้องเจอ `กางเกงยีนส์`)
-- ซึ่ง B-tree ช่วยไม่ได้เลย — มันช่วยได้แค่ prefix
--
-- 🛑 Prisma แสดง trgm operator class ใน schema.prisma ไม่ได้ ⇒ index 2 ตัวนี้เป็น unmanaged SQL
--    **ห้าม `prisma db pull`** (HR15) เพราะ introspect จะไม่เห็นแล้วพยายามลบทิ้ง
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Order_buyerName_trgm_idx"
  ON "Order" USING GIN ("buyerName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "OrderItem_name_trgm_idx"
  ON "OrderItem" USING GIN ("name" gin_trgm_ops);
