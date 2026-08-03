-- feature 00029 — กล่องความคิดเห็น Facebook: ตารางโพสต์ + คอมเมนต์
--
-- ทำไมต้องมี 2 ตาราง ไม่ยัดคอมเมนต์เข้า Conversation/ChatMessage เดิม:
--   * คอมเมนต์เป็น "ข้อความสาธารณะใต้โพสต์" ไม่ใช่ห้องคุย 1:1 — ไม่มีคู่สนทนา ไม่มีหน้าต่าง 24 ชม.
--     และ action ที่ทำได้คนละชุด (ตอบสาธารณะ/ซ่อน/ลบ) ยัดรวมแล้วกฎของสองโดเมนจะปนกันเงียบ ๆ
--   * หน้าจอที่ user เลือก (แบบ Business Suite) จัดกลุ่มตามโพสต์ → ต้องมีแถวโพสต์ให้เรียง
--     ตามเวลาคอมเมนต์ล่าสุด และมีที่เก็บรูป/ข้อความโพสต์ที่ webhook ไม่ได้ส่งมา (feed ให้แค่ post_id)
--
-- ทั้งหมดเป็น CREATE TABLE ใหม่ — ไม่แตะตารางเดิมสักคอลัมน์ ปลอดภัยกับฐานที่แชร์กับ prod

CREATE TABLE "FacebookPost" (
    "id" TEXT NOT NULL,
    "shopChannelId" TEXT NOT NULL,
    -- "{pageId}_{postNum}" ตาม payload จริงที่เก็บได้ 2026-08-03
    "externalPostId" TEXT NOT NULL,
    "message" TEXT,
    "permalink" TEXT,
    "thumbnailUrl" TEXT,
    "createdTime" TIMESTAMP(3),
    -- ตัวเรียงของรายการซ้าย: โพสต์ที่มีคอมเมนต์ล่าสุดอยู่บนสุด (ไม่ใช่วันที่โพสต์)
    "lastCommentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacebookPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacebookPost_externalPostId_key" ON "FacebookPost"("externalPostId");
CREATE INDEX "FacebookPost_shopChannelId_lastCommentAt_idx" ON "FacebookPost"("shopChannelId", "lastCommentAt");

ALTER TABLE "FacebookPost"
    ADD CONSTRAINT "FacebookPost_shopChannelId_fkey"
    FOREIGN KEY ("shopChannelId") REFERENCES "ShopChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PageComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "shopChannelId" TEXT NOT NULL,
    -- "{postNum}_{commentNum}" — กันซ้ำแบบเดียวกับ ChatMessage.externalMessageId
    "externalCommentId" TEXT NOT NULL,
    -- id ของคอมเมนต์แม่ฝั่ง Meta (null = คอมเมนต์ระดับบน) — เก็บเป็น external id ไม่ใช่ id ภายใน
    -- เพราะคอมเมนต์ลูกมาถึงก่อนตัวแม่ได้ (webhook มาก่อน backfill) ผูกด้วย id ภายในจะพลาดตอนนั้น
    "parentExternalId" TEXT,
    "fromExternalId" TEXT,
    "fromName" TEXT,
    "isFromPage" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "attachmentUrl" TEXT,
    "createdTime" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    -- ลูกค้าลบคอมเมนต์บน Facebook = ทำเครื่องหมาย ไม่ลบแถว (BR-CMT-04 เก็บเป็นหลักฐาน)
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    -- คนในทีมร้านที่กดตอบผ่าน Deep — Meta มองว่าทุกคำตอบเป็นของ "เพจ" ถ้าไม่เก็บเองจะไม่มีวันรู้
    "repliedByUserId" TEXT,
    -- payload ดิบ (บทเรียน 2026-08-03: เก็บของที่ parse แล้ว = ตัดคำตอบทิ้งตั้งแต่ก่อนถึงฐาน)
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageComment_externalCommentId_key" ON "PageComment"("externalCommentId");
-- อ่านคอมเมนต์ของโพสต์เรียงตามเวลา (หน้าจอหลัก)
CREATE INDEX "PageComment_postId_createdTime_idx" ON "PageComment"("postId", "createdTime");
-- ค้นหา/รายการรวมระดับเพจ
CREATE INDEX "PageComment_shopChannelId_createdTime_idx" ON "PageComment"("shopChannelId", "createdTime");
-- หา "คำตอบของคอมเมนต์นี้" เพื่อตัดสินว่าตอบแล้วหรือยัง
CREATE INDEX "PageComment_parentExternalId_idx" ON "PageComment"("parentExternalId");

ALTER TABLE "PageComment"
    ADD CONSTRAINT "PageComment_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "FacebookPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
