-- feat 00017 Lodging Vertical — Migration M1 (Phase 1)
-- ขอบเขต: Shop.vertical (ประเภทกิจการ) + ตาราง Room (ห้องพัก)
--
-- hand-written (shared dev/prod DB — ห้าม prisma migrate dev; ดู docs/conventions/prisma-shared-db-drift.md)
-- อ้างอิง: docs/20 - Features/00017 - Lodging Vertical/DATABASE.md §5.1 M1
--
-- ความปลอดภัย: additive ล้วน ไม่ลบ ไม่เปลี่ยนชนิด ไม่ rename คอลัมน์เดิมแม้แต่จุดเดียว
--   - Shop.vertical มี DEFAULT → Shop เดิมทุกแถวได้ 'GENERAL' อัตโนมัติ ไม่ต้อง backfill (BR-LODG-01/03)
--   - ADD COLUMN ที่มี default บน PostgreSQL 11+ ไม่ rewrite ตาราง (metadata-only) จึงไม่ล็อกนาน
--   - Room เป็นตารางใหม่ ไม่มีข้อมูล จึงเพิ่ม CHECK แบบปกติได้เลย (ไม่ต้อง NOT VALID)

-- ---------------------------------------------------------------------------
-- 1) Shop.vertical — ประเภทกิจการ
-- ---------------------------------------------------------------------------
-- 'GENERAL' = สินค้าและบริการ (ecommerce เดิม) | 'LODGING' = บ้านพักตากอากาศ
-- IMPORTANT: คนละเรื่องกับ Shop."businessType" (INDIVIDUAL|COMPANY — L3 verification),
-- Shop."kind" (PERSONAL|BUSINESS — feature 00008) และ Shop."category" (หมวดสินค้า) — ห้าม reuse (BR-LODG-04)
-- immutable หลังสร้าง (BR-LODG-30) — บังคับที่ service layer ไม่ใช่ DB trigger
ALTER TABLE "Shop" ADD COLUMN "vertical" TEXT NOT NULL DEFAULT 'GENERAL';

-- index รองรับการกรองธุรกิจตามประเภท (แอดมิน/รายงาน) + gate เมนูฝั่ง seller
CREATE INDEX "Shop_vertical_idx" ON "Shop"("vertical");

-- ---------------------------------------------------------------------------
-- 2) Room — ห้องพัก
-- ---------------------------------------------------------------------------
CREATE TABLE "Room" (
    "id"            TEXT NOT NULL,
    "shopId"        TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "description"   TEXT,
    -- images: array ของ fileId เรียงตามลำดับแสดงผล ตัวแรก = รูปหลัก
    -- เพดาน 10 รูปบังคับที่ app layer (BR-LODG-34) — JSONB บังคับจำนวนไม่ได้
    "images"        JSONB NOT NULL DEFAULT '[]',
    -- Decimal(12,2) ให้ตรงกับ "Order"."totalAmount" / "Product"."price" เดิม
    "pricePerNight" DECIMAL(12,2) NOT NULL,
    "maxGuests"     INTEGER,
    -- facilities: key จาก src/lib/lodging.ts ROOM_FACILITIES (validate ที่ app layer)
    "facilities"    TEXT[] NOT NULL DEFAULT '{}',
    -- depositMode/depositValue = ค่าเริ่มต้นของห้องเท่านั้น
    -- IMPORTANT: ยอดจริงต่อการจอง snapshot ไว้ที่ "Order"."depositAmount" ใน M2 (BR-LODG-18)
    -- ห้ามให้การจองอ้างอิงค่านี้สด มิฉะนั้นยอดของการจองเก่าจะขยับตามเมื่อเจ้าของแก้ห้อง
    "depositMode"   TEXT NOT NULL DEFAULT 'FIXED',
    "depositValue"  DECIMAL(12,2) NOT NULL DEFAULT 0,
    -- isActive=false = หยุดรับจองใหม่ แต่การจองเดิมยังดูได้ (BR-LODG-07)
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- list ห้องของร้าน + กรองเฉพาะที่เปิดใช้งาน (หน้าโปรไฟล์สาธารณะ)
CREATE INDEX "Room_shopId_isActive_idx" ON "Room"("shopId", "isActive");

-- Cascade: ลบร้าน = ลบห้อง (ห้องไม่มีความหมายนอกร้าน)
-- หมายเหตุ M2: "Order"."roomId" จะเป็น ON DELETE RESTRICT — ห้ามลบห้องที่มีการจอง (BR-LODG-06)
ALTER TABLE "Room" ADD CONSTRAINT "Room_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3) CHECK constraints ของ Room
-- ---------------------------------------------------------------------------
-- ตารางเพิ่งสร้าง ไม่มีข้อมูล จึง VALIDATE ได้ทันที (ต่างจาก CHECK บน "Order" ใน M2
-- ที่ต้องใช้ NOT VALID + VALIDATE แยก เพราะตารางมีข้อมูล prod อยู่แล้ว)

-- ราคาต่อคืนต้องมากกว่า 0 — ราคา 0 ทำให้ยอดรวมและมัดจำไม่มีความหมาย (BR-LODG-05)
ALTER TABLE "Room" ADD CONSTRAINT "Room_price_positive"
    CHECK ("pricePerNight" > 0);

ALTER TABLE "Room" ADD CONSTRAINT "Room_deposit_mode"
    CHECK ("depositMode" IN ('FIXED', 'PERCENT'));

-- depositValue >= 0 เสมอ; โหมด PERCENT ห้ามเกิน 100 (BR-LODG-15/16)
-- 0 = ไม่เก็บมัดจำ ซึ่งถูกต้องทั้งสองโหมด (BR-LODG-17)
ALTER TABLE "Room" ADD CONSTRAINT "Room_deposit_value"
    CHECK ("depositValue" >= 0 AND ("depositMode" <> 'PERCENT' OR "depositValue" <= 100));
