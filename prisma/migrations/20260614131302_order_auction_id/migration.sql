/*
  Warnings:

  - A unique constraint covering the columns `[auctionId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "auctionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_auctionId_key" ON "Order"("auctionId");
