-- 00070 EXT: LineReportSnapshot — snapshot หน้าสรุปรายละเอียดสาธารณะ (additive ล้วน: ตารางใหม่ ไม่แตะตารางเดิม)
-- 🛑 CHECK สองตัวท้ายเป็น unmanaged SQL (Prisma ไม่รู้จัก) — ห้าม db pull / migrate dev ทับ
-- Rollback: ไม่มีโค้ดอื่นอ้างตารางนี้นอกฟีเจอร์ — ถอยโค้ดแล้วทิ้งตารางไว้ได้ปลอดภัย (ลบตารางต้องรอ Controller สั่ง)
CREATE TABLE "LineReportSnapshot" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "kind" "LineReportDeliveryKind" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "windowStart" TEXT NOT NULL,
    "windowEnd" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineReportSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LineReportSnapshot_tokenHash_key" ON "LineReportSnapshot"("tokenHash");
CREATE INDEX "LineReportSnapshot_groupId_createdAt_idx" ON "LineReportSnapshot"("groupId", "createdAt");
CREATE INDEX "LineReportSnapshot_expiresAt_idx" ON "LineReportSnapshot"("expiresAt");
CREATE INDEX "LineReportSnapshot_deliveryId_idx" ON "LineReportSnapshot"("deliveryId");

ALTER TABLE "LineReportSnapshot" ADD CONSTRAINT "LineReportSnapshot_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LineReportGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LineReportSnapshot" ADD CONSTRAINT "LineReportSnapshot_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "LineReportDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LineReportSnapshot"
  ADD CONSTRAINT "LineReportSnapshot_payload_size_chk" CHECK ("payload" IS NULL OR octet_length("payload"::text) <= 524288),
  ADD CONSTRAINT "LineReportSnapshot_expiry_chk" CHECK ("expiresAt" > "createdAt");
