-- feature 00018: กลุ่ม/แท็บจัดหมวดแชทที่ร้านตั้งเอง (user request 2026-07-23)
-- additive ล้วน (สร้างตารางใหม่ + เพิ่มคอลัมน์ nullable) — ปลอดภัยกับ shared DB dev=prod ไม่ทำลายข้อมูลเดิม

-- CreateTable
CREATE TABLE "ChatGroup" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatGroup_shopId_name_key" ON "ChatGroup"("shopId", "name");

-- CreateIndex
CREATE INDEX "ChatGroup_shopId_sortOrder_idx" ON "ChatGroup"("shopId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ChatGroup" ADD CONSTRAINT "ChatGroup_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "chatGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Conversation_chatGroupId_idx" ON "Conversation"("chatGroupId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_chatGroupId_fkey" FOREIGN KEY ("chatGroupId") REFERENCES "ChatGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
