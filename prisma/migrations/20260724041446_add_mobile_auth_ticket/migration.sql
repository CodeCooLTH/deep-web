-- CreateTable
CREATE TABLE "MobileAuthTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileAuthTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MobileAuthTicket_expiresAt_idx" ON "MobileAuthTicket"("expiresAt");

-- AddForeignKey
ALTER TABLE "MobileAuthTicket" ADD CONSTRAINT "MobileAuthTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
