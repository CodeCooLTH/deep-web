-- feature 00056 ต่อ — ปลดล็อก "1 ออเดอร์ = พัสดุขาไป 1 + ขากลับ 1" + เก็บเวลาขากลับ
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🛑 ส่วนที่ 1 แก้บั๊กที่ทำให้ระบบคืนของ (00056) เปิดพัสดุขากลับไม่ได้เลยสักใบ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `OrderShipment_active_order_key` ถูกสร้างไว้ตั้งแต่ 20260726000000 เป็น
-- `("orderId") WHERE status <> 'CANCELLED'` = **1 ออเดอร์มีพัสดุที่ยังไม่ถูกยกเลิกได้ใบเดียว**
-- ตอนนั้นถูกต้อง เพราะยังไม่มีแนวคิดเรื่องทิศทาง — แต่ 00056 (20260824150000) เพิ่มคอลัมน์
-- `direction` แล้ว **ไม่ได้ตามมาแก้ index ตัวนี้**
--
-- ผลคือเส้นทางนี้ชนกันพอดีตัว:
--   1. `canCreateReturn()` บังคับว่าเปิดใบคืนได้ต่อเมื่อของถึงมือลูกค้าแล้ว
--      ⇒ ออเดอร์นั้น "มีพัสดุขาไป status='CREATED' อยู่แน่นอน"
--   2. `createReturnShipment()` สร้างแถวใหม่ `status='PENDING' direction='RETURN'` บน orderId เดิม
--   3. index เห็น 'PENDING' <> 'CANCELLED' ⇒ **P2002** ทุกครั้งโดยไม่มีข้อยกเว้น
--   4. จุดนั้นไม่มี try/catch P2002 ⇒ ร้านได้ 500 ดิบ
--
-- ยืนยันกับ prod 2026-08-25 (อ่านอย่างเดียว): `OrderShipment` มี `direction='RETURN'`
-- **0 แถว** และ `OrderReturn` **0 แถว** ทั้งที่ฟีเจอร์ขึ้น prod ไปแล้ว = ไม่เคยสำเร็จสักครั้ง
--
-- 🛑 index นี้เป็น **unmanaged SQL** (Prisma DSL ประกาศ partial unique ไม่ได้) —
--    `prisma db pull` มองไม่เห็นแล้วจะสร้าง migration ที่ DROP ทิ้ง **ห้ามรันเด็ดขาด**
--
-- ปลอดภัยที่จะ DROP แล้วสร้างใหม่: ของเดิมเข้มกว่า (unique บน orderId ล้วน) ⇒ ข้อมูลที่มีอยู่
-- ผ่านเงื่อนไขใหม่ที่หลวมกว่าเสมอ เป็นไปไม่ได้ที่ CREATE จะล้มเพราะข้อมูลเดิมซ้ำ
--
-- เพดานใหม่ = **1 ขาไป + 1 ขากลับ ต่อออเดอร์** (มติ D-RL-1) ไม่ใช่ N ใบ:
-- ทุกจุดที่หา "พัสดุของออเดอร์นี้" ใช้ `take: 1, orderBy createdAt desc` อยู่ (order.service.ts,
-- buyer-reputation.service.ts ฯลฯ) วันที่ยอมให้มีขาไปหลายใบ จุดพวกนั้นจะตอบเรื่องใบล่าสุด
-- ใบเดียวเงียบ ๆ ทั้งสถานะ/ชื่อเสียงผู้ซื้อ/ปิดงานอัตโนมัติ/ค่าส่งในกำไร — ต้องเป็นงานแยก
DROP INDEX IF EXISTS "OrderShipment_active_order_key";

CREATE UNIQUE INDEX "OrderShipment_active_order_key"
    ON "OrderShipment"("orderId", "direction")
    WHERE "status" <> 'CANCELLED';

