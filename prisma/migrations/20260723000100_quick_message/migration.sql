-- QuickMessage — ข้อความสำเร็จรูป ระดับร้าน (feature 00018 composer improvement #2)
-- hand-written (DB dev=prod แชร์กัน — ห้าม migrate dev, ใช้ migrate deploy)

-- CreateTable
CREATE TABLE "QuickMessage" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "body" TEXT NOT NULL,
    "imageFileId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuickMessage_shopId_category_createdAt_idx" ON "QuickMessage"("shopId", "category", "createdAt");

-- AddForeignKey
ALTER TABLE "QuickMessage" ADD CONSTRAINT "QuickMessage_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
