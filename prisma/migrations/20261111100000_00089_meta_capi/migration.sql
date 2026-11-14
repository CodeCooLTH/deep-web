-- CreateTable
CREATE TABLE "MetaCapiPageSetting" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopChannelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMPTZ(3),
    "purchaseAt" TEXT NOT NULL DEFAULT 'CREATE',
    "countPromotedDraft" BOOLEAN NOT NULL DEFAULT true,
    "eventOptions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MetaCapiPageSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaCapiDataset" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopChannelId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "tokenEnc" TEXT,
    "label" TEXT,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "stoppedReason" TEXT,
    "stoppedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MetaCapiDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaCapiEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "datasetRowId" TEXT NOT NULL,
    "conversationId" TEXT,
    "eventKey" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "eventTime" TIMESTAMPTZ(3) NOT NULL,
    "pageId" TEXT NOT NULL,
    "psid" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(3),
    "reason" TEXT,
    "lastHttpStatus" INTEGER,
    "lastRequest" JSONB,
    "lastResponse" JSONB,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaCapiEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaCapiPageSetting_shopChannelId_key" ON "MetaCapiPageSetting"("shopChannelId");

-- CreateIndex
CREATE INDEX "MetaCapiPageSetting_shopId_idx" ON "MetaCapiPageSetting"("shopId");

-- CreateIndex
CREATE INDEX "MetaCapiDataset_shopId_idx" ON "MetaCapiDataset"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCapiDataset_shopChannelId_datasetId_key" ON "MetaCapiDataset"("shopChannelId", "datasetId");

-- CreateIndex
CREATE INDEX "MetaCapiEvent_status_nextAttemptAt_idx" ON "MetaCapiEvent"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "MetaCapiEvent_conversationId_eventKey_createdAt_idx" ON "MetaCapiEvent"("conversationId", "eventKey", "createdAt");

-- CreateIndex
CREATE INDEX "MetaCapiEvent_shopId_createdAt_idx" ON "MetaCapiEvent"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCapiEvent_datasetRowId_dedupeKey_key" ON "MetaCapiEvent"("datasetRowId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "MetaCapiPageSetting" ADD CONSTRAINT "MetaCapiPageSetting_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCapiPageSetting" ADD CONSTRAINT "MetaCapiPageSetting_shopChannelId_fkey" FOREIGN KEY ("shopChannelId") REFERENCES "ShopChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCapiDataset" ADD CONSTRAINT "MetaCapiDataset_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCapiDataset" ADD CONSTRAINT "MetaCapiDataset_shopChannelId_fkey" FOREIGN KEY ("shopChannelId") REFERENCES "ShopChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCapiEvent" ADD CONSTRAINT "MetaCapiEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCapiEvent" ADD CONSTRAINT "MetaCapiEvent_datasetRowId_fkey" FOREIGN KEY ("datasetRowId") REFERENCES "MetaCapiDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

