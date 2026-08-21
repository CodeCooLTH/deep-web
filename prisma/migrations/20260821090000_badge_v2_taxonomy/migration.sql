-- feature 00052 Badge & Achievement v2 — P1 ไฟล์ที่ 1: คอลัมน์ตระกูล + backfill แคตตาล็อก
--
-- ไฟล์นี้ additive ล้วน ไม่แตะข้อมูลของผู้ใช้แม้แต่แถวเดียว (แตะเฉพาะตาราง "Badge" ซึ่งเป็น
-- แคตตาล็อกที่ระบบเป็นเจ้าของ) — การย้ายเจ้าของเหรียญอยู่ในไฟล์ที่ 2 ของคอมมิตเดียวกัน
--
-- 🛑 ค่าทุกค่าที่เขียนในไฟล์นี้ derive จาก `src/lib/badge-family.ts` ซึ่งเป็น SSOT
--    มีเทส [blocker] `src/lib/__tests__/badge-family.test.ts` ปักหมุดตระกูล+ขั้นของทั้ง 31 ใบไว้
--    ⇒ ถ้าไฟล์นี้กับ registry หลุดจากกัน เทสจะแดง ไม่ใช่ปล่อยให้เงียบ
--
-- 🛑 เลข tier มีช่องว่างโดยตั้งใจ (SHOP_TENURE มี 1 กับ 3 · ORDER_VOLUME มี 1-5)
--    ขั้นที่หายไปคือที่ว่างที่จองไว้ให้เหรียญใหม่ของ P2 — ห้ามบีบให้เรียงติดกัน

-- ── 1) คอลัมน์ใหม่ 5 ตัว (metadata-only บน Postgres 11+ ไม่เขียนทุกแถวใหม่) ──────────

ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "family"     TEXT;
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "tier"       INTEGER;
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "surface"    TEXT NOT NULL DEFAULT 'GOAL';
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "ownerScope" TEXT NOT NULL DEFAULT 'SHOP';
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "verticals"  TEXT[] NOT NULL DEFAULT '{}';

-- ── 2) backfill แคตตาล็อก 31 ใบ (idempotent — คีย์คือ nameEN ซึ่ง @unique) ────────────
--
-- icon: เขียนชื่อไอคอนจริงลงคอลัมน์เพื่อถอด emoji ออกจากฐานข้อมูล (Hard Rule 12)
-- ค่าที่ใช้คือค่าเดียวกับที่ `LUCIDE_FOR_BADGE` ใน src/lib/badge-icons.ts เคยแปลงให้ตอนเรนเดอร์
-- ⇒ **หน้าจอไม่เปลี่ยนแม้แต่ใบเดียว** ยกเว้น Spotless 100 ที่เดิมใช้ lucide:sparkles ซ้ำกับ
-- Highly Rated ทั้งที่ D-BDG-2 แยกสองใบนี้คนละตระกูลแล้ว → เปลี่ยนเป็นโล่ลายตารางให้เป็นบันได
-- เดียวกับ Zero Complaint (ใบนี้มีผู้ถือ 0 คน ณ 2026-08-21 การเปลี่ยนจึงไม่กระทบใคร)

UPDATE "Badge" AS b SET
  "family"     = v.family,
  "tier"       = v.tier,
  "surface"    = v.surface,
  "ownerScope" = v.owner_scope,
  "verticals"  = v.verticals,
  "icon"       = COALESCE(v.icon, b."icon")
