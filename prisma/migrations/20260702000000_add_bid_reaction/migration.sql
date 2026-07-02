-- CreateTable: BidReaction (feature 00005 — reaction toggle ต่อ bid)
CREATE TABLE "BidReaction" (
    "id" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BidReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BidReaction_bidId_userId_key" ON "BidReaction"("bidId", "userId");
CREATE INDEX "BidReaction_bidId_idx" ON "BidReaction"("bidId");
CREATE INDEX "BidReaction_userId_idx" ON "BidReaction"("userId");

-- AddForeignKey
ALTER TABLE "BidReaction" ADD CONSTRAINT "BidReaction_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BidReaction" ADD CONSTRAINT "BidReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
