-- feature 00086 P3 (S-8 · S-10) — ตารางใหม่ ServiceJobRecord: รูป + บันทึก "ก่อนทำ" / "หลังทำ" ของงานบริการ
--   1 แถวต่อ (ใบ, ขั้น) — BEFORE เขียนตอน "เริ่มงาน" · AFTER เขียนตอน "ทำเสร็จแล้ว" (ทรานแซกชันเดียวกับเวลาของขั้นนั้น)
--
-- ทำไมเป็นตารางแยก ไม่ใส่ใน OrderEvent.meta: บันทึกเป็นข้อความอิสระที่ช่างพิมพ์ (อาจมีข้อมูลลูกค้า) — กติกา PII
--   ของ order-event.ts ห้ามข้อความแบบนี้ใน meta (ไทม์ไลน์ไหลลง flight payload ของทุกคนในร้าน · SDS TD-006)
-- ทำไม unique (orderId, phase): กดเริ่ม/ทำเสร็จซ้ำหรือสองคนกดพร้อมกัน ต้องได้บันทึกครั้งเดียว (S-8)
-- fileIds = storage key (ไม่ใช่ URL) ≤10 รูป · note 1..1000 ตัว หรือ NULL (ห้ามสตริงว่าง — "ไม่บันทึก" = NULL ค่าเดียว)
-- shopId denormalize เพื่อ scope query แจ้งเตือน/รูปย่อ — service ต้องเขียนให้ตรง Order.shopId (ไม่มี composite FK)
-- ลบใบ/ร้าน = ลบบันทึกตาม (Cascade · ไฟล์ใน storage ไม่ถูกลบ — DATABASE §6) · ลบบัญชีคนกด = SET NULL (บันทึกยังอยู่)
--
-- ตารางใหม่ ไม่มีแถวเดิม ⇒ ไม่ต้อง NOT VALID · lock_timeout เพราะ FK ใหม่ขอ lock บน "Order"/"Shop"/"User" ชั่วครู่
-- additive ล้วน · รันซ้ำได้ (IF NOT EXISTS)
-- rollback (ก่อนมีข้อมูลจริงเท่านั้น): DROP TABLE "ServiceJobRecord"
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "ServiceJobRecord" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "note" TEXT,
  "fileIds" TEXT[] NOT NULL DEFAULT '{}'::text[],
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceJobRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceJobRecord_phase_check" CHECK ("phase" IN ('BEFORE','AFTER')),
  CONSTRAINT "ServiceJobRecord_fileIds_max" CHECK (cardinality("fileIds") <= 10),
  CONSTRAINT "ServiceJobRecord_note_len" CHECK ("note" IS NULL OR char_length("note") BETWEEN 1 AND 1000),
  CONSTRAINT "ServiceJobRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceJobRecord_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceJobRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceJobRecord_orderId_phase_key" ON "ServiceJobRecord" ("orderId", "phase");
-- FK SET NULL ตอนลบผู้ใช้ต้องหาแถวของคนนั้นโดยไม่สแกนทั้งตาราง
CREATE INDEX IF NOT EXISTS "ServiceJobRecord_createdByUserId_idx" ON "ServiceJobRecord" ("createdByUserId");
