-- feature 00035 — ตัวจัดหน้าร้าน (Shop Page Builder)
-- SSOT: docs/20 - Features/00035 - Shop Page Builder/{PRD,BRD,DATABASE}.md
-- มติที่ล็อกแล้ว (user 2026-08-07): คงโครงแท็บเดิม (ไม่รื้อ ProfileTabs) · mirror รูปโพสต์ตอนกดเพิ่ม
-- (ไม่ mirror ทั้งคลัง) · เหรียญตราเด่นสูงสุด 4 ใบ · สิทธิ์เข้าถึง OWNER + ShopMember(role=ADMIN)
--
-- SAFETY: additive ล้วน — 2 ตารางใหม่ (ไม่มีแถวอยู่ก่อน) + 2 คอลัมน์ nullable บน FacebookPost เดิม
-- ADD COLUMN nullable บน PostgreSQL 11+ เป็น metadata-only ไม่ rewrite ตาราง ไม่ล็อกนาน
-- ไม่แตะ/ไม่ลบคอลัมน์หรือ constraint เดิมสักจุดเดียว ปลอดภัยกับฐานที่แชร์กับ prod (Hard Rule 15:
-- migration นี้จะรันจริงตอน push เข้า main ผ่าน `prisma migrate deploy` ใน build — ไม่ต้องรันมือ)
--
-- ตารางใหม่ทั้งคู่ไม่มีข้อมูลอยู่ก่อน จึงเพิ่ม CHECK ตอน CREATE TABLE ได้ตรง ๆ (ไม่ต้อง NOT VALID+VALIDATE
-- ตาม docs/conventions/migration-check-constraint-additive.md — กฎนั้นครอบเฉพาะ CHECK บนตาราง/คอลัมน์
-- ที่มีข้อมูลอยู่แล้วและเสี่ยงชนกับ branch อื่นที่แก้ CHECK เดิมพร้อมกัน)

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) ShopPageLayout — สวิตช์เผยแพร่ + ลำดับแท็บของหน้าร้านสาธารณะ (1:1 Shop)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE "ShopPageLayout" (
    "id"          TEXT NOT NULL,
    "shopId"      TEXT NOT NULL,
    -- isPublished: default true = ร้านเดิมทุกร้าน "เผยแพร่" อัตโนมัติ (zero-regression) — มีผลเฉพาะ
    -- ตอน INSERT แถวใหม่เท่านั้น ฝั่ง service ต้อง fallback เป็น true เองเมื่อยังไม่มีแถวนี้เลย (ร้านที่
    -- ยังไม่เคยเปิดตัวจัดหน้าร้าน) ห้ามพึ่ง DEFAULT นี้อย่างเดียว
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    -- tabOrder: ลำดับ tab key ที่ร้านจัดเอง — ว่าง [] = ใช้ลำดับ default ของระบบ (เหมือนวันนี้ทุก
    -- ประการ) ค่าที่ถูกต้อง 7 ตัว validate ที่ Valibot ไม่ CHECK ที่ DB (มิเรอร์ Shop.categories)
    "tabOrder"    TEXT[] NOT NULL DEFAULT '{}',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopPageLayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopPageLayout_shopId_key" ON "ShopPageLayout"("shopId");

-- Cascade: ลบร้าน (hard-delete ในอนาคต) = ลบการตั้งค่าหน้าร้าน — ไม่มีความหมายนอกร้าน
ALTER TABLE "ShopPageLayout" ADD CONSTRAINT "ShopPageLayout_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) ShopPageBlock — บล็อกเหนือแถบแท็บ (เหรียญตราเด่น / โพสต์ Facebook รายโพสต์)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE "ShopPageBlock" (
    "id"             TEXT NOT NULL,
    "shopId"         TEXT NOT NULL,
    -- type: 'BADGE_HIGHLIGHT' | 'FACEBOOK_POST' — String + CHECK ตาม convention เดิมของโปรเจกต์
    "type"           TEXT NOT NULL,
    -- ตำแหน่งภายในกลุ่มบล็อกเหนือแถบแท็บของร้านนี้ (BADGE_HIGHLIGHT + FACEBOOK_POST คนละแถวแต่
    -- ใช้พื้นที่จัดลำดับเดียวกัน) เขียนทับเป็น 0..n-1 ทุกครั้งที่บันทึก ไม่มี unique บนคอลัมน์นี้
    "sortOrder"      INTEGER NOT NULL DEFAULT 0,
    -- ใช้เฉพาะ type='BADGE_HIGHLIGHT' — ลำดับ UserBadge.id ที่เลือก สูงสุด 4 ใบ (CHECK ด้านล่าง)
    "badgeIds"       TEXT[] NOT NULL DEFAULT '{}',
    -- ใช้เฉพาะ type='FACEBOOK_POST' — อ้าง FacebookPost ที่ถูกเพิ่ม
    "facebookPostId" TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopPageBlock_pkey" PRIMARY KEY ("id")
);

-- อ่านบล็อกของร้านเรียงตำแหน่ง — query หลักทั้งฝั่ง public profile render และ builder canvas load
CREATE INDEX "ShopPageBlock_shopId_sortOrder_idx" ON "ShopPageBlock"("shopId", "sortOrder");
-- lookup ย้อนกลับตอน FacebookPost ถูกแก้/ตรวจสอบว่ามีบล็อกอ้างถึงอยู่ไหม
CREATE INDEX "ShopPageBlock_facebookPostId_idx" ON "ShopPageBlock"("facebookPostId");

