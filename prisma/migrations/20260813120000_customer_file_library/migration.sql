-- feature 00048 — Customer File Library (คลังไฟล์ต่อลูกค้า)
--
-- ตารางใหม่ล้วน: ไม่ ALTER ตารางเดิม ไม่ backfill ไม่แตะไฟล์ใน storage
-- แถวเกิดจาก "ผู้ขายกดเก็บเองทีละใบ" เท่านั้น (มติ D-1) ไม่มีตัวเขียนอัตโนมัติ

-- CreateTable
CREATE TABLE "CustomerFile" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "externalContactId" TEXT,
    "conversationId" TEXT,
    "fileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "note" TEXT,
    "sourceMessageId" TEXT,
    "senderRole" TEXT NOT NULL,
    "senderName" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "savedByUserId" TEXT,
    "savedByName" TEXT,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- กันเก็บซ้ำที่ชั้น DB (BR-CFL-03). NULL ใน Postgres ไม่ชนกันเอง ⇒ แถวที่เจ้าของเป็น conversation
-- จะเป็น (NULL, fileId) ซึ่งไม่มีวันชน unique ตัวแรก และกลับกัน ⇒ ได้ partial-unique ต่อเจ้าของ
CREATE UNIQUE INDEX "CustomerFile_externalContactId_fileId_key" ON "CustomerFile"("externalContactId", "fileId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerFile_conversationId_fileId_key" ON "CustomerFile"("conversationId", "fileId");

-- CreateIndex
-- keyset pagination: ORDER BY "sentAt" DESC, "id" DESC
CREATE INDEX "CustomerFile_externalContactId_sentAt_idx" ON "CustomerFile"("externalContactId", "sentAt" DESC);

-- CreateIndex
CREATE INDEX "CustomerFile_conversationId_sentAt_idx" ON "CustomerFile"("conversationId", "sentAt" DESC);

-- CreateIndex
CREATE INDEX "CustomerFile_shopId_idx" ON "CustomerFile"("shopId");

-- AddForeignKey
ALTER TABLE "CustomerFile" ADD CONSTRAINT "CustomerFile_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFile" ADD CONSTRAINT "CustomerFile_externalContactId_fkey" FOREIGN KEY ("externalContactId") REFERENCES "ExternalContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Cascade: เจ้าของคลังถูกลบ → แถวคลังหายตาม (BR-CFL-17) แต่ **ไฟล์ใน storage ไม่ถูกลบ**
-- เพราะไฟล์เดียวกันยังถูกอ้างจาก ChatMessage อยู่
ALTER TABLE "CustomerFile" ADD CONSTRAINT "CustomerFile_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── CHECK constraints (unmanaged SQL — Prisma ประกาศเองไม่ได้) ────────────────
-- 🛑 ตารางนี้พึ่ง CHECK เป็นด่านความถูกต้อง และ `prisma db pull` มองไม่เห็น unmanaged SQL
--    แล้วจะพยายามลบทิ้ง → ห้ามรัน (Hard Rule 14 ห้ามอยู่แล้ว ย้ำไว้ตรงนี้)

-- เจ้าของคลังต้องมี "อย่างใดอย่างหนึ่ง" เท่านั้น ไม่มีทั้งคู่ไม่ได้ มีพร้อมกันก็ไม่ได้
ALTER TABLE "CustomerFile"
  ADD CONSTRAINT "CustomerFile_owner_exactly_one_check"
  CHECK ((("externalContactId" IS NOT NULL)::int + ("conversationId" IS NOT NULL)::int) = 1);

-- 🛑 CHECK แบบรายชื่อค่า: วันที่เพิ่มชนิดที่ 4 ต้องเขียน migration แบบ **additive**
--    (อ่านนิยามเดิมมาต่อท้าย ห้าม hardcode รายชื่อใหม่ทั้งชุด) — บทเรียน 00033 ที่สอง branch
--    แก้ CHECK พร้อมกันแล้วลบค่าของกันเองเงียบ ๆ โดย migrate สำเร็จทุกไฟล์
--    ดู docs/conventions/migration-check-constraint-additive.md
ALTER TABLE "CustomerFile"
  ADD CONSTRAINT "CustomerFile_kind_check"
  CHECK ("kind" IN ('IMAGE', 'VIDEO', 'FILE'));
