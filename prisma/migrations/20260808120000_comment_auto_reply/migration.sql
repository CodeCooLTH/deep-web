-- feature 00038 ตอบกลับคอมเมนต์
ALTER TABLE "ShopChannel"
  ADD COLUMN "commentPublicReplyEnabled"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "commentPublicReplyText"     TEXT,
  ADD COLUMN "commentPrivateReplyEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "commentPrivateReplyText"    TEXT;

ALTER TABLE "PageComment"
  ADD COLUMN "isAutoReply" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "CommentReplyLog" (
  "id"                 TEXT NOT NULL,
  "shopChannelId"      TEXT NOT NULL,
  "postId"             TEXT NOT NULL,
  "commentId"          TEXT NOT NULL,
  "fromExternalId"     TEXT,
  "trigger"            TEXT NOT NULL,
  "actorUserId"        TEXT,
  "publicReplyStatus"  TEXT,
  "privateReplyStatus" TEXT,
  "skipReason"         TEXT,
  "errorMessage"       TEXT,
  "conversationId"     TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommentReplyLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CommentReplyLog"
  ADD CONSTRAINT "CommentReplyLog_shopChannelId_fkey" FOREIGN KEY ("shopChannelId")
    REFERENCES "ShopChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommentReplyLog_postId_fkey" FOREIGN KEY ("postId")
    REFERENCES "FacebookPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommentReplyLog_commentId_fkey" FOREIGN KEY ("commentId")
    REFERENCES "PageComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CommentReplyLog_shopChannelId_createdAt_idx"
  ON "CommentReplyLog"("shopChannelId", "createdAt");
CREATE INDEX "CommentReplyLog_commentId_idx" ON "CommentReplyLog"("commentId");

-- 🛑 กันซ้ำ 2 ระดับที่เป็นคนละกฎกัน — ดู SDS TD-004
--
-- AUTO = "1 ครั้ง/คน/โพสต์" เป็นกฎของ Deep ไว้กันไม่ให้เพจร้านดูเป็นสแปม
-- MANUAL = "1 ครั้ง/คอมเมนต์" เป็นเพดานของ Meta (private reply ส่งได้ครั้งเดียวต่อคอมเมนต์)
--
-- เอากฎ AUTO ไปครอบ MANUAL ด้วยไม่ได้: คนที่คอมเมนต์ 2 ครั้งบนโพสต์เดียว ร้านต้องทัก
-- ด้วยมือได้ทั้ง 2 อัน เพราะ Meta อนุญาต — การมัดไว้ที่ 1 ครั้งคือเอากฎกันสแปมของบอท
-- ไปมัดมือคน
--
-- ใช้ partial unique index เพราะ Prisma schema ประกาศ WHERE ไม่ได้ (แบบเดียวกับ
-- 20260722000200_shopchannel_active_partial_unique)
CREATE UNIQUE INDEX "CommentReplyLog_auto_once_per_person_post"
  ON "CommentReplyLog"("shopChannelId", "postId", "fromExternalId")
  WHERE "trigger" = 'AUTO';

CREATE UNIQUE INDEX "CommentReplyLog_manual_once_per_comment"
  ON "CommentReplyLog"("commentId")
  WHERE "trigger" = 'MANUAL';
