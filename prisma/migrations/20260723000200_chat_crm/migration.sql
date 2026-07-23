-- feature 00018 CRM/tag ต่อผู้ติดต่อ + alias ต่อแชท (additive, ปลอดภัย)
-- hand-written (DB dev=prod แชร์ — ห้าม migrate dev)

ALTER TABLE "ExternalContact" ADD COLUMN "note" TEXT;
ALTER TABLE "ExternalContact" ADD COLUMN "address" TEXT;
ALTER TABLE "ExternalContact" ADD COLUMN "salesStatus" TEXT NOT NULL DEFAULT 'UNSPECIFIED';
ALTER TABLE "ExternalContact" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ExternalContact" ADD COLUMN "phones" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Conversation" ADD COLUMN "alias" TEXT;
