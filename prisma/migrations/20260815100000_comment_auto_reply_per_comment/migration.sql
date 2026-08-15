-- feature 00038 — แยกเพดานของ "ตอบใต้คอมเมนต์" ออกจาก "ทักแชท"
--
-- ที่มา (user 2026-08-15): คอมเมนต์ที่ 2 ของคนเดิมบนโพสต์เดิมไม่ได้รับคำตอบใด ๆ และ **ไม่มี
-- ร่องรอยในหน้าประวัติเลยสักบรรทัด** (เคสจริงบน prod: fromExternalId 27753759930971545
-- โพสต์ 32ce13f4-… คอมเมนต์ 10 ส.ค. ได้ครบทั้งสองช่องทาง แล้ว 15 ส.ค. เงียบสนิท)
--
-- ต้นเหตุมี 2 ชั้นและอยู่ที่ index ตัวนี้ทั้งคู่:
--   1. กฎ BR-CR-A2 เดิม "หนึ่งคน ตอบอัตโนมัติครั้งเดียวต่อโพสต์" ครอบ **ทั้งสองช่องทาง** ทั้งที่
--      เพดานจริงของ Facebook คือ "ทักแชทได้ครั้งเดียวต่อคอมเมนต์" เท่านั้น — การตอบใต้คอมเมนต์
--      สาธารณะไม่มีเพดานอะไรเลย ลูกค้าถามใหม่ก็ควรได้คำตอบใหม่
--   2. `recordSkip()` เขียนแถว skip ด้วยคีย์ (shopChannelId, postId, fromExternalId, AUTO)
--      ซึ่งเป็น **คีย์เดียวกับ index นี้** ที่แถวรอบก่อนถือครองอยู่ -> ชน P2002 -> ถูกกลืน
--      = เหตุผล ALREADY_HANDLED เขียนลงฐานไม่ได้เลยแม้แต่แถวเดียวตั้งแต่วันแรก
--      (ยืนยันกับ prod 2026-08-15: skipReason ที่มีจริงมีแค่ FROM_PAGE / DISABLED / NOT_TOP_LEVEL)
--
-- กติกาใหม่:
--   * ตอบใต้คอมเมนต์ = ครั้งเดียวต่อ **คอมเมนต์** (กัน webhook retry ของคอมเมนต์เดียวกัน)
--   * ทักแชท        = ครั้งเดียวต่อ **คน ต่อ โพสต์** (เหมือนเดิม) บังคับที่ชั้น DB ด้วย index
--     บน `privateAttemptedAt` ซึ่งถูกเขียน **ก่อน** ยิง Graph — จองสิทธิ์แบบ atomic ไม่ใช่
--     find-then-check (สองคำขอที่มาพร้อมกันจากคนเดิมบนโพสต์เดิมต้องไม่ได้ DM ซ้ำสองใบ)
--
-- ยืนยันก่อนสร้าง unique index ทั้งสองตัว (prod 2026-08-15, 223 แถว AUTO):
--   * commentId ซ้ำในกลุ่ม AUTO = 0 แถว
--   * (channel, post, from) ซ้ำในกลุ่มที่ privateReplyStatus IS NOT NULL = 0 แถว
--   * fromExternalId IS NULL ในกลุ่ม AUTO = 0 แถว
-- จึงสร้างได้โดยไม่ต้องล้างข้อมูลก่อน

ALTER TABLE "CommentReplyLog" ADD COLUMN IF NOT EXISTS "privateAttemptedAt" TIMESTAMP(3);

-- backfill: แถวเก่าที่เคยพยายามทักแชทไปแล้ว (สำเร็จหรือล้มก็ตาม) ต้องถือสิทธิ์ต่อ ไม่งั้นคอมเมนต์
-- ถัดไปของคนเดิมบนโพสต์เดิมจะได้ DM ซ้ำใบที่สอง ซึ่งเป็นสิ่งที่กฎนี้มีไว้กันตั้งแต่แรก
UPDATE "CommentReplyLog"
SET "privateAttemptedAt" = "createdAt"
WHERE trigger = 'AUTO' AND "privateReplyStatus" IS NOT NULL AND "privateAttemptedAt" IS NULL;

-- ตัวเก่าครอบทั้งสองช่องทาง — ถอดออก แล้วแทนด้วยสองตัวที่ตรงกับเพดานจริงของแต่ละช่องทาง
DROP INDEX IF EXISTS "CommentReplyLog_auto_once_per_person_post";

CREATE UNIQUE INDEX IF NOT EXISTS "CommentReplyLog_auto_once_per_comment"
  ON "CommentReplyLog" ("commentId")
  WHERE trigger = 'AUTO';

CREATE UNIQUE INDEX IF NOT EXISTS "CommentReplyLog_auto_private_once_per_person_post"
  ON "CommentReplyLog" ("shopChannelId", "postId", "fromExternalId")
  WHERE trigger = 'AUTO' AND "privateAttemptedAt" IS NOT NULL;
