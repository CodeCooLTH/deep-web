-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "adClickedAt" TIMESTAMPTZ(3),
ADD COLUMN     "adId" TEXT,
ADD COLUMN     "adPhotoFileId" TEXT,
ADD COLUMN     "adTitle" TEXT;

-- CreateIndex
CREATE INDEX "Order_shopId_adId_idx" ON "Order"("shopId", "adId");

