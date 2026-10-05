-- CreateEnum
CREATE TYPE "LineReportGroupStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "LineReportDeliveryKind" AS ENUM ('DAILY', 'MONTHLY', 'TEST', 'COMMAND', 'FINAL_NOTICE');

-- CreateEnum
CREATE TYPE "LineReportDeliveryStatus" AS ENUM ('CLAIMED', 'RETRY_PENDING', 'SENT', 'FAILED', 'SKIPPED_NO_ORDERS', 'MISSED', 'NO_SENDABLE_SHOPS', 'REPLY_FAILED');

-- CreateEnum
CREATE TYPE "LineReportAlertKind" AS ENUM ('BOT_REMOVED', 'SEND_FAILED', 'NO_SENDABLE_SHOPS');

-- CreateEnum
CREATE TYPE "LineReportRateKind" AS ENUM ('BIND_ATTEMPT', 'COMMAND');

-- CreateTable
CREATE TABLE "LineReportGroup" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "lineGroupId" TEXT,
    "groupName" TEXT NOT NULL DEFAULT '',
    "status" "LineReportGroupStatus" NOT NULL DEFAULT 'PENDING',
    "dailyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyTimes" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "monthlyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cutoffDay" INTEGER,
    "showOrders" BOOLEAN NOT NULL DEFAULT true,
    "showSales" BOOLEAN NOT NULL DEFAULT true,
    "showCancelled" BOOLEAN NOT NULL DEFAULT true,
    "showTopProducts" BOOLEAN NOT NULL DEFAULT true,
    "showProfit" BOOLEAN NOT NULL DEFAULT false,
    "skipWhenNoOrders" BOOLEAN NOT NULL DEFAULT false,
    "attachCycleToDaily" BOOLEAN NOT NULL DEFAULT false,
    "profitEnabledAt" TIMESTAMP(3),
    "finalNoticeSentAt" TIMESTAMP(3),
    "alertKind" "LineReportAlertKind",
    "alertAt" TIMESTAMP(3),
    "alertAckAt" TIMESTAMP(3),
    "boundAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineReportGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineReportGroupShop" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineReportGroupShop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineReportBindCode" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineReportBindCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineReportRateEvent" (
    "id" TEXT NOT NULL,
    "lineGroupId" TEXT NOT NULL,
    "kind" "LineReportRateKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineReportRateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineReportDelivery" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "kind" "LineReportDeliveryKind" NOT NULL,
    "slotKey" TEXT NOT NULL,
    "status" "LineReportDeliveryStatus" NOT NULL DEFAULT 'CLAIMED',
    "reason" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "httpStatus" INTEGER,
    "memberCount" INTEGER,
    "pushMessageCount" INTEGER NOT NULL DEFAULT 0,
    "retryKey" TEXT,
    "pendingPayload" JSONB,
    "payloadSha256" TEXT,
    "summary" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineReportDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LineReportGroup_ownerId_status_idx" ON "LineReportGroup"("ownerId", "status");

-- CreateIndex
CREATE INDEX "LineReportGroup_status_idx" ON "LineReportGroup"("status");

-- CreateIndex
CREATE INDEX "LineReportGroup_lineGroupId_idx" ON "LineReportGroup"("lineGroupId");

-- CreateIndex
CREATE INDEX "LineReportGroupShop_shopId_idx" ON "LineReportGroupShop"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "LineReportGroupShop_groupId_shopId_key" ON "LineReportGroupShop"("groupId", "shopId");

-- CreateIndex
CREATE INDEX "LineReportBindCode_ownerId_idx" ON "LineReportBindCode"("ownerId");

-- CreateIndex
CREATE INDEX "LineReportBindCode_groupId_idx" ON "LineReportBindCode"("groupId");

-- CreateIndex
CREATE INDEX "LineReportBindCode_expiresAt_idx" ON "LineReportBindCode"("expiresAt");

-- CreateIndex
CREATE INDEX "LineReportRateEvent_lineGroupId_kind_createdAt_idx" ON "LineReportRateEvent"("lineGroupId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "LineReportDelivery_groupId_createdAt_idx" ON "LineReportDelivery"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "LineReportDelivery_status_createdAt_idx" ON "LineReportDelivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "LineReportDelivery_createdAt_idx" ON "LineReportDelivery"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LineReportDelivery_groupId_slotKey_key" ON "LineReportDelivery"("groupId", "slotKey");

-- AddForeignKey
ALTER TABLE "LineReportGroup" ADD CONSTRAINT "LineReportGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineReportGroupShop" ADD CONSTRAINT "LineReportGroupShop_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LineReportGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineReportGroupShop" ADD CONSTRAINT "LineReportGroupShop_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineReportBindCode" ADD CONSTRAINT "LineReportBindCode_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineReportBindCode" ADD CONSTRAINT "LineReportBindCode_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LineReportGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineReportDelivery" ADD CONSTRAINT "LineReportDelivery_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LineReportGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================
-- 🛑 Unmanaged SQL (Prisma DSL ประกาศไม่ได้) — ห้าม db pull / migrate dev หลัง apply
-- ตารางใหม่ล้วน ไม่มีแถวเดิม = CHECK additive ปลอดภัย
-- ============================================================================

-- D-2: กลุ่ม LINE หนึ่งกลุ่ม ACTIVE ได้กับ 1 แถว (= 1 เจ้าของ)
CREATE UNIQUE INDEX "LineReportGroup_lineGroupId_active_key"
  ON "LineReportGroup"("lineGroupId")
  WHERE "status" = 'ACTIVE' AND "lineGroupId" IS NOT NULL;

-- โค้ดที่ยังใช้ได้ต้องไม่ซ้ำทั้งระบบ + 1 โค้ดที่ใช้ได้ต่อเจ้าของ
CREATE UNIQUE INDEX "LineReportBindCode_codeHash_live_key"
  ON "LineReportBindCode"("codeHash")
  WHERE "usedAt" IS NULL AND "revokedAt" IS NULL;
CREATE UNIQUE INDEX "LineReportBindCode_ownerId_live_key"
  ON "LineReportBindCode"("ownerId")
  WHERE "usedAt" IS NULL AND "revokedAt" IS NULL;

ALTER TABLE "LineReportGroup"
  ADD CONSTRAINT "LineReportGroup_dailyTimes_valid_chk"
    CHECK (cardinality("dailyTimes") <= 4
           AND "dailyTimes" <@ ARRAY[30,60,90,120,150,180,210,240,270,300,330,360,390,420,450,480,
                                     510,540,570,600,630,660,690,720,750,780,810,840,870,900,930,960,
                                     990,1020,1050,1080,1110,1140,1170,1200,1230,1260,1290,1320,1350,
                                     1380,1410,1440]::integer[]),
  ADD CONSTRAINT "LineReportGroup_cutoffDay_valid_chk"
    CHECK ("cutoffDay" IS NULL OR "cutoffDay" BETWEEN 1 AND 31),
  ADD CONSTRAINT "LineReportGroup_metric_any_chk"
    CHECK ("showOrders" OR "showSales" OR "showCancelled" OR "showTopProducts" OR "showProfit"),
  ADD CONSTRAINT "LineReportGroup_active_has_group_chk"
    CHECK ("status" <> 'ACTIVE' OR "lineGroupId" IS NOT NULL);

ALTER TABLE "LineReportDelivery"
  ADD CONSTRAINT "LineReportDelivery_counts_nonneg_chk"
    CHECK ("attempt" BETWEEN 0 AND 2 AND "pushMessageCount" >= 0);
