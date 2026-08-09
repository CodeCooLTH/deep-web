-- ตั้งค่าแจ้งเตือนรายร้าน (user สั่ง 2026-08-08: "ตั้งค่าทีละร้านได้")
--
-- เขียนมือทั้งไฟล์ ไม่ได้ใช้ `prisma migrate dev` (Hard Rule 14 — คำสั่งนั้นต้องมี shadow DB
-- ซึ่ง Prisma drop schema ทิ้งเสมอ และเคยล้างฐาน prod มาแล้วทั้ง 64 ตาราง 2026-07-31)
--
-- additive ล้วน: สร้างตารางใหม่ + เพิ่มคอลัมน์ nullable — ไม่มี DROP/ALTER ที่ทำลายข้อมูลเดิม
-- `IF NOT EXISTS` ทุกคำสั่ง เผื่อไฟล์นี้ถูกรันซ้ำบนฐานที่ apply ไปแล้วบางส่วน
--
-- 🛑 ไม่มี backfill โดยตั้งใจ: "ไม่มีแถว = เปิด" (opt-out) ผู้ใช้เดิมทุกคนจึงยังได้แจ้งเตือน
-- ตามปกติทันทีหลัง migrate โดยไม่ต้องเขียนข้อมูลเข้าตารางใหม่แม้แต่แถวเดียว

-- platform ของ push token — /api/seller/push-token รับค่านี้จากแอปอยู่แล้วตั้งแต่วันแรก
-- แต่โยนทิ้งเพราะไม่มีคอลัมน์รองรับ (subtitle ของ Expo Push ใช้ได้เฉพาะ iOS จึงต้องแยกเครื่องออก)
ALTER TABLE "PushToken" ADD COLUMN IF NOT EXISTS "platform" TEXT;

CREATE TABLE IF NOT EXISTS "ShopNotificationPref" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "shopId"      TEXT NOT NULL,
    "chatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopNotificationPref_pkey" PRIMARY KEY ("id")
);

-- 1 คน 1 ร้าน ได้ค่าเดียว — upsert ฝั่ง service พึ่ง unique นี้ (ไม่งั้นกดสลับรัวจะได้หลายแถวแล้วอ่านค่าไม่ตรง)
CREATE UNIQUE INDEX IF NOT EXISTS "ShopNotificationPref_userId_shopId_key"
    ON "ShopNotificationPref" ("userId", "shopId");

-- ตรงกับรูป query ของ shopAudience(): "ในร้านนี้ ใครปิดแชทไว้บ้าง"
CREATE INDEX IF NOT EXISTS "ShopNotificationPref_shopId_chatEnabled_idx"
    ON "ShopNotificationPref" ("shopId", "chatEnabled");

-- CASCADE ทั้งสองทาง: ลบบัญชี/ลบร้าน แล้วค่าตั้งค่าที่ค้างไว้ต้องหายตาม ไม่เหลือแถวกำพร้า
-- (สอดคล้องกับ purge ของ account-deletion.service ที่ลบ PushToken/ShopMember ทิ้งเช่นกัน)
DO $$ BEGIN
    ALTER TABLE "ShopNotificationPref"
        ADD CONSTRAINT "ShopNotificationPref_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ShopNotificationPref"
        ADD CONSTRAINT "ShopNotificationPref_shopId_fkey"
        FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
