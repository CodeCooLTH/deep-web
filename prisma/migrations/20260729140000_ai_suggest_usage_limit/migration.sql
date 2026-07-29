-- Feature 00019 ext (2026-07-29) — AI Suggestion Usage Limit & Credit
-- SSOT: docs/20 - Features/00019 - AI Reply Assistant/EXTENSIONS-2026-07-29-usage-limit.md §"Data Model"
--
-- เขียนด้วยมือ (ไม่ใช่ `prisma migrate dev`) ตาม docs/conventions/prisma-shared-db-drift.md —
-- DB dev/prod เป็น instance เดียวกันบน Supabase และมี unmanaged SQL (partial index/EXCLUDE constraint
-- ของ feature 00008/00017) อยู่แล้วที่ introspection จะพยายามลบถ้ารัน `migrate dev`/`db pull`
-- apply ด้วย `migrate deploy` เท่านั้น (Controller ขอ user ยืนยันก่อน — DB นี้ = prod)
--
-- additive ล้วน: สร้าง 2 ตารางใหม่ ไม่แตะตารางเดิมแม้แต่คอลัมน์เดียว ไม่ล็อกตารางที่มีทราฟฟิก
-- ไม่มี backfill (ตารางว่างเปล่า ไม่มีข้อมูลเดิมให้ migrate) ไม่มี downtime
-- โค้ดเวอร์ชันเก่าที่ยังไม่รู้จัก 2 ตารางนี้ทำงานได้ปกติ (ไม่มีใครอ่าน/เขียน) → rolling deploy ปลอดภัย

-- ============================================================================
-- AiSuggestDailyUsage — ตัวนับโควตาฟรี ai-suggest ต่อร้านต่อวัน (ปฏิทินไทย)
-- ⚠️ เฉพาะร้าน non-paid — ร้าน paid plan (unlimited path) ไม่ถูกอ่าน/เขียนตารางนี้เลย (BR-AIQ-02)
-- ============================================================================

CREATE TABLE "AiSuggestDailyUsage" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSuggestDailyUsage_pkey" PRIMARY KEY ("id")
);

-- unique บน (shopId, date) ทำหน้าที่ 2 อย่างพร้อมกัน: บังคับ "1 แถวต่อร้านต่อวัน" ที่ระดับ DB +
-- เป็น index ของ WHERE เดียวที่ atomic conditional updateMany ใช้ (claim free slot / refund —
-- pattern เดียวกับ SellerWallet.balance ใน wallet.service.ts, FR-AIQ-07/NFR-AIQ-Concurrency)
CREATE UNIQUE INDEX "AiSuggestDailyUsage_shopId_date_key" ON "AiSuggestDailyUsage"("shopId", "date");

-- Cascade: ลบร้าน = ลบตัวนับโควตาตาม (ไม่มีความหมายเมื่อไม่มีร้าน)
ALTER TABLE "AiSuggestDailyUsage" ADD CONSTRAINT "AiSuggestDailyUsage_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense-in-depth: count ห้ามติดลบที่ระดับ DB เช่นเดียวกับ SellerWallet.balance (RC-3 pattern,
-- migration 20260516160921) — กัน bug การคืนโควตา (refund, BR-AIQ-06/07) ที่เผลอลดซ้ำสองครั้งไม่ให้
-- ทำให้ตัวเลขติดลบเงียบ ๆ; ตารางใหม่/ยังไม่มีข้อมูล จึงเพิ่ม CHECK ตรง ๆ ได้โดยไม่ต้อง NOT VALID+VALIDATE
ALTER TABLE "AiSuggestDailyUsage" ADD CONSTRAINT "AiSuggestDailyUsage_count_nonneg" CHECK ("count" >= 0);

-- ============================================================================
-- AiSuggestUsageEvent — audit log ทุกครั้งที่ ai-suggest ผ่าน gate สำเร็จ (FREE/CREDIT/UNLIMITED_PLAN)
-- ไม่ผูก logic gate ใด ๆ — เขียนแบบ best-effort เพื่อ debug + admin cost dashboard ในอนาคต (Deferred)
-- ============================================================================

CREATE TABLE "AiSuggestUsageEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountBaht" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "businessDay" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSuggestUsageEvent_pkey" PRIMARY KEY ("id")
);

-- Cascade: ลบร้าน = ลบ audit log ของร้านนั้นตาม (มิเรอร์ StockMovement/AiSuggestDailyUsage —
-- ทุกตาราง scope-by-shop ในโปรเจกต์นี้ cascade เมื่อ shop หาย ไม่มีตารางไหน restrict บน shopId)
ALTER TABLE "AiSuggestUsageEvent" ADD CONSTRAINT "AiSuggestUsageEvent_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ไม่มี FK บน conversationId ตั้งใจ (มิเรอร์ WalletTransaction.refId) — audit log ต้องอยู่รอดอิสระ
-- จากวงจรชีวิตของเธรดแชท ไม่ผูกกับการลบ/archive conversation ในอนาคต

-- audit trail ต่อร้าน เรียงเวลาล่าสุดก่อน (debug/support — NFR-AIQ-Obs)
CREATE INDEX "AiSuggestUsageEvent_shopId_createdAt_idx" ON "AiSuggestUsageEvent"("shopId", "createdAt");

-- รายงานต้นทุนรายวันต่อร้าน แบบ group by ปฏิทินไทย exact-match (admin cost dashboard, Deferred)
CREATE INDEX "AiSuggestUsageEvent_shopId_businessDay_idx" ON "AiSuggestUsageEvent"("shopId", "businessDay");

-- ROLLBACK NOTE:
-- DROP TABLE IF EXISTS "AiSuggestUsageEvent";
-- DROP TABLE IF EXISTS "AiSuggestDailyUsage";
-- ปลอดภัย ไม่มีข้อมูลของระบบอื่นสูญหาย — 2 ตารางนี้เป็น additive ล้วน ไม่มีตารางอื่น FK ชี้เข้ามา
-- (ไม่มี reverse dependency) ผลกระทบเดียวคือ: (1) เพดานโควตารายวัน/ออดิตล็อกหายไป — โค้ดฝั่ง service
-- ต้องมี fallback ที่เหมาะสม (fail-closed ตาม BR-AIQ อยู่แล้วถ้า query ตารางไม่เจอ = error ไม่ใช่ 500 เงียบ)
-- ก่อน drop จริงต้อง revert โค้ดที่ query 2 ตารางนี้ก่อนเสมอ (deploy โค้ดเก่าที่ไม่รู้จักตารางนี้ก่อน
-- แล้วค่อย drop) มิฉะนั้น request ai-suggest ทุกอันจะ error รัว ๆ (fail-closed ตาม BR-AIQ-08/NFR-AIQ-Consistency
-- ทำงานตามออกแบบ แต่ผลลัพธ์คือ AI ช่วยร่างใช้ไม่ได้เลยทั้งระบบจนกว่าจะ revert โค้ด)
