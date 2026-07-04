-- Migration: add_shop_invite_link | Feature: 00012-ShopStaffInviteLinks | drafted 2026-07-04
-- SAFETY: additive only — table ใหม่ 1 ตัว (ShopInviteLink), ไม่มี ALTER/DROP บน table เดิม
-- ROLLBACK: table ว่างตอนสร้าง ปลอดภัย DROP ได้ทันทีหลัง apply ถ้ายังไม่มีลิงก์เชิญจริงเกิดขึ้น
-- (หลัง feature launch ต้อง export ก่อน DROP — data loss):
--   DROP TABLE "ShopInviteLink";

-- 1) ShopInviteLink (ใหม่) — reusable staff invite link (`/i/<slug>`)
CREATE TABLE "ShopInviteLink" (
    "id"              TEXT NOT NULL,
    "shopId"          TEXT NOT NULL,
    "slug"            TEXT NOT NULL,
    "role"            TEXT NOT NULL DEFAULT 'ADMIN',
    "createdByUserId" TEXT NOT NULL,
    "expiresAt"       TIMESTAMP(3) NOT NULL,
    "revokedAt"       TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopInviteLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopInviteLink_slug_key" ON "ShopInviteLink"("slug");
CREATE INDEX "ShopInviteLink_shopId_revokedAt_idx" ON "ShopInviteLink"("shopId", "revokedAt");

ALTER TABLE "ShopInviteLink" ADD CONSTRAINT "ShopInviteLink_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopInviteLink" ADD CONSTRAINT "ShopInviteLink_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