FROM (VALUES
  -- nameEN,                family,             tier, surface,          ownerScope, verticals,                icon
  ('First Sale',            'ORDER_VOLUME',       1, 'GOAL',          'SHOP', '{}'::TEXT[],               'lucide:store'),
  ('Getting Started',       'ORDER_VOLUME',       2, 'GOAL',          'SHOP', '{}'::TEXT[],               'lucide:sprout'),
  ('Rising Seller',         'ORDER_VOLUME',       3, 'GOAL',          'SHOP', '{}'::TEXT[],               'lucide:trending-up'),
  ('Trusted Seller 50',     'ORDER_VOLUME',       4, 'GOAL',          'SHOP', '{}'::TEXT[],               'lucide:star'),
  ('Century Club',          'ORDER_VOLUME',       5, 'EVIDENCE',      'SHOP', '{}'::TEXT[],               'lucide:trophy'),

  ('3 Months Strong',       'SHOP_TENURE',        1, 'GOAL',          'SHOP', '{}'::TEXT[],               'lucide:calendar-check'),
  ('Veteran',               'SHOP_TENURE',        3, 'EVIDENCE',      'SHOP', '{}'::TEXT[],               'lucide:medal'),

  ('Zero Complaint',        'NO_SELLER_CANCEL',   1, 'EVIDENCE',      'SHOP', '{}'::TEXT[],               'lucide:shield-check'),
  ('Spotless 100',          'NO_SELLER_CANCEL',   2, 'EVIDENCE',      'SHOP', '{}'::TEXT[],               'tabler-shield-checkered'),

  ('Well Rated',            'REVIEW_RATING',      1, 'GOAL',          'SHOP', '{}'::TEXT[],               'lucide:thumbs-up'),
  ('Highly Rated',          'REVIEW_RATING',      2, 'GOAL',          'SHOP', '{}'::TEXT[],               'lucide:sparkles'),
  ('Perfect Rating',        'REVIEW_RATING',      3, 'GOAL',          'SHOP', '{}'::TEXT[],               'lucide:gem'),

  ('Getting Noticed',       'REVIEWER_COUNT',     1, 'GOAL',          'SHOP', '{}'::TEXT[],               'lucide:eye'),
  ('Community Favorite',    'REVIEWER_COUNT',     2, 'GOAL',          'SHOP', '{}'::TEXT[],               'lucide:heart'),

  ('Speed Demon',           'SHIP_SPEED',         1, 'EVIDENCE',      'SHOP', '{ONLINE_SALES}'::TEXT[],   'lucide:zap'),
  ('Same-Day Hero',         'SHIP_SPEED',         2, 'EVIDENCE',      'SHOP', '{ONLINE_SALES}'::TEXT[],   'lucide:rocket'),

  ('Fully Verified',        'IDENTITY_VERIFIED',  1, 'GOAL',          'USER', '{}'::TEXT[],               'lucide:badge-check'),
  ('2026_BADGE',            'FOUNDING_MEMBER',    1, 'COMMEMORATIVE', 'USER', '{}'::TEXT[],               'lucide:flag'),

  ('First Auctioneer',      'AUCTION_HOST',       1, 'GOAL',          'SHOP', '{ONLINE_SALES}'::TEXT[],   NULL),
  ('Auction Host 10',       'AUCTION_HOST',       2, 'GOAL',          'SHOP', '{ONLINE_SALES}'::TEXT[],   NULL),
  ('First Auction Win',     'AUCTION_CLOSE',      1, 'GOAL',          'SHOP', '{ONLINE_SALES}'::TEXT[],   NULL),
  ('Auction Closer 10',     'AUCTION_CLOSE',      2, 'GOAL',          'SHOP', '{ONLINE_SALES}'::TEXT[],   NULL),
  ('Auction Pro 50',        'AUCTION_CLOSE',      3, 'GOAL',          'SHOP', '{ONLINE_SALES}'::TEXT[],   NULL),
  ('Bid Magnet',            'AUCTION_HYPE',       1, 'GOAL',          'SHOP', '{ONLINE_SALES}'::TEXT[],   NULL),
  ('First Bidder',          'AUCTION_BID',        1, 'GOAL',          'USER', '{}'::TEXT[],               NULL),
  ('Active Bidder',         'AUCTION_BID',        2, 'GOAL',          'USER', '{}'::TEXT[],               NULL),
  ('First Winner',          'AUCTION_WIN',        1, 'GOAL',          'USER', '{}'::TEXT[],               NULL),
  ('Winner''s Circle',      'AUCTION_WIN',        2, 'GOAL',          'USER', '{}'::TEXT[],               NULL),
  ('Auction Completer',     'AUCTION_COMPLETE',   1, 'GOAL',          'USER', '{}'::TEXT[],               NULL),
  ('Bid Cheerer',           'AUCTION_ENGAGE',     1, 'GOAL',          'USER', '{}'::TEXT[],               NULL),
  ('Auction Watcher',       'AUCTION_ENGAGE',     2, 'GOAL',          'USER', '{}'::TEXT[],               NULL)
) AS v(name_en, family, tier, surface, owner_scope, verticals, icon)
WHERE b."nameEN" = v.name_en;

