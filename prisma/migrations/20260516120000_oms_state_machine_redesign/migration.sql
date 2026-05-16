-- OMS State-Machine Redesign — authored 2026-05-16, applied by user (prisma migrate deploy)
-- Spec: docs/superpowers/specs/2026-05-16-oms-state-machine-redesign-design.md §1
--
-- ROLLBACK NOTE
-- The two new columns (fulfillmentMode, cancelInitiator) are additive and can be
-- dropped cleanly with:
--   ALTER TABLE "Order" DROP COLUMN "fulfillmentMode";
--   ALTER TABLE "Order" DROP COLUMN "cancelInitiator";
-- The status remap is LOSSY for old CONFIRMED rows that had SHIPPED fulfillment
-- (old CONFIRMED + fulfillmentMode=SHIPPED → PENDING). There is no way to recover
-- the original CONFIRMED value post-hoc because no original value is preserved.
-- Rollback of the status column default is:
--   ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'CREATED';
-- A full status rollback would require restoring from a pre-migration DB snapshot.
--
-- DRY-RUN RECONCILIATION INVARIANTS (verify with SELECT before applying)
--   1. Total rows unchanged: COUNT(*) BEFORE == COUNT(*) AFTER
--   2. AFTER status values ∈ {PENDING, SHIPPED, CONFIRMED, CANCELLED} only
--   3. AFTER.CONFIRMED  == BEFORE.COMPLETED
--                        + BEFORE.CONFIRMED where fulfillmentMode = 'NO_SHIPPING'
--   4. AFTER.PENDING    == BEFORE.CREATED
--                        + BEFORE.CONFIRMED where fulfillmentMode = 'SHIPPED'
--   5. AFTER.SHIPPED    == BEFORE.SHIPPED
--   6. AFTER.CANCELLED  == BEFORE.CANCELLED
--
-- Pre-migration dry-run query (run before apply, save counts):
--   SELECT status, COUNT(*) FROM "Order" GROUP BY status;

ALTER TABLE "Order" ADD COLUMN "fulfillmentMode" TEXT NOT NULL DEFAULT 'SHIPPED';
ALTER TABLE "Order" ADD COLUMN "cancelInitiator" TEXT;

-- backfill fulfillmentMode: NO_SHIPPING only if NO item needs shipping
-- An item needs shipping when:
--   (a) productId IS NOT NULL and product.fulfillmentMode = 'SHIPPED', or
--   (b) productId IS NULL and order.type = 'PHYSICAL'
-- If none of the order's items match either condition, the whole order is NO_SHIPPING.
UPDATE "Order" o SET "fulfillmentMode" = 'NO_SHIPPING'
WHERE NOT EXISTS (
  SELECT 1 FROM "OrderItem" oi
  LEFT JOIN "Product" p ON p."id" = oi."productId"
  WHERE oi."orderId" = o."id"
    AND ( (oi."productId" IS NOT NULL AND p."fulfillmentMode" = 'SHIPPED')
       OR (oi."productId" IS NULL AND o."type" = 'PHYSICAL') )
);

-- status remap per spec migration mapping table
UPDATE "Order" SET "status" = 'PENDING'   WHERE "status" = 'CREATED';
UPDATE "Order" SET "status" = 'CONFIRMED' WHERE "status" = 'COMPLETED';
UPDATE "Order" SET "status" = 'CONFIRMED' WHERE "status" = 'CONFIRMED' AND "fulfillmentMode" = 'NO_SHIPPING';
UPDATE "Order" SET "status" = 'PENDING'   WHERE "status" = 'CONFIRMED' AND "fulfillmentMode" = 'SHIPPED';

ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';
