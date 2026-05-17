-- Phase B · B0 — Order fields extension (additive, all nullable)
-- Spec: docs/superpowers/specs/2026-05-16-sms-order-link-wallet.md
-- Task: B0 schema migration — 7 new nullable columns on Order
--
-- ROLLBACK NOTE
-- All 7 columns are nullable with no DEFAULT — safe to DROP with:
--   ALTER TABLE "Order" DROP COLUMN "paymentMethod";
--   ALTER TABLE "Order" DROP COLUMN "salesChannel";
--   ALTER TABLE "Order" DROP COLUMN "internalNote";
--   ALTER TABLE "Order" DROP COLUMN "buyerName";
--   ALTER TABLE "Order" DROP COLUMN "discount";
--   ALTER TABLE "Order" DROP COLUMN "vatRate";
--   ALTER TABLE "Order" DROP COLUMN "vatAmount";
-- No data migration required — rollback is fully reversible (columns are nullable with no backfill).
--
-- SAFETY
-- Additive only: no DROP, no ALTER of existing columns, no DEFAULT that forces backfill.
-- Existing rows gain NULL in all 7 columns — no constraint violation possible.
-- Safe to apply to a live DB with existing Order rows.

-- FR-6.11: payment method captured at order creation (app layer enforces enum CASH/TRANSFER/PROMPTPAY/CARD/COD/OTHER)
ALTER TABLE "Order" ADD COLUMN "paymentMethod" TEXT;

-- OQ-11: sales channel (app layer enforces enum STOREFRONT/FACEBOOK/LINE/TIKTOK/OTHER)
ALTER TABLE "Order" ADD COLUMN "salesChannel" TEXT;

-- seller-only internal note; TEXT (unbounded) to match Product.description convention
ALTER TABLE "Order" ADD COLUMN "internalNote" TEXT;

-- guest buyer name entered by seller (persisted even before buyer registers)
ALTER TABLE "Order" ADD COLUMN "buyerName" TEXT;

-- discount amount in THB; Decimal(12,2) matches totalAmount / OrderItem.price convention
ALTER TABLE "Order" ADD COLUMN "discount" DECIMAL(12,2);

-- VAT rate (e.g. 0.0700); Decimal(5,4) supports up to 9.9999 — sufficient for any rate
ALTER TABLE "Order" ADD COLUMN "vatRate" DECIMAL(5,4);

-- VAT amount in THB = (subtotal − discount) × vatRate; Decimal(12,2) matches money convention
ALTER TABLE "Order" ADD COLUMN "vatAmount" DECIMAL(12,2);
