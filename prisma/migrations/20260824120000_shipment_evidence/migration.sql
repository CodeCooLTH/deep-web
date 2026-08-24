-- feature 00055 — หลักฐานจากขนส่งสำหรับกรณีพิพาท (ShipmentEvidence)
--
-- additive ล้วน: ตารางใหม่ 1 ตาราง ไม่แตะตารางเดิม ไม่มี backfill ไม่แตะ CHECK constraint ใด
-- (docs/conventions/migration-check-constraint-additive.md ไม่เกี่ยวกับไฟล์นี้เพราะไม่มี CHECK)
--
-- ทำไม (ตรวจ prod 2026-08-24): ShipmentEvent 1,015 แถว มี payload ดิบ 0 แถว — webhook ของ
-- iShip ไม่เคยยิงเลยสักครั้ง ทุกแถวเป็น POLL ซึ่งไม่บันทึก payload · และพัสดุที่ยัง active
-- 399 ใบ ไม่มี event เลย 255 ใบ (64%) เพราะไทม์ไลน์ถูกเขียนเฉพาะตอนมีคนเปิดดู
-- ⇒ วันที่ลูกค้าโต้แย้ง เราไม่มีอะไรยืนยันในกรณีส่วนใหญ่
--
-- เก็บเฉพาะใบที่ "มีปัญหา/ตีกลับ" ตามที่หัวหน้าสั่ง ไม่ใช่ทุกใบ
CREATE TABLE "ShipmentEvidence" (
    "id"         TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "orderId"    TEXT NOT NULL,
    "reason"     TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traceCount" INTEGER NOT NULL DEFAULT 0,
    "traces"     JSONB,
    "parcel"     JSONB,
    "error"      TEXT,

    CONSTRAINT "ShipmentEvidence_pkey" PRIMARY KEY ("id")
);

-- กันเก็บซ้ำสถานะเดิมของใบเดิม — สถานะใหม่เก็บเพิ่มได้ (return → return_success = 2 แถว)
-- ใช้ unique เป็นตัวกันแทน find-then-insert เพราะ poller หลายรอบทับกันได้ (ความถูกต้องต้องอยู่
-- ที่ระดับฐาน ไม่ใช่ที่ลำดับของโค้ด — docs/conventions/insert-then-catch-logs-every-error.md)
CREATE UNIQUE INDEX "ShipmentEvidence_shipmentId_reason_key" ON "ShipmentEvidence"("shipmentId", "reason");
CREATE INDEX "ShipmentEvidence_orderId_idx" ON "ShipmentEvidence"("orderId");
CREATE INDEX "ShipmentEvidence_capturedAt_idx" ON "ShipmentEvidence"("capturedAt");

ALTER TABLE "ShipmentEvidence" ADD CONSTRAINT "ShipmentEvidence_shipmentId_fkey"
  FOREIGN KEY ("shipmentId") REFERENCES "OrderShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
