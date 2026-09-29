-- feature 00066 — ติดตามลูกค้า (DATABASE.md §3.1/§4.1). ตารางใหม่ว่าง ไม่กระทบผู้อ่าน/ผู้เขียนเดิม
-- 🛑 CHECK ทั้ง 8 + partial index #3–#6 = unmanaged (Prisma ไม่เห็น) ห้าม `prisma db pull` / `migrate dev`
-- รายชื่อค่าใน CHECK เป็นสแนปช็อตวันนี้ — เพิ่มค่าทีหลังต้องใช้ท่า additive (docs/conventions/migration-check-constraint-additive.md)

CREATE TABLE "CustomerFollowUp" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FOLLOW_UP',
    "title" TEXT NOT NULL,
    "note" TEXT,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "assigneeUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "outcome" TEXT,
    "doneAt" TIMESTAMPTZ(3),
    "doneByUserId" TEXT,
    "snoozeCount" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "remindedFor" TIMESTAMPTZ(3),
    "remindedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerFollowUp_pkey" PRIMARY KEY ("id")
);

-- managed indexes (#1, #2)
CREATE INDEX "CustomerFollowUp_shopId_dueAt_idx" ON "CustomerFollowUp"("shopId", "dueAt");
CREATE INDEX "CustomerFollowUp_conversationId_status_dueAt_idx" ON "CustomerFollowUp"("conversationId", "status", "dueAt");

-- FK
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_doneByUserId_fkey" FOREIGN KEY ("doneByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECK (unmanaged) — ตารางว่าง ไม่ต้อง NOT VALID
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_type_check" CHECK ("type" IN ('FOLLOW_UP','MEET_CUSTOMER','OTHER'));
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_status_check" CHECK ("status" IN ('OPEN','DONE'));
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_outcome_check" CHECK ("outcome" IS NULL OR "outcome" IN ('REACHED','NO_ANSWER','CALL_LATER','NOT_INTERESTED'));
-- reopen ต้องล้าง doneAt/doneBy/outcome; DONE ต้องมี doneAt
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_done_fields_check" CHECK (
  ("status" = 'OPEN' AND "doneAt" IS NULL AND "doneByUserId" IS NULL AND "outcome" IS NULL)
  OR ("status" = 'DONE' AND "doneAt" IS NOT NULL)
);
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_title_len_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 200);
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_note_len_check" CHECK ("note" IS NULL OR char_length("note") <= 1000);
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_snooze_nonneg_check" CHECK ("snoozeCount" >= 0);
-- allDay ⇒ dueAt = เที่ยงคืนไทยพอดี (SRS TFR-002)
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_allday_midnight_check" CHECK (NOT "allDay" OR (("dueAt" AT TIME ZONE 'Asia/Bangkok')::time = TIME '00:00:00'));

-- partial indexes (unmanaged, #3–#6)
CREATE INDEX "CustomerFollowUp_open_shopId_dueAt_idx" ON "CustomerFollowUp"("shopId", "dueAt") WHERE "status" = 'OPEN';
CREATE INDEX "CustomerFollowUp_open_assignee_dueAt_idx" ON "CustomerFollowUp"("assigneeUserId", "dueAt") WHERE "status" = 'OPEN';
CREATE INDEX "CustomerFollowUp_open_dueAt_idx" ON "CustomerFollowUp"("dueAt") WHERE "status" = 'OPEN';
CREATE INDEX "CustomerFollowUp_done_shopId_doneAt_idx" ON "CustomerFollowUp"("shopId", "doneAt") WHERE "status" = 'DONE';
