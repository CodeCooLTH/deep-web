-- 00084 Flash Express Direct Integration — additive เท่านั้น ไม่ drop ตาราง/คอลัมน์/ข้อมูล
-- แถว ShopShippingAccount / OrderShipment เดิมทุกแถวคือ provider='ISHIP' และไม่เปลี่ยนค่าใด ๆ
-- ไฟล์นี้ idempotent-safe (IF NOT EXISTS / IF EXISTS) · rollback note อยู่ท้ายไฟล์

-- ═══ 1) ShopShippingAccount: คอลัมน์ Flash (nullable ทั้งหมด — ใช้เฉพาะ provider='FLASH') ═══
ALTER TABLE "ShopShippingAccount"
    ADD COLUMN IF NOT EXISTS "merchantId"          TEXT,
    ADD COLUMN IF NOT EXISTS "labelSize"           TEXT,
    ADD COLUMN IF NOT EXISTS "webhookSecretHash"   TEXT,
    ADD COLUMN IF NOT EXISTS "webhookRegisteredAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "webhookStatus"       TEXT,
    ADD COLUMN IF NOT EXISTS "auditLog"            JSONB;

-- ═══ 2) unique: shopId เดี่ยว → (shopId, provider) ═══
-- สร้างตัวใหม่ก่อนแล้วค่อยถอดตัวเก่า — ไม่มีช่วงที่ไม่มี unique คุมอยู่
-- ชื่อ index ตรงกับที่ Prisma สร้างจาก @@unique([shopId, provider]) เพื่อไม่ให้ drift
CREATE UNIQUE INDEX IF NOT EXISTS "ShopShippingAccount_shopId_provider_key"
    ON "ShopShippingAccount"("shopId", "provider");
DROP INDEX IF EXISTS "ShopShippingAccount_shopId_key";

-- webhook secret hash (nullable → Postgres ยอม NULL ซ้ำได้) ตรงกับ @unique ใน schema
CREATE UNIQUE INDEX IF NOT EXISTS "ShopShippingAccount_webhookSecretHash_key"
    ON "ShopShippingAccount"("webhookSecretHash");

-- 🛑 partial unique ที่ Prisma DSL ประกาศไม่ได้ (unmanaged SQL — ห้ามรัน `prisma db pull`)
-- mchId เดียวกันผูกได้ทีละร้านที่ยังใช้งาน (BR-FLASH-17) · DISCONNECTED ปล่อยให้ร้านอื่นผูกต่อได้
-- TOKEN_INVALID ยังจองอยู่ (ร้านเดิมยังเป็นเจ้าของจนกว่าจะถอด)
CREATE UNIQUE INDEX IF NOT EXISTS "ShopShippingAccount_flash_merchant_key"
    ON "ShopShippingAccount"("merchantId")
    WHERE "provider" = 'FLASH' AND "status" <> 'DISCONNECTED' AND "merchantId" IS NOT NULL;

-- CHECK แบบ additive: คอลัมน์ใหม่เป็น NULL ทุกแถว ⇒ ผ่านแน่นอน (ไม่ชนข้อมูลเดิม)
ALTER TABLE "ShopShippingAccount" DROP CONSTRAINT IF EXISTS "ShopShippingAccount_labelSize_check";
ALTER TABLE "ShopShippingAccount"
    ADD CONSTRAINT "ShopShippingAccount_labelSize_check"
    CHECK ("labelSize" IS NULL OR "labelSize" IN ('BIG', 'SMALL'));

-- ═══ 3) OrderShipment: returnedPno (ตีกลับได้เลขใหม่ — webhook ของเลขนี้ต้องวิ่งเข้าแถวเดิม) ═══
-- status "NEEDS_REVIEW" (1003 โดยไม่มี pno) เป็นแค่ค่าสตริงใหม่ — ไม่มี CHECK บนคอลัมน์ status จึงไม่ต้องแก้ DB
ALTER TABLE "OrderShipment" ADD COLUMN IF NOT EXISTS "returnedPno" TEXT;

-- เลขตีกลับห้ามซ้ำข้ามแถว (กัน webhook เข้าผิดแถว) · NULL ได้หลายแถว
CREATE INDEX IF NOT EXISTS "OrderShipment_returnedPno_idx" ON "OrderShipment"("returnedPno");
CREATE UNIQUE INDEX IF NOT EXISTS "OrderShipment_returnedPno_key"
    ON "OrderShipment"("returnedPno")
    WHERE "returnedPno" IS NOT NULL;

-- ═══ 4) ShipmentPickup: รหัสคำขอปัจจุบัน ═══
ALTER TABLE "ShipmentPickup" ADD COLUMN IF NOT EXISTS "currentTicketPickupId" TEXT;

-- ═══ ROLLBACK NOTE (ไม่รันอัตโนมัติ — ใช้เมื่อสั่งเท่านั้น) ═══
-- ย้อนได้ก็ต่อเมื่อยังไม่มีแถว provider='FLASH' (ไม่งั้น unique shopId เดี่ยวสร้างกลับไม่ได้):
--   DELETE FROM "ShopShippingAccount" WHERE "provider" = 'FLASH';   -- ⚠ destructive: ต้อง Controller สั่ง
--   CREATE UNIQUE INDEX "ShopShippingAccount_shopId_key" ON "ShopShippingAccount"("shopId");
--   DROP INDEX "ShopShippingAccount_shopId_provider_key", "ShopShippingAccount_flash_merchant_key",
--              "ShopShippingAccount_webhookSecretHash_key", "OrderShipment_returnedPno_key", "OrderShipment_returnedPno_idx";
--   ALTER TABLE "ShopShippingAccount" DROP CONSTRAINT "ShopShippingAccount_labelSize_check";
--   ALTER TABLE "ShopShippingAccount" DROP COLUMN "merchantId", DROP COLUMN "labelSize", DROP COLUMN "webhookSecretHash",
--              DROP COLUMN "webhookRegisteredAt", DROP COLUMN "webhookStatus", DROP COLUMN "auditLog";
--   ALTER TABLE "OrderShipment" DROP COLUMN "returnedPno";
--   ALTER TABLE "ShipmentPickup" DROP COLUMN "currentTicketPickupId";
-- โค้ดที่ deploy คู่กัน (query ระบุ provider) ย้อนไปก่อน migration ได้โดยไม่พัง เพราะ ISHIP เป็น default
