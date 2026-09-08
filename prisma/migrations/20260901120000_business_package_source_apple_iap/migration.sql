-- feature 00064 — In-App Purchase (iOS) · แยก "ใครเป็นคนเก็บเงินและต่ออายุ"
-- SSOT: docs/20 - Features/00064 - Apple In-App Purchase/BRD.md (BR-IAP-01..05)
--
-- เขียนมือ ไม่ใช่ `prisma migrate dev` — ฐานนี้มีข้อมูลลูกค้าจริง การ reset ไม่ใช่ตัวเลือก
-- (Hard Rule 14 · docs/conventions/prod-db-safety.md)
--
-- ADDITIVE ล้วน: เพิ่มคอลัมน์ที่มี DEFAULT / คอลัมน์ nullable / ตารางใหม่ / index ใหม่ เท่านั้น
-- ไม่มี DROP · ไม่มี ALTER ที่เปลี่ยนชนิด · ไม่มี NOT NULL ที่ไม่มี DEFAULT
-- ⇒ แถวเดิมทุกแถวใช้ได้ทันทีหลัง apply และโค้ดเวอร์ชันก่อนหน้ายังทำงานต่อได้

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) แหล่งที่มาของการจ่ายเงินต่อ subscription หนึ่งใบ
--
-- 🛑 DEFAULT 'WALLET' คือหัวใจของความปลอดภัยตอน deploy: แถวที่มีอยู่บน prod
-- (นับ 2026-09-01 = 1 แถว) ได้ค่านี้ทันที ⇒ cron ยังหยิบไปต่ออายุเหมือนเดิมทุกประการ
-- ถ้าปล่อยเป็น NULL แล้วให้โค้ดตีความเอง จะมีช่วงหนึ่งที่ cron มองไม่เห็นใบเดิม
-- แล้วลูกค้าที่จ่ายเงินอยู่จะถูกปล่อยให้หมดอายุเงียบ ๆ
ALTER TABLE "BusinessPackageSubscription"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'WALLET';

COMMENT ON COLUMN "BusinessPackageSubscription"."source" IS
  '"WALLET" = cron ของเราหักกระเป๋าเงินเอง | "APPLE_IAP" = Apple เก็บเงินและต่ออายุให้ — ใบ APPLE_IAP ห้ามถูก deductCredit เด็ดขาด (เก็บเงินซ้ำ)';

-- 2) ตัวจับคู่ธุรกรรมฝั่ง Apple
--
-- UNIQUE บน originalTransactionId = กติกา BR-IAP-04 ที่ระดับฐานข้อมูล:
-- การสมัครหนึ่งใบของ Apple ผูกกับบัญชี Deep ได้บัญชีเดียว
-- 🛑 บังคับที่ฐาน ไม่ใช่แค่ที่โค้ด เพราะ webhook กับการยืนยันจากเครื่องวิ่งเข้ามาพร้อมกันได้
-- (find-then-insert แพ้ race เสมอ — บทเรียน 00038)
ALTER TABLE "BusinessPackageSubscription"
  ADD COLUMN "appleOriginalTransactionId" TEXT,
  ADD COLUMN "appleProductId"             TEXT,
  ADD COLUMN "appleEnvironment"           TEXT;

CREATE UNIQUE INDEX "BusinessPackageSubscription_appleOriginalTransactionId_key"
  ON "BusinessPackageSubscription"("appleOriginalTransactionId");

COMMENT ON COLUMN "BusinessPackageSubscription"."appleEnvironment" IS
  '"Production" | "Sandbox" — ธุรกรรม Sandbox ห้ามให้สิทธิ์จริงบน prod';

-- 3) index ของ cron ต่ออายุ
--
-- ของเดิม (status, nextRenewalAt) ยังอยู่ ไม่ลบ — ใช้โดย query อื่นและการลบ index
-- ระหว่างที่ยังมี query เก่าวิ่งอยู่ระหว่าง deploy จะทำให้ช่วงนั้นช้าลงโดยไม่จำเป็น
-- ตัวใหม่เอา source ขึ้นก่อนเพราะเป็น equality ที่ตัดแถวทิ้งได้มากที่สุด
CREATE INDEX "BusinessPackageSubscription_source_status_nextRenewalAt_idx"
  ON "BusinessPackageSubscription"("source", "status", "nextRenewalAt");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) บันทึกดิบของ App Store Server Notifications v2
--
-- ทำไมต้องเป็นตาราง ไม่ใช่ console.log: Vercel plan นี้ query runtime log ย้อนหลังไม่ได้
-- (ยืนยัน 2026-08-08 — /v1/deployments/{id}/runtime-logs คืน 404) เรื่องเงินของลูกค้า
-- ต้องตรวจย้อนหลังได้เสมอ · แพตเทิร์นเดียวกับ ChatHandoverEvent
CREATE TABLE "AppleIapNotification" (
  "id"                    TEXT         NOT NULL,
  "notificationUUID"      TEXT         NOT NULL,
  "notificationType"      TEXT         NOT NULL,
  "subtype"               TEXT,
  "originalTransactionId" TEXT,
  "environment"           TEXT,
  "signedPayload"         TEXT         NOT NULL,
  "processedAt"           TIMESTAMP(3),
  "error"                 TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AppleIapNotification_pkey" PRIMARY KEY ("id")
);

-- กันประมวลผลซ้ำที่ระดับฐาน — Apple ยิงซ้ำเมื่อเราตอบช้าหรือตอบไม่ 200
CREATE UNIQUE INDEX "AppleIapNotification_notificationUUID_key"
  ON "AppleIapNotification"("notificationUUID");

CREATE INDEX "AppleIapNotification_originalTransactionId_idx"
  ON "AppleIapNotification"("originalTransactionId");

-- ตัวเดินตรวจซ้ำ (BR-IAP-15): หาใบที่รับไว้แล้วแต่ยังทำไม่สำเร็จ
CREATE INDEX "AppleIapNotification_processedAt_idx"
  ON "AppleIapNotification"("processedAt");