-- partial unique #1: เหรียญตราเด่นมีได้แถวเดียวต่อร้าน (BR-PGB-06) — Prisma DSL ประกาศ partial
-- index ไม่ได้ (เหมือน UserBadge_shopId_badgeId_key, Shop_userId_personal_key) เป็น unmanaged SQL
CREATE UNIQUE INDEX "ShopPageBlock_shopId_badgeHighlight_key"
    ON "ShopPageBlock"("shopId") WHERE "type" = 'BADGE_HIGHLIGHT';

-- partial unique #2: โพสต์เดียวกันเพิ่มซ้ำในร้านเดียวกันไม่ได้ (FR-PGB-05 "ไม่แสดงปุ่มเพิ่มซ้ำ")
CREATE UNIQUE INDEX "ShopPageBlock_shopId_facebookPostId_key"
    ON "ShopPageBlock"("shopId", "facebookPostId")
    WHERE "type" = 'FACEBOOK_POST' AND "facebookPostId" IS NOT NULL;

-- Cascade shopId: ลบร้าน = ลบบล็อกของร้านนั้น
ALTER TABLE "ShopPageBlock" ADD CONSTRAINT "ShopPageBlock_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cascade facebookPostId: โพสต์ต้นทางหายไป (channel ถูกลบ/sync ใหม่แล้วโพสต์หายจริงบน Meta) →
-- แถวบล็อกนี้หายไปด้วยเงียบ ๆ ("หน้าร้านไม่พัง" — ไม่เหลือ orphan ให้เจ้าของร้านต้องมาล้างเอง)
ALTER TABLE "ShopPageBlock" ADD CONSTRAINT "ShopPageBlock_facebookPostId_fkey"
    FOREIGN KEY ("facebookPostId") REFERENCES "FacebookPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK #1: type จำกัดแค่ 2 ค่า (ตารางใหม่ไม่มีข้อมูล — ไม่ต้อง NOT VALID)
ALTER TABLE "ShopPageBlock" ADD CONSTRAINT "ShopPageBlock_type_check"
    CHECK ("type" IN ('BADGE_HIGHLIGHT', 'FACEBOOK_POST'));

-- CHECK #2: แต่ละแถวใช้ field ตรงกับ type ของตัวเองเท่านั้น + เพดานเหรียญตราเด่น 4 ใบ (มติ
-- user 2026-08-07 ข้อ 3) — กันแถวที่ type='BADGE_HIGHLIGHT' แต่ตั้ง facebookPostId (หรือกลับกัน)
-- ไม่ให้หลุดผ่าน service ที่เขียนผิดพลาดในอนาคต
ALTER TABLE "ShopPageBlock" ADD CONSTRAINT "ShopPageBlock_type_fields_check"
    CHECK (
        ("type" = 'BADGE_HIGHLIGHT' AND "facebookPostId" IS NULL AND cardinality("badgeIds") <= 4)
        OR
        ("type" = 'FACEBOOK_POST' AND "facebookPostId" IS NOT NULL AND cardinality("badgeIds") = 0)
    );

-- CHECK #3: sortOrder ไม่ติดลบ (แถวใหม่ไม่มีข้อมูล — เผื่อ backstop เฉย ๆ เหมือน Room_price_positive)
ALTER TABLE "ShopPageBlock" ADD CONSTRAINT "ShopPageBlock_sortOrder_non_negative"
    CHECK ("sortOrder" >= 0);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) FacebookPost — เพิ่ม 2 คอลัมน์สำหรับสำเนารูปปกที่ mirror แล้ว (มติ user 2026-08-07 ข้อ 2)
-- ═══════════════════════════════════════════════════════════════════════════
-- NULL เสมอจนกว่าจะมีร้านกด "เพิ่มลงหน้าร้าน" ครั้งแรก (ไม่ mirror ทุกโพสต์ที่ดึงมาจาก webhook/backfill)
-- เก็บเป็น "fileId ของ storage" ไม่ใช่ URL ดิบ — เขียนผ่าน mirrorRemoteImage() ที่มีอยู่แล้ว
-- (src/services/channel-chat.service.ts, feature 00018) ห้ามเขียน mirror logic ใหม่ซ้ำ
ALTER TABLE "FacebookPost" ADD COLUMN "mirroredFileId" TEXT;
ALTER TABLE "FacebookPost" ADD COLUMN "mirroredAt" TIMESTAMP(3);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (ปลอดภัยได้เต็มที่เฉพาะ "ก่อน" มีร้านไหนกดบันทึกตัวจัดหน้าร้านจริง — หลังจากนั้น
-- rollback จะทำให้ร้านที่จัดหน้าไปแล้วเสียการตั้งค่านั้น แต่ไม่กระทบข้อมูลต้นทาง (Shop/FacebookPost/
-- Badge/UserBadge เดิมไม่ถูกแตะ) — ไฟล์ mirroredFileId ที่ถูก mirror ไปแล้วจะค้างเป็น orphan ใน
-- storage bucket (ไม่เป็นอันตราย เก็บกวาดทีหลังได้):
--
--   ALTER TABLE "FacebookPost" DROP COLUMN "mirroredAt";
--   ALTER TABLE "FacebookPost" DROP COLUMN "mirroredFileId";
--   DROP TABLE "ShopPageBlock";
--   DROP TABLE "ShopPageLayout";