-- ═══════════════════════════════════════════════════════════════════════════
-- ส่วนที่ 2 — เวลาของ "ขากลับ" บนแถวพัสดุขาไป (write-once ทั้งคู่)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ทำไมต้องมีคอลัมน์ ทั้งที่ `ShipmentEvent` เก็บเหตุการณ์ไว้ครบแล้ว — 3 เหตุผล:
--
--   1. `carrierStatus`/`carrierStatusAt` **ถูกเขียนทับทุกครั้งที่สถานะขยับ** นี่คือเหตุผล
--      เดียวกับที่ `deliveredAt` ถูกสร้างขึ้นมาเมื่อ feature 00039 (ดูคอมเมนต์ที่คอลัมน์นั้น)
--   2. ไทม์ไลน์ 2 แถวต้องวาดได้จาก "ค่าที่มีในมือ" ห้ามให้แถวในหน้า `/orders` ต้อง join
--      `ShipmentEvent` เพิ่ม (เส้นทางที่ร้อนที่สุดของระบบ — ทุกร้านเปิดหน้านี้ตลอดวัน)
--   3. ข้อมูลจริงบน prod: event `return` เกิด **44 ครั้งกับ 12 พัสดุ** (บางใบซ้ำ 7–8 ครั้ง
--      เพราะขนส่งพยายามส่งใหม่หลายรอบก่อนยอมตีกลับ) ⇒ "ครั้งแรก" ต้องถูกตรึงไว้
--      ไม่งั้นวันที่จะขยับทุกครั้งที่ขนส่งพยายามใหม่
ALTER TABLE "OrderShipment" ADD COLUMN "returnStartedAt" TIMESTAMP(3);
ALTER TABLE "OrderShipment" ADD COLUMN "returnedAt"      TIMESTAMP(3);

-- ── backfill จาก ShipmentEvent ────────────────────────────────────────────────
-- `MIN(occurredAt)` = ครั้งแรกเสมอ (ดูเหตุผลข้อ 3 ข้างบน)
UPDATE "OrderShipment" AS s
SET "returnStartedAt" = agg.first_at
FROM (
    SELECT "shipmentId", MIN("occurredAt") AS first_at
    FROM "ShipmentEvent"
    WHERE "status" = 'return'
    GROUP BY "shipmentId"
) AS agg
WHERE s.id = agg."shipmentId";

UPDATE "OrderShipment" AS s
SET "returnedAt" = agg.first_at
FROM (
    SELECT "shipmentId", MIN("occurredAt") AS first_at
    FROM "ShipmentEvent"
    WHERE "status" = 'return_success'
    GROUP BY "shipmentId"
) AS agg
WHERE s.id = agg."shipmentId";

-- 🛑 **ห้ามเติม `returnedAt` ให้ใบที่ `carrierStatus='return_success'` แต่ไม่มี event รองรับ**
--
-- บน prod 2026-08-25 มี 12 ใบที่ `carrierStatus='return_success'` แต่มี event `return_success`
-- แค่ 6 ใบ — อีก 6 ใบสถานะถูกเขียนโดยรอบ poll (`query_orders`) ซึ่งไม่ผ่าน `ShipmentEvent`
--
-- 6 ใบนั้น "ถึงร้านแล้วจริง แต่ไม่รู้ว่าเมื่อไร" ⇒ `returnedAt` ต้องเป็น NULL และหน้าจอต้อง
-- เขียนว่า "ขนส่งไม่ได้แจ้งเวลา" ตรง ๆ  การเดาวันที่ (เช่นใส่ `carrierStatusAt` แทน) จะได้
-- ตัวเลขที่หน้าตาเหมือนข้อมูลจริงทุกประการแต่ผิด ซึ่งอันตรายกว่าไม่มีตัวเลข
-- (docs/conventions/partial-data-must-be-labeled-or-filled.md)
--
-- จุดสว่างบนไทม์ไลน์ตัดสินจาก `carrierStatus` ไม่ใช่จาก `returnedAt` ⇒ 6 ใบนั้นยังขึ้น
-- "ถึงร้านค้า" ถูกต้อง แค่ไม่มีวันเวลากำกับ

-- ค้นเร็วสำหรับงานที่ถามว่า "พัสดุใบไหนกลับมาถึงร้านแล้วบ้าง" (ตัวเดียวกับท่าของ deliveredAt)
CREATE INDEX "OrderShipment_returnedAt_idx"
    ON "OrderShipment"("returnedAt") WHERE "returnedAt" IS NOT NULL;
