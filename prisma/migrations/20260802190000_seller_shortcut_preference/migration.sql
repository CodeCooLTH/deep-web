-- feature 00027 — Customizable Shortcuts
-- เมนูลัดที่ผู้ใช้ตั้งเอง ต่อ (ผู้ใช้ x ร้าน)
--
-- เขียนด้วยมือ ไม่ได้ generate — repo นี้ห้าม `prisma migrate dev`/`db pull`
-- (migrate dev มี behavior reset ที่ลบข้อมูลทั้งฐานที่ connection ชี้อยู่ และ shadow DB ที่มัน
--  สร้างก็ drop schema ทิ้งเสมอ ฐาน prod เคยถูกล้างทั้ง 64 ตารางมาแล้วด้วยกลไกนี้ 2026-07-31;
--  db pull จะลบ unmanaged SQL ของ feature 00008/00017/00024 ออกจาก schema.prisma)
--
-- ตารางใหม่ล้วน ไม่มีข้อมูลเดิม -> เพิ่ม CHECK แบบ validate ทันทีได้ ไม่ต้องแยก NOT VALID
-- ผลกระทบต่อ schema เดิม: 0 (ไม่แก้คอลัมน์ใดของตารางที่มีอยู่ ไม่มี backfill)

CREATE TABLE "SellerShortcutPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "slugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerShortcutPreference_pkey" PRIMARY KEY ("id")
);

-- 1 คน x 1 ร้าน = 1 แถว (บังคับที่ DB ไม่ใช่แค่ที่ service) — ใช้เป็น index ของ findUnique ในตัว
CREATE UNIQUE INDEX "SellerShortcutPreference_userId_shopId_key"
    ON "SellerShortcutPreference"("userId", "shopId");

ALTER TABLE "SellerShortcutPreference" ADD CONSTRAINT "SellerShortcutPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SellerShortcutPreference" ADD CONSTRAINT "SellerShortcutPreference_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK คุมแค่ "ขอบบน" (ไม่เกิน 8 ช่อง) — safety-net ชั้นสุดท้าย ไม่ใช่กลไกหลัก
-- service layer ต้อง validate ก่อนเขียนเสมอ เพราะข้อความ error ของ CHECK violation
-- สื่อสารกับผู้ใช้ไม่ได้ (P2010 + code 23514 ไม่มีบริบทว่าเกินไปกี่ช่อง)
--
-- ไม่มีขอบล่าง: array ว่างเป็นสถานะที่ถูกต้อง (ผู้ใช้ถอดช่องที่หมดสิทธิ์ช่องสุดท้ายออกได้)
-- ส่วนกฎ "ต้องเหลือช่องที่ใช้ได้อย่างน้อย 1" ขึ้นกับ catalog สดของผู้ใช้คนนั้น ณ เวลานั้น
-- ซึ่ง DB ไม่รู้จัก จึงบังคับได้ที่ service layer เท่านั้น
--
-- array_length() คืน NULL สำหรับ array ว่าง (ไม่ใช่ 0) จึงห่อ COALESCE ให้ขอบล่างอ่านตรงเจตนา
-- ถ้าวันหน้ามีใครยกขอบล่างกลับเป็น 1 ห้ามถอด COALESCE ออก ไม่งั้นเงื่อนไขจะกลายเป็น NULL
-- ซึ่ง CHECK ไม่ถือว่า FALSE -> array ว่างผ่านฉลุยทั้งที่ตั้งใจจะห้าม
ALTER TABLE "SellerShortcutPreference" ADD CONSTRAINT "SellerShortcutPreference_slugs_count"
    CHECK (COALESCE(array_length("slugs", 1), 0) BETWEEN 0 AND 8);
