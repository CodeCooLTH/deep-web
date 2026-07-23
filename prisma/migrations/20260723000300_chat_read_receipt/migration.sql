-- feature 00018 read receipt — watermark ลูกค้าฝั่งช่องทางนอกอ่านถึงเวลานี้ (additive, ปลอดภัย)
ALTER TABLE "Conversation" ADD COLUMN "externalReadAt" TIMESTAMP(3);
