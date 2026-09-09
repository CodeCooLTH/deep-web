-- 00018 ส่วนขยาย 2026-09-09 — ตัวเลือกการเรียงลำดับกล่องแชท (รายคน × ร้าน)
-- ดู docs/20 - Features/00018 - Facebook Chat Integration/EXTENSIONS-2026-09-09-inbox-sort-mode.md
--
-- additive ล้วน: ตารางใหม่ 1 ตาราง + index ใหม่ 1 ตัวบน Conversation
-- ไม่แตะคอลัมน์/CHECK ของตารางที่มีอยู่ (docs/conventions/migration-check-constraint-additive.md)

CREATE TABLE "SellerChatPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  -- D-SORT-2: ไม่มีแถว = LAST_MESSAGE เหมือนกัน ⇒ ไม่ต้อง backfill ผู้ใช้เดิม (AC-SORT-04)
  "inboxSort" TEXT NOT NULL DEFAULT 'LAST_MESSAGE',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SellerChatPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerChatPreference_userId_shopId_key"
  ON "SellerChatPreference"("userId", "shopId");

ALTER TABLE "SellerChatPreference"
  ADD CONSTRAINT "SellerChatPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SellerChatPreference"
  ADD CONSTRAINT "SellerChatPreference_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- fail-closed ที่ระดับฐาน: คอลัมน์เป็น TEXT (Prisma ไม่มี enum ในสคีมานี้) ⇒ ถ้าไม่กั้นตรงนี้
-- ค่าที่พิมพ์ผิดจะลงฐานได้เงียบ ๆ แล้วโค้ดฝั่งอ่านต้องเดาว่าจะทำยังไงต่อ
-- (บทเรียน 00028: ตรรกะ binary ไม่พังเสียงดังเมื่อค่าที่ 3 มา)
ALTER TABLE "SellerChatPreference"
  ADD CONSTRAINT "SellerChatPreference_inboxSort_check"
  CHECK ("inboxSort" IN ('LAST_MESSAGE', 'LAST_CUSTOMER_MESSAGE'));

-- โหมด LAST_CUSTOMER_MESSAGE เรียง [isPinned desc, lastInboundAt desc nulls last, lastMessageAt desc]
-- ภายใต้ filter เดิม (shopId + isHidden) — คู่ขนานกับ Conversation_shopId_isHidden_isPinned_lastMessageAt
-- ที่ครอบโหมดเดิมอยู่แล้ว
CREATE INDEX "Conversation_shopId_isHidden_isPinned_lastInboundAt_idx"
  ON "Conversation"("shopId", "isHidden", "isPinned", "lastInboundAt");
