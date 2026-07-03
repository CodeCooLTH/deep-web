-- Migration: add_userbadge_shopid | Feature: 00008 Business Account & Packages, Phase 5 (P5-2a)
-- SSOT: docs/superpowers/specs/2026-07-03-00008-phase5-business-reputation-design.md §P5-2
-- SAFETY: additive column (nullable) + partial-unique swap. ไม่ backfill — ทุกแถวเดิม shopId=NULL
-- (personal/buyer badge เดิม) เข้า partial index ใหม่ (WHERE "shopId" IS NULL) ได้พอดี ไม่ผิด constraint
-- verified ก่อน apply: ไม่มี dup (userId,badgeId) ใน 15 แถวปัจจุบัน (SELECT ... GROUP BY ... HAVING count>1 = 0 rows)
-- NULL shopId = user-level badge เดิม (backward-compat, zero-regression buyer/personal-seller)
-- non-NULL shopId = Business shop badge (feature 00008 §4/§6.3 kind=BUSINESS) — แยก achievement shop จาก user
--
-- 🛑 partial unique index (`WHERE "shopId" IS NULL` / `WHERE "shopId" IS NOT NULL`) เป็น Postgres DSL ที่
-- Prisma schema.prisma ประกาศไม่ได้ (ไม่รองรับ partial index ใน Prisma DSL ปัจจุบัน) — คงอยู่เป็น unmanaged
-- SQL ตลอดไป ห้าม `npx prisma migrate dev` หรือ `npx prisma db pull` หลัง apply migration นี้เด็ดขาด เพราะ
-- Prisma introspection จะไม่เห็น partial index นี้แล้วพยายาม "แก้ schema ให้ตรง" ซึ่งอาจ DROP มันทิ้ง
-- (precedent: `Shop_userId_personal_key` migration 20260702000002; ดู memory `project_shared_db_drift_no_migrate_dev`)
--
-- ยืนยันชื่อ unique index จริงแล้ว: grep prisma/migrations/20260404084338_init/migration.sql
--   → `CREATE UNIQUE INDEX "UserBadge_userId_badgeId_key" ON "UserBadge"("userId", "badgeId");`
--   ไม่มี migration ไหนเปลี่ยนชื่อ index นี้ในภายหลัง (grep ยืนยันแล้วก่อนเขียน migration นี้)

-- AlterTable
ALTER TABLE "UserBadge" ADD COLUMN "shopId" TEXT;

-- DropIndex (unique เดิม — แทนที่ด้วย partial unique 2 ตัวด้านล่าง)
DROP INDEX "UserBadge_userId_badgeId_key";

-- CreateIndex — personal/buyer badge (shopId NULL): 1 badge ต่อ user เหมือนเดิม
CREATE UNIQUE INDEX "UserBadge_userId_badgeId_personal_key" ON "UserBadge"("userId", "badgeId") WHERE "shopId" IS NULL;

-- CreateIndex — business shop badge (shopId NOT NULL): 1 badge ต่อ business shop
CREATE UNIQUE INDEX "UserBadge_shopId_badgeId_key" ON "UserBadge"("shopId", "badgeId") WHERE "shopId" IS NOT NULL;

-- CreateIndex (lookup ทั่วไป — filter/join by shopId)
CREATE INDEX "UserBadge_shopId_idx" ON "UserBadge"("shopId");

-- AddForeignKey
-- ON DELETE CASCADE: business shop ถูกลบ (hard-delete) → badge ของ business นั้นหายไปด้วย เพราะ badge
-- คือ achievement ที่ผูกกับตัว shop โดยตรง ไม่มีความหมายถ้า shop ไม่มีอยู่แล้ว (ต่างจาก
-- VerificationRecord.shopId ที่ใช้ SET NULL เพราะยัง fallback เป็น user-level verification ได้)
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ROLLBACK (ปลอดภัยเฉพาะถ้ายังไม่มี business badge แถวไหนถูกสร้าง ณ ตอน rollback — ถ้ามีแล้วต้อง
-- ลบ/ย้ายแถว shopId NOT NULL ก่อน ไม่งั้น unique เดิม (userId,badgeId) เต็มรูปแบบจะสร้างกลับไม่ได้
-- ถ้ามี user ที่ badgeId ซ้ำข้าม personal+business):
--   ALTER TABLE "UserBadge" DROP CONSTRAINT "UserBadge_shopId_fkey";
--   DROP INDEX "UserBadge_shopId_idx";
--   DROP INDEX "UserBadge_shopId_badgeId_key";
--   DROP INDEX "UserBadge_userId_badgeId_personal_key";
--   CREATE UNIQUE INDEX "UserBadge_userId_badgeId_key" ON "UserBadge"("userId", "badgeId");
--   ALTER TABLE "UserBadge" DROP COLUMN "shopId";
