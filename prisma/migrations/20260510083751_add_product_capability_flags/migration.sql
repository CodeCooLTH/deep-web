-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "billingMode" TEXT NOT NULL DEFAULT 'ONE_TIME',
ADD COLUMN     "billingPeriod" TEXT,
ADD COLUMN     "billingPeriodDays" INTEGER,
ADD COLUMN     "fulfillmentMode" TEXT NOT NULL DEFAULT 'SHIPPED';

-- Data migration: map type เดิม → capability flags ที่สื่อ semantic ตรง
-- (column default = SHIPPED+ONE_TIME สำหรับ row ใหม่ — แต่ของเก่า DIGITAL/SERVICE
-- ควรเป็น NO_SHIPPING)
UPDATE "Product" SET "fulfillmentMode" = 'NO_SHIPPING'
  WHERE "type" IN ('DIGITAL', 'SERVICE');
