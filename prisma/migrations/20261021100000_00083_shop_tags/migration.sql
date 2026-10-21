-- feature 00083 — ShopTag (กติกา tag ต่อร้าน) + ShopTagEvent (ประวัติ append-only) · additive ล้วน ไม่แตะข้อมูลเดิม

CREATE TABLE "ShopTag" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "removeOnOrderCreate" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShopTag_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShopTag_name_len" CHECK (char_length("name") BETWEEN 1 AND 30),
    CONSTRAINT "ShopTag_keywords_max10" CHECK (cardinality("keywords") <= 10)
);

CREATE TABLE "ShopTagEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "externalContactId" TEXT NOT NULL,
    "conversationId" TEXT,
    "tagName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "chatMessageId" TEXT,
    "orderId" TEXT,
    "matchedKeyword" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopTagEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShopTagEvent_action_check" CHECK ("action" IN ('ADD','REMOVE')),
    CONSTRAINT "ShopTagEvent_source_check" CHECK ("source" IN ('KEYWORD','ORDER_CREATED'))
);

CREATE UNIQUE INDEX "ShopTag_shopId_nameKey_key" ON "ShopTag"("shopId", "nameKey");
CREATE INDEX "ShopTagEvent_shopId_createdAt_idx" ON "ShopTagEvent"("shopId", "createdAt");
CREATE INDEX "ShopTagEvent_externalContactId_createdAt_idx" ON "ShopTagEvent"("externalContactId", "createdAt");
CREATE INDEX "ShopTagEvent_chatMessageId_idx" ON "ShopTagEvent"("chatMessageId");
CREATE INDEX "ShopTagEvent_orderId_idx" ON "ShopTagEvent"("orderId");

ALTER TABLE "ShopTag" ADD CONSTRAINT "ShopTag_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopTagEvent" ADD CONSTRAINT "ShopTagEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
