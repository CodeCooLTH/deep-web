-- Feature 00011 (Deep Chat) — Extension #1: Chat Product Context Card
-- SSOT: docs/20 - Features/00011 - Deep Chat/_extensions/product-context-card.md (Schema Delta, FR-CTX-05)
--
-- Option B — ห้ามแก้ไฟล์เดิม prisma/migrations/20260703000300_add_deep_chat_schema (apply prod แล้ว, checksum locked)
-- migration นี้ = ALTER ADD COLUMN ต่อยอด ChatMessage ที่มีอยู่แล้ว
--
-- additive-only:
--   - "productRefId" เป็น nullable column, ไม่มี DEFAULT ที่ต้อง backfill → row เดิมทั้งหมดได้ NULL อัตโนมัติ
--   - ไม่แตะ column/constraint เดิมของ ChatMessage หรือ Product
--   - ไม่เพิ่ม index (spec: "ไม่เพิ่ม index — lookup by PK enrichment")
--
-- FK onDelete SET NULL (BR-CTX-04): ลบ Product แล้ว ข้อความ PRODUCT card เดิมไม่หาย แค่ productRefId กลายเป็น NULL
--   → route/service เดิม (S-18) ต้อง handle productRefId=NULL ด้วย copy "ไม่พบสินค้านี้แล้ว" (FR-CTX-08)

ALTER TABLE "ChatMessage" ADD COLUMN "productRefId" TEXT;

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_productRefId_fkey"
  FOREIGN KEY ("productRefId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ROLLBACK NOTE (destructive — ใช้เฉพาะสั่งย้อนจริง):
-- ALTER TABLE "ChatMessage" DROP CONSTRAINT IF EXISTS "ChatMessage_productRefId_fkey";
-- ALTER TABLE "ChatMessage" DROP COLUMN IF EXISTS "productRefId";
-- ผลกระทบ: เสีย data เฉพาะ productRefId ที่บันทึกไว้ (การ์ดสินค้าที่แนบ) — body/type ของข้อความเดิมไม่หาย
-- ยังไม่มี data จริงในคอลัมน์นี้จนกว่า S-17/S-20 deploy → rollback ก่อนใช้งานจริง = ไม่มี data loss
