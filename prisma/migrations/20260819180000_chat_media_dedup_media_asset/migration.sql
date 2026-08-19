-- feature 00051 — Chat Media Deduplication: ดัชนีเนื้อไฟล์ต่อร้าน (MediaAsset)
--
-- ที่มา: choke point saveMirroredBuffer (channel-chat.service.ts) เขียนไฟล์ mirror ซ้ำทุกครั้งที่
-- เนื้อหาตรงกัน เพราะไม่มีที่เก็บว่า "ร้านนี้เคยมีเนื้อไฟล์นี้หรือยัง" — MediaAsset คือดัชนีนั้น
-- (FR-CMD-01/02, BR-CMD-01/02) พร้อม 2 index เพิ่มบนตารางเดิมที่ยังไม่มี index เลยวันนี้ เพื่อรองรับ
-- query ย้อนกลับหาผู้อ้างอิงตอน backfill/retention ในอนาคต (DATABASE.md §4/§8.1)
--
-- 🛑 additive ล้วน — ไม่แตะคอลัมน์เดิมแม้แต่ตัวเดียว:
--   * ChatMessage.imageUrl / ConversationAdReferral.photoFileId / ExternalContact.avatarUrl
--     อยู่ที่เดิม type/nullable/default ไม่เปลี่ยน — เพิ่มได้แค่ index (DATABASE.md §3.2)
--   * ไม่มี CHECK constraint แบบรายชื่อค่า จึงไม่มีทางไปชนกับ migration สาขาอื่น
--     (บทเรียน 20260806120000 ที่สองไฟล์ลบค่าของกันเองเงียบ ๆ)
--   * ไม่มี backfill data operation ในไฟล์นี้ — เป็นขั้นตอนแยกทีหลังผ่าน CLI (DATABASE.md §6/§8.3)
--   * ไม่มี FK จาก MediaAsset ไปตารางอื่นเลย (fileId ไม่ใช่ FK จริง — DATABASE.md §2)

CREATE TABLE IF NOT EXISTS "MediaAsset" (
    "id"          TEXT NOT NULL,
    "shopId"      TEXT NOT NULL,
    "hash"        TEXT NOT NULL,
    "fileId"      TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size"        INTEGER NOT NULL,
    "sourceKey"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MediaAsset_fileId_key" ON "MediaAsset"("fileId");
CREATE UNIQUE INDEX IF NOT EXISTS "MediaAsset_shopId_hash_key" ON "MediaAsset"("shopId", "hash");
CREATE INDEX IF NOT EXISTS "MediaAsset_shopId_sourceKey_idx" ON "MediaAsset"("shopId", "sourceKey");

-- index เพิ่มบนตารางเดิม (§4) — ไม่แตะคอลัมน์/ค่าใด ๆ ของตารางเดิม
CREATE INDEX IF NOT EXISTS "ConversationAdReferral_photoFileId_idx" ON "ConversationAdReferral"("photoFileId");
CREATE INDEX IF NOT EXISTS "ExternalContact_avatarUrl_idx" ON "ExternalContact"("avatarUrl");
