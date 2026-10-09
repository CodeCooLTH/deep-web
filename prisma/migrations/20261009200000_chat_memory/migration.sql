-- 00019-ext-mem: ตารางใหม่ 2 ตาราง (additive ล้วน ไม่แตะตารางเดิม)

-- CreateTable
CREATE TABLE "ChatMemory" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'AI',
    "version" INTEGER NOT NULL DEFAULT 1,
    "basedOnMessageId" TEXT,
    "previousText" TEXT,
    "updatedByUserId" TEXT,
    "aiUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatInterestedProduct" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "optionLabel" TEXT NOT NULL DEFAULT '',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatInterestedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatMemory_conversationId_key" ON "ChatMemory"("conversationId");

-- CreateIndex
CREATE INDEX "ChatMemory_shopId_updatedAt_idx" ON "ChatMemory"("shopId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatInterestedProduct_shopId_conversationId_idx" ON "ChatInterestedProduct"("shopId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatInterestedProduct_conversationId_productId_optionLabel_key" ON "ChatInterestedProduct"("conversationId", "productId", "optionLabel");

-- AddForeignKey
ALTER TABLE "ChatMemory" ADD CONSTRAINT "ChatMemory_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatInterestedProduct" ADD CONSTRAINT "ChatInterestedProduct_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatInterestedProduct" ADD CONSTRAINT "ChatInterestedProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
