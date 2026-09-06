-- feature 00060 · ปิด OQ-13 (ตัวตรวจจับการประกาศที่พักซ้ำข้ามบัญชี)
--
-- additive ล้วน: ตารางใหม่ตารางเดียว ไม่แตะคอลัมน์/CHECK ของตารางที่มีอยู่
-- (docs/conventions/migration-check-constraint-additive.md)

CREATE TABLE "RoomImageFingerprint" (
  "id" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "sha256" TEXT,
  "bytes" INTEGER,
  "firstListedAt" TIMESTAMPTZ(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMPTZ(3) NOT NULL,
  "computedAt" TIMESTAMPTZ(3),
  CONSTRAINT "RoomImageFingerprint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoomImageFingerprint_fileId_key" ON "RoomImageFingerprint"("fileId");
CREATE INDEX "RoomImageFingerprint_sha256_firstListedAt_idx" ON "RoomImageFingerprint"("sha256", "firstListedAt");
CREATE INDEX "RoomImageFingerprint_roomId_idx" ON "RoomImageFingerprint"("roomId");
CREATE INDEX "RoomImageFingerprint_shopId_idx" ON "RoomImageFingerprint"("shopId");

ALTER TABLE "RoomImageFingerprint"
  ADD CONSTRAINT "RoomImageFingerprint_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
