-- feature 00045 — เมนูลัดใน LINE (Rich Menu)
--
-- additive ล้วน: ตารางใหม่ 1 ตาราง ไม่แตะตารางเดิม ไม่มี backfill
-- ร้านที่ยังไม่เคยตั้งเมนู = ไม่มีแถว = สถานะ "ยังไม่ได้สร้าง" ซึ่งถูกต้องอยู่แล้ว
--
-- 🛑 ไม่มีคอลัมน์ "status" โดยตั้งใจ — สถานะที่หน้าจอแสดง derive จากความจริงฝั่ง LINE
--    (ร้านเปลี่ยนเมนูเองใน LINE OA Manager ได้ตลอดโดยที่เราไม่รู้ ธงที่เก็บไว้จะเพี้ยนแน่นอน)
-- 🛑 ไม่มีคอลัมน์เก็บ id เมนูใบเก่าที่รอลบ — เก็บกวาดจาก prefix ของชื่อเมนูแทน ซึ่งเก็บใบที่ค้าง
--    จากรอบที่ล้มกลางทางได้ด้วย (ใบที่สร้างสำเร็จแล้วล้มตอนอัปโหลดรูป จะไม่มีใครจำได้เลย)

CREATE TABLE "LineRichMenu" (
    "id"              TEXT NOT NULL,
    "shopChannelId"   TEXT NOT NULL,
    "lineRichMenuId"  TEXT,
    "templateKey"     TEXT NOT NULL,
    "chatBarText"     TEXT NOT NULL,
    "buttons"         JSONB NOT NULL,
    "imageFileId"     TEXT,
    "consentAt"       TIMESTAMP(3),
    "consentByUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineRichMenu_pkey" PRIMARY KEY ("id")
);

-- 1 เพจ = ไม่เกิน 1 เมนูในระบบเรา — บังคับที่ฐาน ไม่ใช่แค่ในโค้ด
-- (สองแท็บกดสร้างพร้อมกันยังชนกันได้ถ้ากันแค่ในแอป)
CREATE UNIQUE INDEX "LineRichMenu_shopChannelId_key" ON "LineRichMenu"("shopChannelId");

ALTER TABLE "LineRichMenu"
  ADD CONSTRAINT "LineRichMenu_shopChannelId_fkey"
  FOREIGN KEY ("shopChannelId") REFERENCES "ShopChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
