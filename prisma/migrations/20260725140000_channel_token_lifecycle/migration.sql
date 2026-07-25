-- feature 00020 TikTok Chat Integration — token lifecycle บน ShopChannel
--
-- ทำไม: Facebook page token เป็น long-lived ไม่ต้องต่ออายุ → โครงเดิมของ feature 00018 จึงมีแต่
-- accessTokenEnc. TikTok Shop access token มีวันหมดและต่ออายุด้วย refresh token ถ้าไม่เก็บ
-- ข้อมูลสองอย่างนี้ ช่องทางจะตายเองเงียบ ๆ แล้วร้านจะรู้ตอนตอบลูกค้าไปแล้วข้อความไม่ถึง
-- (BR-TTC-26..28 / FR-TTC-09)
--
-- ความปลอดภัยของการ apply: additive ล้วน 3 คอลัมน์ nullable ไม่มี default →
-- metadata-only operation บน Postgres >= 11 (ไม่ rewrite/scan ตาราง) ปลอดภัยกับ DB ที่
-- dev = prod แชร์กัน. ไม่มีการลบ/rename/เปลี่ยนชนิดคอลัมน์เดิม ไม่มี backfill
--
-- 🛑 apply ด้วย `prisma migrate deploy -e .env.local` เท่านั้น (ห้าม `migrate dev` — จะเสนอ
-- reset ที่ลบข้อมูลทั้ง DB) และต้องขอ user ยืนยันก่อนทุกครั้ง เพราะแตะฐานเดียวกับ production
-- ดู docs/conventions/prisma-shared-db-drift.md — หลัง apply ต้อง restart dev server

ALTER TABLE "ShopChannel" ADD COLUMN "refreshTokenEnc" TEXT;
ALTER TABLE "ShopChannel" ADD COLUMN "tokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "ShopChannel" ADD COLUMN "externalMeta" JSONB;

-- cron ต่ออายุ token หาแถว "ยังใช้งานอยู่ + ใกล้หมดอายุ" ทั้งระบบ (ไม่ scope ต่อร้าน)
-- index เดิม (shopId, status) ใช้ไม่ได้เพราะ query นี้ไม่มี shopId ในเงื่อนไข
-- ตารางยังเล็กมาก (หลักสิบแถว) → CREATE INDEX แบบ plain ยอมรับได้ ไม่ต้อง CONCURRENTLY
CREATE INDEX "ShopChannel_status_tokenExpiresAt_idx" ON "ShopChannel"("status", "tokenExpiresAt");
