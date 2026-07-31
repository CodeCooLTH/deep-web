-- feature 00022 — จับเวลา sync สถานะพัสดุยกชุด (ทุก 15 นาทีตอนร้านเปิดหน้าแชท)
--
-- ต้องอยู่ใน DB ไม่ใช่หน่วยความจำ: บน serverless แต่ละคำขออาจตกคนละ instance
-- ตัวจับเวลาใน globalThis จึงกลายเป็น "ยิงใหม่แทบทุกคำขอ" โดยไม่มีใครเห็นว่าเกิดขึ้น
ALTER TABLE "ShopShippingAccount" ADD COLUMN "statusSyncedAt" TIMESTAMP(3);
