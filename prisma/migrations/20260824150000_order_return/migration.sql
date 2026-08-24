-- feature 00056 — ระบบคืนของ (Order Return)
--
-- additive ล้วน: 1 คอลัมน์ที่มี DEFAULT + 2 ตารางใหม่ · ไม่มี backfill ไม่ลบอะไร
-- PostgreSQL 11+ เพิ่มคอลัมน์ที่มี DEFAULT โดยไม่ rewrite ตาราง → ไม่ล็อกยาวแม้ "OrderShipment"
-- จะมีแถวจริงบน prod อยู่แล้ว (399 ใบ active)
--
-- 🛑 ไม่แตะ CHECK ของ "Order".status เพราะ **ไม่มี CHECK บนคอลัมน์นั้นเลย** (ตรวจ prod
-- 2026-08-24: Order มี CHECK 9 ตัวคุม cancelReason/appointmentStatus/booking ฯลฯ ไม่มีตัวไหน
-- คุม status) การเพิ่มค่า 'RETURNED' จึงไม่ต้อง migrate คอลัมน์ — แต่แปลว่า TypeScript เป็น
-- ด่านเดียว ต้องไล่ 60 จุดที่เทียบ status ตรง ๆ ด้วยมือ (BRD §4.1)

-- ── ทิศทางของพัสดุ ────────────────────────────────────────────────────────────
-- แถวเดิมทั้งหมดเป็นพัสดุขาไป → DEFAULT 'FORWARD' ทำให้ข้อมูลเดิมถูกต้องทันทีโดยไม่ต้อง backfill
ALTER TABLE "OrderShipment" ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'FORWARD';

-- allow-list ที่ระดับฐาน — คอลัมน์นี้ตัดสินว่าออเดอร์ "ยังส่งอยู่" หรือ "คืนของแล้ว"
-- ค่าที่สะกดผิดจะทำให้พัสดุขากลับถูกอ่านเป็นขาไปเงียบ ๆ ซึ่งไม่มีจอไหนฟ้อง
ALTER TABLE "OrderShipment" ADD CONSTRAINT "OrderShipment_direction_check"
  CHECK ("direction" IN ('FORWARD', 'RETURN'));

-- ค้นพัสดุขาไปของออเดอร์ (เส้นทางที่ร้อนที่สุด — ทุกหน้ารายการออเดอร์วิ่งผ่าน)
CREATE INDEX "OrderShipment_orderId_direction_idx" ON "OrderShipment"("orderId", "direction");

-- ── ใบคืนของ ──────────────────────────────────────────────────────────────────
CREATE TABLE "OrderReturn" (
    "id"              TEXT NOT NULL,
    "orderId"         TEXT NOT NULL,
    "shopId"          TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'REQUESTED',
    "reason"          TEXT,
    "shipmentId"      TEXT,
    "refundAmount"    DECIMAL(12,2),
    "createdByUserId" TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    "receivedAt"      TIMESTAMP(3),
    "cancelledAt"     TIMESTAMP(3),

    CONSTRAINT "OrderReturn_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_status_check"
  CHECK ("status" IN ('REQUESTED', 'SHIPPING', 'RECEIVED', 'CANCELLED'));

-- ยอดที่คืนติดลบไม่ได้ — บั๊กที่ทำให้ยอดขาย "เพิ่มขึ้น" จากการคืนของต้องชนที่ฐาน ไม่ใช่แค่ log
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_refund_nonneg"
  CHECK ("refundAmount" IS NULL OR "refundAmount" >= 0);

CREATE UNIQUE INDEX "OrderReturn_shipmentId_key" ON "OrderReturn"("shipmentId");
CREATE INDEX "OrderReturn_orderId_idx" ON "OrderReturn"("orderId");
CREATE INDEX "OrderReturn_shopId_status_idx" ON "OrderReturn"("shopId", "status");

-- 🛑 BR-RT-03 — 1 ออเดอร์มีใบคืนที่ "ยังไม่จบ" ได้ใบเดียว
-- partial unique ที่ระดับฐาน ไม่ใช่ find-then-insert: สองคนในร้านกดพร้อมกันแล้วออกเลขพัสดุ
-- ขากลับ 2 ใบ = จ่ายค่าส่งสองรอบและลูกค้าได้เลขสองเลข ความถูกต้องต้องอยู่ที่ฐานเสมอ
CREATE UNIQUE INDEX "OrderReturn_one_open_per_order"
  ON "OrderReturn"("orderId") WHERE "status" IN ('REQUESTED', 'SHIPPING');

ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_shipmentId_fkey"
  FOREIGN KEY ("shipmentId") REFERENCES "OrderShipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── รายการที่คืน ──────────────────────────────────────────────────────────────
CREATE TABLE "OrderReturnItem" (
    "id"          TEXT NOT NULL,
    "returnId"    TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "qty"         INTEGER NOT NULL,
    "unitPrice"   DECIMAL(12,2) NOT NULL,

    CONSTRAINT "OrderReturnItem_pkey" PRIMARY KEY ("id")
);

-- คืน 0 หรือติดลบไม่ใช่การคืน — ต้องชนที่ฐาน
ALTER TABLE "OrderReturnItem" ADD CONSTRAINT "OrderReturnItem_qty_positive" CHECK ("qty" >= 1);
ALTER TABLE "OrderReturnItem" ADD CONSTRAINT "OrderReturnItem_price_nonneg" CHECK ("unitPrice" >= 0);

-- รายการเดิมหนึ่งแถวปรากฏในใบคืนหนึ่งใบได้ครั้งเดียว — กันกดซ้ำแล้วยอดคืนเกินจริง
CREATE UNIQUE INDEX "OrderReturnItem_returnId_orderItemId_key"
  ON "OrderReturnItem"("returnId", "orderItemId");
CREATE INDEX "OrderReturnItem_orderItemId_idx" ON "OrderReturnItem"("orderItemId");

ALTER TABLE "OrderReturnItem" ADD CONSTRAINT "OrderReturnItem_returnId_fkey"
  FOREIGN KEY ("returnId") REFERENCES "OrderReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderReturnItem" ADD CONSTRAINT "OrderReturnItem_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
