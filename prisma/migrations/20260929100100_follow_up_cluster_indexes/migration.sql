-- feature 00066 — index ธรรมดา 2 ตัวสำหรับ cluster query (DATABASE.md §4.2/§5.2)
-- แยกไฟล์จาก CREATE TABLE เพื่อให้ SHARE lock (บล็อกเฉพาะการเขียน) ครอบแค่สองคำสั่งนี้
-- ไม่ใช้ CONCURRENTLY เพราะ Prisma ห่อ migration ในทรานแซกชัน · IF NOT EXISTS เผื่อฐาน local ที่ apply มือ
-- ⚠️ Controller ต้องวัด count(*) ของ Conversation/ExternalContact บน prod ก่อน merge
CREATE INDEX IF NOT EXISTS "ExternalContact_customerId_idx" ON "ExternalContact"("customerId");
CREATE INDEX IF NOT EXISTS "Conversation_externalContactId_idx" ON "Conversation"("externalContactId");
