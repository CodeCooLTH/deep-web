-- feature 00022 — iShip Shipping Integration
-- additive ล้วน: สร้าง 4 ตารางใหม่ ไม่แตะตารางเดิมแม้แต่คอลัมน์เดียว ไม่มี backfill
-- rollback = DROP TABLE 4 ตัว (ดู DATABASE.md §5.4)
--
-- 🛑 เขียนมือตาม docs/conventions/prisma-shared-db-drift.md — ห้าม `prisma migrate dev`
--    (DB dev = prod แชร์กัน + มี orphaned migration นอก git → migrate dev จะ reset และลบข้อมูลจริง)

-- ============================================================================
-- 1) ShopShippingAccount — การเชื่อมต่อ iShip ของร้าน + ค่าตั้งต้น (1 ร้าน 1 บัญชี)
-- ============================================================================
CREATE TABLE "ShopShippingAccount" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ISHIP',
    "accessTokenEnc" TEXT NOT NULL,
    "tokenLast4" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createMode" TEXT NOT NULL DEFAULT 'ASK',
    "senderName" TEXT,
    "senderPhone" TEXT,
    "senderAddress" TEXT,
    "senderSubdistrict" TEXT,
    "senderDistrict" TEXT,
    "senderProvince" TEXT,
    "senderPostcode" TEXT,
    "defaultCourierCode" TEXT,
    "defaultWeight" DECIMAL(6,2),
    "defaultWidth" INTEGER,
    "defaultLength" INTEGER,
    "defaultHeight" INTEGER,
    "defaultCategoryId" INTEGER,
    "defaultCodEnabled" BOOLEAN NOT NULL DEFAULT false,
    "optOnTime" BOOLEAN NOT NULL DEFAULT false,
    "optBoxShield" BOOLEAN NOT NULL DEFAULT false,
    "optIsInsured" BOOLEAN NOT NULL DEFAULT false,
    "optProductValue" DECIMAL(12,2),
    "optServiceType" INTEGER,
    "defaultRemark" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastVerifyError" TEXT,
    "connectedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopShippingAccount_pkey" PRIMARY KEY ("id")
);

-- 1 ร้าน 1 บัญชีขนส่ง (BR-ISHIP-10)
CREATE UNIQUE INDEX "ShopShippingAccount_shopId_key" ON "ShopShippingAccount"("shopId");
CREATE INDEX "ShopShippingAccount_status_idx" ON "ShopShippingAccount"("status");

ALTER TABLE "ShopShippingAccount"
    ADD CONSTRAINT "ShopShippingAccount_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- 2) OrderShipment — พัสดุ 1 ใบที่เปิดกับขนส่ง ผูกกับคำสั่งซื้อ
-- ============================================================================
CREATE TABLE "OrderShipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ISHIP',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "courierCode" TEXT,
    "courierName" TEXT,
    "trackingNo" TEXT,
    "refCode" TEXT,
    "externalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "codAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "weight" DECIMAL(6,2),
    "width" INTEGER,
    "length" INTEGER,
    "height" INTEGER,
    "categoryId" INTEGER,
    "senderSnapshot" JSONB,
    "receiverSnapshot" JSONB,
    "optionsSnapshot" JSONB,
    "carrierStatus" TEXT,
    "carrierStatusText" TEXT,
    "carrierStatusAt" TIMESTAMP(3),
    "isOverSize" BOOLEAN NOT NULL DEFAULT false,
    "isOverWeight" BOOLEAN NOT NULL DEFAULT false,
    "carrierPrice" DECIMAL(12,2),
    "labelPrintedAt" TIMESTAMP(3),
    "labelPrintCount" INTEGER NOT NULL DEFAULT 0,
    "isDryRun" BOOLEAN NOT NULL DEFAULT false,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "cancelledByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderShipment_pkey" PRIMARY KEY ("id")
);

-- กันเปิดพัสดุซ้ำ: retry ใช้คีย์เดิม → ชน unique แทนที่จะเกิดใบที่สอง (BR-ISHIP-22/26)
CREATE UNIQUE INDEX "OrderShipment_idempotencyKey_key" ON "OrderShipment"("idempotencyKey");
CREATE INDEX "OrderShipment_orderId_idx" ON "OrderShipment"("orderId");
CREATE INDEX "OrderShipment_shopId_status_idx" ON "OrderShipment"("shopId", "status");

-- 🛑 partial unique index — Prisma DSL ประกาศไม่ได้ ต้องเขียนมือ (unmanaged SQL)
--    `prisma db pull` จะมองไม่เห็นแล้วสร้าง migration ที่ DROP ทิ้ง — ห้ามรันเด็ดขาด
--    (precedent เดียวกับ ShopChannel_active_partial_unique ของ feat 00018
--     และ Order_room_no_overlap EXCLUDE constraint ของ feat 00017)

-- 1 ออเดอร์ = พัสดุที่ยังใช้งานอยู่ได้ใบเดียว แต่ยกเลิกแล้วเปิดใหม่ได้ (BR-ISHIP-22)
CREATE UNIQUE INDEX "OrderShipment_active_order_key"
    ON "OrderShipment"("orderId")
    WHERE "status" <> 'CANCELLED';

-- เลขติดตามห้ามซ้ำ แต่ใบที่ยังไม่สำเร็จมี trackingNo NULL ได้หลายใบ
CREATE UNIQUE INDEX "OrderShipment_trackingNo_key"
    ON "OrderShipment"("trackingNo")
    WHERE "trackingNo" IS NOT NULL;

ALTER TABLE "OrderShipment"
    ADD CONSTRAINT "OrderShipment_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderShipment"
    ADD CONSTRAINT "OrderShipment_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- 3) ShipmentEvent — ประวัติการเดินทางของพัสดุ
-- ============================================================================
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "statusText" TEXT,
    "statusDesc" TEXT,
    "location" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'WEBHOOK',
    "dedupeKey" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- กัน webhook ยิงซ้ำแล้วไทม์ไลน์บวม (FR-ISHIP-041)
CREATE UNIQUE INDEX "ShipmentEvent_shipmentId_dedupeKey_key"
    ON "ShipmentEvent"("shipmentId", "dedupeKey");
CREATE INDEX "ShipmentEvent_shipmentId_occurredAt_idx"
    ON "ShipmentEvent"("shipmentId", "occurredAt");

ALTER TABLE "ShipmentEvent"
    ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey"
    FOREIGN KEY ("shipmentId") REFERENCES "OrderShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- 4) ShipmentPickup — คำขอเรียกรถเข้ารับ (ระดับร้าน ไม่ใช่ระดับออเดอร์)
-- ============================================================================
CREATE TABLE "ShipmentPickup" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ISHIP',
    "courierCode" TEXT NOT NULL,
    "ticketPickupId" TEXT,
    "parcelCount" INTEGER NOT NULL DEFAULT 1,
    "pickupAddress" TEXT,
    "remark" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "staffName" TEXT,
    "staffPhone" TEXT,
    "timeoutAtText" TEXT,
    "ticketMessage" TEXT,
    "isDryRun" BOOLEAN NOT NULL DEFAULT false,
    "lastErrorMessage" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentPickup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShipmentPickup_shopId_status_idx" ON "ShipmentPickup"("shopId", "status");

ALTER TABLE "ShipmentPickup"
    ADD CONSTRAINT "ShipmentPickup_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
