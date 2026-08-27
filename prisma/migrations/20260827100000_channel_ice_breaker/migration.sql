-- Ice Breakers ต่อช่องทาง (feature 00018 ส่วนขยาย 2026-08-27)
-- additive ล้วน: ตารางใหม่ + FK + index — ไม่แตะข้อมูลเดิมของใครเลย
CREATE TABLE "ChannelIceBreaker" (
    "id" TEXT NOT NULL,
    "shopChannelId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelIceBreaker_pkey" PRIMARY KEY ("id")
);

-- กันสองแถวชิงลำดับเดียวกันในช่องทางเดียว (ผู้ขายเปิดแก้พร้อมกัน 2 แท็บ)
CREATE UNIQUE INDEX "ChannelIceBreaker_shopChannelId_order_key"
    ON "ChannelIceBreaker"("shopChannelId", "order");
CREATE INDEX "ChannelIceBreaker_shopChannelId_idx"
    ON "ChannelIceBreaker"("shopChannelId");

ALTER TABLE "ChannelIceBreaker" ADD CONSTRAINT "ChannelIceBreaker_shopChannelId_fkey"
    FOREIGN KEY ("shopChannelId") REFERENCES "ShopChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
