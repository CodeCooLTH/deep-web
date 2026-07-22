-- feature 00018: Facebook/Instagram chat integration
-- additive ล้วน: ไม่ลบคอลัมน์ ไม่เปลี่ยนชนิดข้อมูลเดิม row เดิมได้ channel='DEEP' จาก DEFAULT

CREATE TABLE "ShopChannel" (
  "id"                TEXT NOT NULL,
  "shopId"            TEXT NOT NULL,
  "provider"          TEXT NOT NULL,
  "externalId"        TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "avatarUrl"         TEXT,
  "accessTokenEnc"    TEXT NOT NULL,
  "connectedByUserId" TEXT NOT NULL,
  "status"            TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopChannel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopChannel_provider_externalId_key" ON "ShopChannel"("provider", "externalId");
CREATE INDEX "ShopChannel_shopId_status_idx" ON "ShopChannel"("shopId", "status");

ALTER TABLE "ShopChannel" ADD CONSTRAINT "ShopChannel_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ExternalContact" (
  "id"             TEXT NOT NULL,
  "shopChannelId"  TEXT NOT NULL,
  "externalUserId" TEXT NOT NULL,
  "name"           TEXT,
  "avatarUrl"      TEXT,
  "customerId"     TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalContact_shopChannelId_externalUserId_key"
  ON "ExternalContact"("shopChannelId", "externalUserId");

ALTER TABLE "ExternalContact" ADD CONSTRAINT "ExternalContact_shopChannelId_fkey"
  FOREIGN KEY ("shopChannelId") REFERENCES "ShopChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalContact" ADD CONSTRAINT "ExternalContact_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Conversation: nullable buyerUserId + ฟิลด์ channel
ALTER TABLE "Conversation" ALTER COLUMN "buyerUserId" DROP NOT NULL;
ALTER TABLE "Conversation" ADD COLUMN "channel"           TEXT NOT NULL DEFAULT 'DEEP';
ALTER TABLE "Conversation" ADD COLUMN "shopChannelId"     TEXT;
ALTER TABLE "Conversation" ADD COLUMN "externalContactId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "lastInboundAt"     TIMESTAMP(3);
-- S-7: ปักหมุด / ซ่อน / ปิดงาน (ผลตัดสิน Q-4) — ใส่รอบเดียวกันเพื่อเลี่ยง ALTER ซ้ำบน DB ที่แชร์กับ prod
ALTER TABLE "Conversation" ADD COLUMN "isPinned"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN "isHidden"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN "resolvedAt" TIMESTAMP(3);

-- inbox list กรอง "ยังเปิดอยู่ + ไม่ซ่อน" แล้วเรียงหมุดขึ้นก่อน — index ครอบ query หลักของหน้า /inbox
CREATE INDEX "Conversation_shopId_isHidden_isPinned_lastMessageAt_idx"
  ON "Conversation"("shopId", "isHidden", "isPinned", "lastMessageAt" DESC);

CREATE UNIQUE INDEX "Conversation_shopChannelId_externalContactId_key"
  ON "Conversation"("shopChannelId", "externalContactId");

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_shopChannelId_fkey"
  FOREIGN KEY ("shopChannelId") REFERENCES "ShopChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_externalContactId_fkey"
  FOREIGN KEY ("externalContactId") REFERENCES "ExternalContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ChatMessage: nullable senderUserId + ฟิลด์ delivery
ALTER TABLE "ChatMessage" ALTER COLUMN "senderUserId" DROP NOT NULL;
ALTER TABLE "ChatMessage" ADD COLUMN "externalMessageId" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "deliveryStatus"    TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "failureReason"     TEXT;

CREATE UNIQUE INDEX "ChatMessage_externalMessageId_key" ON "ChatMessage"("externalMessageId");
