-- feature 00078 M1 — เก็บ "ข้อเท็จจริง" ผู้ถือห้อง Meta + echo ล่าสุดที่ไม่ใช่ของเรา (DATABASE.md §3.1/3.2)
-- ไม่เก็บ verdict (AI/คน/แอปอื่น) — derive ใน src/lib · ไม่ backfill (NULL = ไม่รู้ = ไม่ขึ้นป้าย)
--
-- ADD COLUMN nullable ไม่มี default = catalog-only แต่ต้องการ ACCESS EXCLUSIVE ชั่วครู่
-- lock_timeout: ยอมให้ migrate ล้ม (deploy ไม่ขึ้น) ดีกว่ารอคิวล็อกแล้วบล็อก webhook แชททั้งระบบ
-- (มติ Controller 2026-10-17) · รันซ้ำได้ (IF NOT EXISTS)
SET LOCAL lock_timeout = '5s';

ALTER TABLE "Conversation"
  ADD COLUMN IF NOT EXISTS "metaOwnerAppId" TEXT,
  ADD COLUMN IF NOT EXISTS "metaOwnerObservedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "metaForeignEchoAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "metaForeignEchoAppId" TEXT,
  ADD COLUMN IF NOT EXISTS "metaForeignEchoAi" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "metaForeignEchoAdminText" BOOLEAN;

ALTER TABLE "ChatMessage"
  ADD COLUMN IF NOT EXISTS "echoAppId" TEXT,
  ADD COLUMN IF NOT EXISTS "echoAiGenerated" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "echoHasAdminText" BOOLEAN;
