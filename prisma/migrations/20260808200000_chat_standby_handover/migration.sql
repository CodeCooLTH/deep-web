-- เก็บหลักฐานของกล่อง `standby` + field `messaging_handovers` (2026-08-08)
--
-- ที่มา: เธรดที่ "AI from Meta" ถือสิทธิ์คุมอยู่ ไม่เข้าระบบเลยจนกว่าคนจะกดรับเรื่องต่อ
-- แก้ที่ subscription แล้ว (เพิ่ม field `standby` ทั้งระดับแอปและระดับเพจ) แต่ธงที่บอกว่า
-- "แถวนี้มาตอนเราไม่ใช่เจ้าของเธรด" ยังถูก log แล้วทิ้ง — หน้าจอจึงยังบอกผู้ขายไม่ได้
--
-- additive ล้วน: เพิ่มคอลัมน์ที่มี DEFAULT + ตารางใหม่ ไม่แตะข้อมูลเดิม ไม่มี CHECK ให้ชนกับ
-- migration ของ branch อื่น (บทเรียน 20260806120000 ที่สองไฟล์ลบค่าของกันเองเงียบ ๆ)

ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "viaStandby" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ChatHandoverEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "pageExternalId" TEXT NOT NULL,
    "contactExternalId" TEXT,
    "kind" TEXT NOT NULL,
    "previousOwnerAppId" TEXT,
    "newOwnerAppId" TEXT,
    "requestedOwnerAppId" TEXT,
    "metadata" TEXT,
    "viaStandby" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "occurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatHandoverEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChatHandoverEvent_pageExternalId_createdAt_idx"
    ON "ChatHandoverEvent"("pageExternalId", "createdAt");
CREATE INDEX IF NOT EXISTS "ChatHandoverEvent_contactExternalId_createdAt_idx"
    ON "ChatHandoverEvent"("contactExternalId", "createdAt");
