-- feature 00086 (BRD FR-020 · ฐานของ FR-014) — แจ้งเตือนต้องรู้ว่า "ของร้านไหน"
-- เหตุ: Notification เดิมผูกแค่ userId → เจ้าของหลายร้านจะเห็นแจ้งเตือนทุกร้านปนกันในกระดิ่ง
--   (user ตัดสิน 2026-10-27: แสดงชื่อร้าน/สาขา + กดแล้วสลับไปร้านนั้น)
-- shopId NULL = แจ้งเตือนระดับบัญชีแบบเดิม (badge/outbid/won/chat_message ฯลฯ) — แถวเก่าทั้งหมดคง NULL ไม่ backfill
-- ON DELETE CASCADE: แจ้งเตือนของร้านที่ถูกลบจริงไม่มีความหมายแล้ว (ลิงก์ชี้หน้าร้านที่ไม่มีอยู่)
--   ถ้า SET NULL แถวจะกลายเป็น "แจ้งเตือนระดับบัญชี" ที่ไม่มีร้าน และไปโผล่กระดิ่งฝั่งผู้ซื้อโดยไม่มีบริบท
--   (ตาม pattern Expense/ShopMember ที่ cascade จาก Shop)
-- index (userId, shopId, createdAt): query หลักของหน้า /notifications ฝั่งร้าน = WHERE userId=? AND shopId=? ORDER BY createdAt DESC
-- additive ล้วน · รันซ้ำได้ · ชื่อ timestamp 100150 จงใจให้อยู่ก่อน P2/P3 ที่วางแผนไว้ 100200+ (00086-db-design.md)
-- rollback: ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_shopId_fkey";
--           DROP INDEX IF EXISTS "Notification_userId_shopId_createdAt_idx";
--           ALTER TABLE "Notification" DROP COLUMN IF EXISTS "shopId";

-- lock_timeout: ถ้ารอ lock เกิน 5 วิ ให้ล้มแล้วค่อย deploy ใหม่ (Notification ถูกเขียนตลอด ห้ามค้างคิว)
SET LOCAL lock_timeout = '5s';

ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "shopId" TEXT;

-- FK แบบ NOT VALID: ไม่สแกนตรวจแถวเก่า (คอลัมน์เพิ่งเพิ่ม แถวเดิมทุกแถวเป็น NULL ⇒ ไม่มีอะไรให้ตรวจอยู่แล้ว)
--   แต่ยังบังคับกับแถวใหม่/แถวที่แก้ทุกแถวเหมือน FK ปกติ · ลดเวลาถือ lock บน Notification (ตารางโตเร็ว)
--   และ Shop · ห้ามมี VALIDATE ในไฟล์นี้ (ถ้าต้องการ ให้ทำเป็น migration แยกทีหลัง)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_shopId_fkey') THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_shopId_fkey"
      FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;

-- CREATE INDEX ธรรมดา (ไม่ CONCURRENTLY): migrate deploy รันใน transaction ซึ่ง CONCURRENTLY ใช้ไม่ได้
--   บล็อกแค่การเขียน Notification ช่วงสร้าง index (อ่านได้ปกติ) · ตารางระดับหมื่นแถว + index 3 คอลัมน์ สร้างเสร็จในไม่กี่วิ
--   ⚠️ ก่อน deploy ให้เช็ก SELECT count(*) FROM "Notification" บน prod — ถ้าเกินหลักล้านแถว ให้แยก index ไปสร้าง CONCURRENTLY นอก migrate
CREATE INDEX IF NOT EXISTS "Notification_userId_shopId_createdAt_idx" ON "Notification" ("userId", "shopId", "createdAt");