-- ── 3) CHECK constraint (unmanaged SQL — Prisma DSL ประกาศไม่ได้) ────────────────────
--
-- ทั้งสามตัวเป็นของใหม่บนตาราง Badge จึงเข้ากิ่ง "ยังไม่มี constraint" ของ DO block
-- 🛑 วันที่มีคนเพิ่มค่าใหม่ (เช่น surface ค่าที่สี่) **ห้าม DROP/ADD ทับด้วยรายชื่อที่พิมพ์ใหม่**
--    ต้องอ่านนิยามเดิมจาก pg_constraint มาต่อท้าย ตาม
--    docs/conventions/migration-check-constraint-additive.md — เหตุผลไม่ใช่ทฤษฎี:
--    2026-08-06 migration สอง branch ที่ timestamp ชนกันลบค่าของกันเองเงียบ ๆ
--    โดย migrate deploy รายงานว่าสำเร็จทุกไฟล์ แล้วไปโผล่เป็น insert ล้มบนฐานจริง

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Badge_surface_check' AND conrelid = '"Badge"'::regclass
  ) THEN
    ALTER TABLE "Badge" ADD CONSTRAINT "Badge_surface_check"
      CHECK ("surface" IN ('EVIDENCE', 'GOAL', 'COMMEMORATIVE')) NOT VALID;
    ALTER TABLE "Badge" VALIDATE CONSTRAINT "Badge_surface_check";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Badge_ownerScope_check' AND conrelid = '"Badge"'::regclass
  ) THEN
    ALTER TABLE "Badge" ADD CONSTRAINT "Badge_ownerScope_check"
      CHECK ("ownerScope" IN ('SHOP', 'USER')) NOT VALID;
    ALTER TABLE "Badge" VALIDATE CONSTRAINT "Badge_ownerScope_check";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Badge_verticals_check' AND conrelid = '"Badge"'::regclass
  ) THEN
    -- ยืมรายชื่อเดียวกับ Shop_vertical_check — ถ้าสองรายการนี้หลุดจากกัน จะมีเหรียญที่ไม่มี
    -- ร้านประเภทไหนมองเห็นเลย และไม่มีอะไรฟ้อง · อาเรย์ว่างผ่านเงื่อนไข <@ อยู่แล้ว
    ALTER TABLE "Badge" ADD CONSTRAINT "Badge_verticals_check"
      CHECK ("verticals" <@ ARRAY['ONLINE_SALES', 'SERVICE_QUEUE', 'LODGING']::TEXT[]) NOT VALID;
    ALTER TABLE "Badge" VALIDATE CONSTRAINT "Badge_verticals_check";
  END IF;
END $$;

-- ── 4) ด่านตรวจในทรานแซกชันเดียวกัน (ล้ม = ย้อนกลับทั้งไฟล์เอง) ──────────────────────
--
-- ด่านเหล่านี้ตรวจ "แถวที่เหลือผิด" ไม่ใช่ "แถวที่แก้ไปแล้ว" ⇒ แถวที่หลุดจากเงื่อนไข UPDATE
-- ทุกแถวจะโผล่ที่นี่เสมอ ไม่ต้องพึ่งการนับด้วยตา

DO $$
DECLARE
  no_family INT;
  dup_tier  INT;
  bad_pair  INT;
  emoji_left INT;
  detail    TEXT;
BEGIN
  -- V-4 · ทุกใบต้องมีตระกูลและขั้น
  SELECT count(*), string_agg("nameEN", ', ') INTO no_family, detail
  FROM "Badge" WHERE "family" IS NULL OR "tier" IS NULL;
  IF no_family > 0 THEN
    RAISE EXCEPTION '00052 P1: เหรียญ % ใบไม่มีตระกูลหรือขั้น (%) — แคตตาล็อกในฐานไม่ตรงกับ badge-family.ts', no_family, detail;
  END IF;

  -- V-5 · ขั้นห้ามซ้ำในตระกูลเดียวกัน (ไม่ได้ตรวจว่า "ไม่มีช่องว่าง" — ช่องว่างเป็นสิ่งที่ตั้งใจ)
  SELECT count(*) INTO dup_tier FROM (
    SELECT "family", "tier" FROM "Badge"
    WHERE "family" IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1
  ) t;
  IF dup_tier > 0 THEN
    RAISE EXCEPTION '00052 P1: มีขั้นซ้ำในตระกูลเดียวกัน % กลุ่ม', dup_tier;
  END IF;

  -- V-6 · family กับ tier ต้องมี/ไม่มีพร้อมกัน
  SELECT count(*) INTO bad_pair FROM "Badge" WHERE ("family" IS NULL) <> ("tier" IS NULL);
  IF bad_pair > 0 THEN
    RAISE EXCEPTION '00052 P1: มี % แถวที่ family กับ tier ไม่ครบคู่', bad_pair;
  END IF;

  -- ตระกูลยอดที่ลูกค้าจ่าย ห้ามขึ้นหน้าสาธารณะ (FR-BDG-13) — ยังไม่มีแถวใน P1 แต่ด่านอยู่ก่อน
  IF EXISTS (SELECT 1 FROM "Badge" WHERE "family" = 'REVENUE_MILESTONE' AND "surface" = 'EVIDENCE') THEN
    RAISE EXCEPTION '00052 P1: ตระกูลยอดที่ลูกค้าจ่ายถูกตั้งเป็น EVIDENCE ซึ่งห้ามเด็ดขาด';
  END IF;

  -- Hard Rule 12 · ไม่เหลือ emoji ในคอลัมน์ icon (ค่าที่ไม่ขึ้นต้นด้วยตัวอักษร ascii)
  SELECT count(*), string_agg("nameEN", ', ') INTO emoji_left, detail
  FROM "Badge" WHERE "icon" IS NOT NULL AND "icon" !~ '^[a-zA-Z]';
  IF emoji_left > 0 THEN
    RAISE EXCEPTION '00052 P1: ยังมี emoji ในคอลัมน์ icon ของ % ใบ (%)', emoji_left, detail;
  END IF;
END $$;
