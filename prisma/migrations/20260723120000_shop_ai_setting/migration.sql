-- Feature 00019 (AI Reply Assistant) — Migration 1: ShopAiSetting
-- SSOT: docs/20 - Features/00019 - AI Reply Assistant/DATABASE.md §3, §5
--
-- เขียนด้วยมือ (ไม่ใช่ `prisma migrate dev`) ตาม docs/conventions/prisma-shared-db-drift.md —
-- DB dev/prod เป็น instance เดียวกันบน Supabase และมี orphaned migration นอก git อยู่แล้ว
-- `migrate dev` จะพยายาม reset = ลบข้อมูล production จริง. apply ด้วย `migrate deploy` เท่านั้น
--
-- additive ล้วน: สร้างตารางใหม่ ไม่แตะตารางเดิม ไม่ล็อกตารางที่มีทราฟฟิก ไม่มี downtime
-- โค้ดเวอร์ชันเก่าที่ยังไม่รู้จักตารางนี้ทำงานได้ปกติ (ไม่มีใครอ่าน) → rolling deploy ปลอดภัย

CREATE TABLE "ShopAiSetting" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "instruction" TEXT,
    "includeProductContext" BOOLEAN NOT NULL DEFAULT true,
    "includeCustomerContext" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopAiSetting_pkey" PRIMARY KEY ("id")
);

-- unique บน shopId ทำหน้าที่ 2 อย่างพร้อมกัน: บังคับ 1:1 ที่ระดับ DB + เป็น index ของ query หลัก
-- (ทุกการอ่าน/เขียนเป็น lookup ด้วย shopId เดี่ยว ๆ — findUnique / upsert)
CREATE UNIQUE INDEX "ShopAiSetting_shopId_key" ON "ShopAiSetting"("shopId");

-- Cascade: ลบร้าน = ลบการตั้งค่าตาม (ไม่มีความหมายเมื่อไม่มีร้าน)
ALTER TABLE "ShopAiSetting" ADD CONSTRAINT "ShopAiSetting_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull: ลบผู้ใช้ที่เคยแก้ไข ต้องไม่ลบการตั้งค่าของร้านทิ้งไปด้วย
ALTER TABLE "ShopAiSetting" ADD CONSTRAINT "ShopAiSetting_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ROLLBACK NOTE:
-- DROP TABLE IF EXISTS "ShopAiSetting";
-- ปลอดภัย ไม่มีข้อมูลของระบบอื่นสูญหาย — ผลกระทบเดียวคือร้านที่เคยตั้งค่ากลับไปใช้ค่าเริ่มต้น
-- (getAiSetting จับ error แล้วคืนค่าเริ่มต้นอยู่แล้ว ตาม TFR-009)
