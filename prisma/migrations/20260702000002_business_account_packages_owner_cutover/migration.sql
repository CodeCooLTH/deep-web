-- Migration: business_account_packages_owner_cutover | Feature: M00008-BusinessAccountPackages
-- 🛑 Phase 2 cutover — GATED. ห้าม apply จนกว่า Controller/user ยืนยันชัดเจน (ดู DATABASE.md §6.3/§6.4)
--   เงื่อนไขก่อน apply: (a) Phase 1 (20260702000001_add_business_account_packages) burn-in + backfill
--   ตรวจครบ 100%, (b) grep audit `user.shop`/`session.user.shop`/`include:{shop:true}` (singular) ทุกจุด
--   ใน src/app/(paces)/seller/**, src/lib/auth.ts, src/proxy.ts เสร็จและแก้ไว้พร้อม deploy คู่กัน
-- ต้อง apply DDL นี้ + แก้ prisma/schema.prisma (Shop.userId ตัด @unique, User.shop→User.shops Shop[])
-- ในดีพลอยเดียวกันเท่านั้น (ห้ามแยก — ดู DATABASE.md §4 เหตุผล lie-state)
--
-- ยืนยันชื่อ unique index จริงแล้ว: grep prisma/migrations/20260404084338_init/migration.sql
--   → `CREATE UNIQUE INDEX "Shop_userId_key" ON "Shop"("userId");` (ตาม Prisma default naming
--   convention `<Table>_<column>_key` — ไม่มี migration ไหนเปลี่ยนชื่อ index นี้ในภายหลัง)
--
-- 🛑 partial unique index (`WHERE "kind" = 'PERSONAL'`) เป็น Postgres DSL ที่ Prisma schema.prisma
--   ประกาศไม่ได้ (ไม่รองรับ partial index ใน Prisma DSL ปัจจุบัน) — คงอยู่เป็น unmanaged SQL ตลอดไป
--   ห้าม `npx prisma migrate dev` หรือ `npx prisma db pull` หลัง apply migration นี้เด็ดขาด เพราะ
--   Prisma introspection จะไม่เห็น partial index นี้แล้วพยายาม "แก้ schema ให้ตรง" ซึ่งอาจ DROP มันทิ้ง
--   (ดู memory `project_shared_db_drift_no_migrate_dev`, DATABASE.md feature 00008 §4/§9-1)
DROP INDEX "Shop_userId_key";
CREATE UNIQUE INDEX "Shop_userId_personal_key" ON "Shop"("userId") WHERE "kind" = 'PERSONAL';

-- ROLLBACK (ปลอดภัยเฉพาะถ้ายังไม่มี owner คนไหนมี Business shop เกิน 1 แถว ณ ตอน rollback —
-- ถ้ามีแล้วจะสร้าง unique เต็มรูปแบบกลับคืนไม่ได้ เพราะมี duplicate userId ต้อง manual data-fix ก่อน):
--   DROP INDEX "Shop_userId_personal_key";
--   CREATE UNIQUE INDEX "Shop_userId_key" ON "Shop"("userId");
