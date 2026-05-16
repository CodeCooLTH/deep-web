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
-- ORDER IS MANDATORY — do NOT reorder these four statements.
-- Invariant: old-CONFIRMED rows must be split into their new states BEFORE
-- COMPLETED→CONFIRMED runs. If COMPLETED→CONFIRMED ran first, those newly
-- renamed rows would have status='CONFIRMED' AND fulfillmentMode='SHIPPED'
-- (the common case for completed physical orders) and would be re-matched and
-- corrupted to PENDING by the final split — making terminal orders appear
-- in-progress and understating trust/badge CONFIRMED counts. (spec-review CRITICAL, 2026-05-16)
UPDATE "Order" SET "status" = 'PENDING'   WHERE "status" = 'CREATED';
-- split old CONFIRMED first, while status is still literally 'CONFIRMED':
-- old CONFIRMED + NO_SHIPPING stays CONFIRMED (logical no-op on value, kept for explicit documentation)
UPDATE "Order" SET "status" = 'CONFIRMED' WHERE "status" = 'CONFIRMED' AND "fulfillmentMode" = 'NO_SHIPPING';
-- old CONFIRMED + SHIPPED → PENDING (in-progress physical orders not yet delivered)
UPDATE "Order" SET "status" = 'PENDING'   WHERE "status" = 'CONFIRMED' AND "fulfillmentMode" = 'SHIPPED';
-- now safe: no old-CONFIRMED rows remain as 'CONFIRMED'; COMPLETED→CONFIRMED cannot re-touch any of them
UPDATE "Order" SET "status" = 'CONFIRMED' WHERE "status" = 'COMPLETED';

ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';
