-- feat 00017 Lodging Vertical — Migration M3 (Phase 3: แม่บ้าน)
--
-- hand-written (shared dev/prod DB — ห้าม prisma migrate dev; ดู docs/conventions/prisma-shared-db-drift.md)
-- อ้างอิง: docs/20 - Features/00017 - Lodging Vertical/DATABASE.md §5.1 M3
--
-- ความปลอดภัย: additive ล้วน
--   - Housekeeper เป็นตารางใหม่ ไม่มีข้อมูล
--   - Order เพิ่ม 2 คอลัมน์ nullable ไม่มี default → ไม่ rewrite ตาราง
--   - CHECK ของ housekeepingStatus ใช้ NOT VALID + VALIDATE เพราะ Order มีข้อมูล prod

-- ---------------------------------------------------------------------------
-- 1) Housekeeper — ตารางแม่บ้าน
-- ---------------------------------------------------------------------------
-- ไม่มี userId โดยเจตนา (BR-LODG-24) — แม่บ้านไม่ใช่ผู้ใช้ในระบบ
CREATE TABLE "Housekeeper" (
    "id"        TEXT NOT NULL,
    "shopId"    TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "phone"     TEXT NOT NULL,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Housekeeper_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Housekeeper_shopId_isActive_idx" ON "Housekeeper"("shopId", "isActive");

-- ลบร้าน = ลบรายชื่อแม่บ้าน (ไม่มีความหมายนอกร้าน)
ALTER TABLE "Housekeeper" ADD CONSTRAINT "Housekeeper_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2) Order — คอลัมน์งานแม่บ้าน (additive nullable)
-- ---------------------------------------------------------------------------
ALTER TABLE "Order" ADD COLUMN "housekeeperId"      TEXT;
ALTER TABLE "Order" ADD COLUMN "housekeepingStatus" TEXT;

-- ON DELETE SET NULL: ลบแม่บ้านได้ การจองเดิมยังอยู่ แค่ไม่มีผู้รับผิดชอบผูก
ALTER TABLE "Order" ADD CONSTRAINT "Order_housekeeperId_fkey"
    FOREIGN KEY ("housekeeperId") REFERENCES "Housekeeper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Order_housekeeperId_status_idx" ON "Order"("housekeeperId", "housekeepingStatus");

-- housekeepingStatus ต้องอยู่ใน 2 ค่าหรือ NULL (BR-LODG-26)
-- แถวเดิมทุกแถวเป็น NULL อยู่แล้ว จึงผ่านอัตโนมัติ — NOT VALID กันสแกนตอน ALTER แล้วค่อย VALIDATE
ALTER TABLE "Order" ADD CONSTRAINT "Order_housekeeping_status"
    CHECK ("housekeepingStatus" IS NULL OR "housekeepingStatus" IN ('PENDING', 'DONE')) NOT VALID;

ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_housekeeping_status";
