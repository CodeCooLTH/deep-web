-- AlterTable: เพิ่ม shortCode (permanent 8-char short link alias) — nullable เพื่อ backfill row เก่า
ALTER TABLE "Order" ADD COLUMN "shortCode" TEXT;

-- CreateIndex: unique เพื่อกันชน + lookup ด้วย findUnique
CREATE UNIQUE INDEX "Order_shortCode_key" ON "Order"("shortCode");
