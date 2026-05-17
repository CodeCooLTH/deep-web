-- AlterTable
ALTER TABLE "TopUpRequest" ADD COLUMN "notifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TopUpRequest_shopId_status_notifiedAt_idx" ON "TopUpRequest"("shopId", "status", "notifiedAt");
