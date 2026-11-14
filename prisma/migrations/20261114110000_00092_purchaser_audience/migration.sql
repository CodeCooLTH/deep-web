-- CreateTable
CREATE TABLE "MetaAudienceConnection" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "adAccountName" TEXT,
    "tokenEnc" TEXT NOT NULL,
    "tokenSource" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMPTZ(3),
    "expiryWarnedAt" TIMESTAMPTZ(3),
    "audienceId" TEXT,
    "audienceName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMPTZ(3),
    "backfilledAt" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "stoppedReason" TEXT,
    "stoppedAt" TIMESTAMPTZ(3),
    "lastSyncedAt" TIMESTAMPTZ(3),
    "lockedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MetaAudienceConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAudienceMember" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "identityType" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "pageId" TEXT,
    "desired" TEXT NOT NULL,
    "syncedState" TEXT NOT NULL DEFAULT 'OUT',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MetaAudienceMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaAudienceConnection_shopId_key" ON "MetaAudienceConnection"("shopId");

-- CreateIndex
CREATE INDEX "MetaAudienceConnection_enabled_status_idx" ON "MetaAudienceConnection"("enabled", "status");

-- CreateIndex
CREATE INDEX "MetaAudienceMember_shopId_desired_syncedState_nextAttemptAt_idx" ON "MetaAudienceMember"("shopId", "desired", "syncedState", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAudienceMember_shopId_identityType_identityKey_key" ON "MetaAudienceMember"("shopId", "identityType", "identityKey");

-- AddForeignKey
ALTER TABLE "MetaAudienceConnection" ADD CONSTRAINT "MetaAudienceConnection_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAudienceMember" ADD CONSTRAINT "MetaAudienceMember_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

