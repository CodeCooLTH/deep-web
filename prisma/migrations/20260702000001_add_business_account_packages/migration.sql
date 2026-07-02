-- Migration: add_business_account_packages | Feature: M00008-BusinessAccountPackages | 2026-07-02
-- SAFETY: additive only — table ใหม่ 3 ตัว + column ใหม่ (DEFAULT/nullable) บน Shop เท่านั้น
-- ไม่แตะ Shop.userId @unique เดิม (แยก migration Phase 2 — business_account_packages_owner_cutover — GATED, ไม่รวมในไฟล์นี้)
-- WalletTransaction.reason มีอยู่แล้ว (feature 00003) — ไม่มี DDL เพิ่ม แค่ value ใหม่ระดับ app ("BUSINESS_PACKAGE_SUBSCRIPTION")
-- รวม §6.2 (Phase 1 core) + §12.1 (lifecycle delta: deletedAt/deletedReason/purgedAt) ของ
-- docs/20 - Features/00008 - Business Account & Packages/DATABASE.md เป็นไฟล์เดียว (ตาม Controller dispatch)
--
-- ROLLBACK (ดู DATABASE.md §6.5 เต็ม):
--   DROP TABLE "ShopInvite";
--   DROP TABLE "BusinessPackageSubscription"; DROP TYPE "BusinessPackageStatus";
--   DROP TABLE "ShopMember";
--   ALTER TABLE "Shop" DROP COLUMN "kind", DROP COLUMN "packageLockedAt", DROP COLUMN "packageLockReason",
--                      DROP COLUMN "deletedAt", DROP COLUMN "deletedReason", DROP COLUMN "purgedAt";
--   -- ปลอดภัยเฉพาะก่อนมี Business shop / subscription / invite จริงบน DB (dev=prod แชร์กัน — QA data ก็ถือเป็นข้อมูลจริงระดับหนึ่ง)

-- 1) Shop: kind + lock fields + lifecycle delta (deletedAt/deletedReason/purgedAt, §12.1)
ALTER TABLE "Shop" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'PERSONAL';
ALTER TABLE "Shop" ADD COLUMN "packageLockedAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "packageLockReason" TEXT;
ALTER TABLE "Shop" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "deletedReason" TEXT;
ALTER TABLE "Shop" ADD COLUMN "purgedAt" TIMESTAMP(3);

CREATE INDEX "Shop_userId_kind_idx" ON "Shop"("userId", "kind");
CREATE INDEX "Shop_kind_packageLockedAt_idx" ON "Shop"("kind", "packageLockedAt");
CREATE INDEX "Shop_kind_lockReason_lockedAt_idx" ON "Shop"("kind", "packageLockReason", "packageLockedAt");
CREATE INDEX "Shop_deletedAt_purgedAt_idx" ON "Shop"("deletedAt", "purgedAt");

-- 2) ShopMember (ใหม่)
CREATE TABLE "ShopMember" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopMember_shopId_userId_key" ON "ShopMember"("shopId", "userId");
CREATE INDEX "ShopMember_userId_idx" ON "ShopMember"("userId");
CREATE INDEX "ShopMember_shopId_role_idx" ON "ShopMember"("shopId", "role");

ALTER TABLE "ShopMember" ADD CONSTRAINT "ShopMember_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopMember" ADD CONSTRAINT "ShopMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) BusinessPackageSubscription (ใหม่) + enum
CREATE TYPE "BusinessPackageStatus" AS ENUM ('ACTIVE', 'LOCKED_RENEWAL_FAILED');

CREATE TABLE "BusinessPackageSubscription" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "status" "BusinessPackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "activatedAt" TIMESTAMP(3) NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "nextRenewalAt" TIMESTAMP(3) NOT NULL,
    "lastRenewalAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessPackageSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessPackageSubscription_ownerId_key" ON "BusinessPackageSubscription"("ownerId");
CREATE INDEX "BusinessPackageSubscription_status_nextRenewalAt_idx" ON "BusinessPackageSubscription"("status", "nextRenewalAt");

ALTER TABLE "BusinessPackageSubscription" ADD CONSTRAINT "BusinessPackageSubscription_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) ShopInvite (ใหม่)
CREATE TABLE "ShopInvite" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "invitedContact" TEXT NOT NULL,
    "contactType" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopInvite_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShopInvite_shopId_status_idx" ON "ShopInvite"("shopId", "status");
CREATE INDEX "ShopInvite_invitedContact_status_idx" ON "ShopInvite"("invitedContact", "status");

ALTER TABLE "ShopInvite" ADD CONSTRAINT "ShopInvite_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopInvite" ADD CONSTRAINT "ShopInvite_invitedByUserId_fkey"
    FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopInvite" ADD CONSTRAINT "ShopInvite_acceptedByUserId_fkey"
    FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5) Backfill ShopMember(OWNER) จาก Shop เดิมทุกแถว (idempotent — unique(shopId,userId) กันซ้ำ)
INSERT INTO "ShopMember" ("id", "shopId", "userId", "role", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "userId", 'OWNER', now(), now()
FROM "Shop"
ON CONFLICT ("shopId", "userId") DO NOTHING;
