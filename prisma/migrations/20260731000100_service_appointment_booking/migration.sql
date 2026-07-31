-- feature 00024: Service Appointment Booking
--
-- 🛑 migration นี้เขียนด้วยมือ ไม่ได้ generate จาก `prisma migrate dev`
--    เหตุผล: ฐานข้อมูล dev = prod (แชร์กัน) — `migrate dev` จะ reset ลบข้อมูลทิ้ง
--    และ introspection มองไม่เห็น EXCLUDE/CHECK constraint แล้วจะ DROP ทิ้ง
--    ดู memory project_shared_db_drift_no_migrate_dev
--
-- ทุกอย่างเป็น additive ล้วน — ไม่แก้/ไม่ย้ายข้อมูลเดิมแม้แถวเดียว
-- รันด้วย: npx dotenv -e .env.local -- npx prisma migrate deploy

-- btree_gist ติดตั้งอยู่แล้วจาก migration ของ feature 00017 (20260722000100)
-- คงบรรทัดนี้ไว้เพื่อให้ migration รันได้เองในสภาพแวดล้อมใหม่ (no-op บน DB ปัจจุบัน)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- 1) ServiceResource — ทรัพยากรที่จองเวลาได้
-- ============================================================
CREATE TABLE "ServiceResource" (
  "id"              TEXT NOT NULL,
  "shopId"          TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "description"     TEXT,
  "durationMinutes" INTEGER,
  "capacity"        INTEGER NOT NULL DEFAULT 1,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceResource_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ServiceResource"
  ADD CONSTRAINT "ServiceResource_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BR-RSV-06: ความจุต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป
ALTER TABLE "ServiceResource"
  ADD CONSTRAINT "ServiceResource_capacity_positive" CHECK ("capacity" >= 1);

-- BR-RSV-09: ระยะเวลามาตรฐานถ้ามีต้องมากกว่า 0
ALTER TABLE "ServiceResource"
  ADD CONSTRAINT "ServiceResource_duration_positive"
  CHECK ("durationMinutes" IS NULL OR "durationMinutes" > 0);

CREATE INDEX "ServiceResource_shopId_isActive_idx" ON "ServiceResource"("shopId", "isActive");

-- ============================================================
-- 2) AppointmentReschedule — ประวัติการเลื่อนนัด (สะสม BR-RSV-30)
-- ============================================================
CREATE TABLE "AppointmentReschedule" (
  "id"             TEXT NOT NULL,
  "orderId"        TEXT NOT NULL,
  "fromResourceId" TEXT,
  "fromStart"      TIMESTAMPTZ(3) NOT NULL,
  "fromEnd"        TIMESTAMPTZ(3) NOT NULL,
  "toResourceId"   TEXT,
  "toStart"        TIMESTAMPTZ(3) NOT NULL,
  "toEnd"          TIMESTAMPTZ(3) NOT NULL,
  "actorRole"      TEXT NOT NULL,
  "actorUserId"    TEXT,
  "reason"         TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentReschedule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AppointmentReschedule"
  ADD CONSTRAINT "AppointmentReschedule_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppointmentReschedule"
  ADD CONSTRAINT "AppointmentReschedule_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AppointmentReschedule"
  ADD CONSTRAINT "AppointmentReschedule_actor_role"
  CHECK ("actorRole" IN ('SHOP', 'BUYER'));

CREATE INDEX "AppointmentReschedule_orderId_createdAt_idx"
  ON "AppointmentReschedule"("orderId", "createdAt");

-- ============================================================
-- 3) Order — ฟิลด์นัด (nullable ทั้งหมด, ไม่ต้อง backfill)
-- ============================================================
ALTER TABLE "Order" ADD COLUMN "serviceResourceId"     TEXT;
ALTER TABLE "Order" ADD COLUMN "serviceSeat"           INTEGER;
ALTER TABLE "Order" ADD COLUMN "serviceStart"          TIMESTAMPTZ(3);
ALTER TABLE "Order" ADD COLUMN "serviceEnd"            TIMESTAMPTZ(3);
ALTER TABLE "Order" ADD COLUMN "appointmentStatus"     TEXT;
ALTER TABLE "Order" ADD COLUMN "buyerConfirmedAt"      TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "rescheduleRequestNote" TEXT;

-- BR-RSV-08: ห้ามลบทรัพยากรที่ยังมีนัดผูกอยู่
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_serviceResourceId_fkey"
  FOREIGN KEY ("serviceResourceId") REFERENCES "ServiceResource"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- BR-RSV-13: เวลาสิ้นสุดต้องมาหลังเวลาเริ่ม
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_service_range"
  CHECK ("serviceStart" IS NULL OR "serviceEnd" IS NULL OR "serviceEnd" > "serviceStart");

-- BR-RSV-06: ที่นั่งเริ่มที่ 1
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_service_seat_positive"
  CHECK ("serviceSeat" IS NULL OR "serviceSeat" >= 1);

-- BR-RSV-12: ฟิลด์นัดต้องมีครบชุดหรือว่างทั้งชุด
-- (เปิดช่องให้ INSERT ออเดอร์ก่อนแล้วค่อย UPDATE ใส่ที่นั่ง ตาม SDS D-07 — ระหว่างนั้นว่างทั้งชุด)
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_service_fields_all_or_none" CHECK (
    ("serviceResourceId" IS NULL AND "serviceSeat" IS NULL
     AND "serviceStart" IS NULL AND "serviceEnd" IS NULL)
    OR
    ("serviceResourceId" IS NOT NULL AND "serviceSeat" IS NOT NULL
     AND "serviceStart" IS NOT NULL AND "serviceEnd" IS NOT NULL)
  );

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_appointment_status" CHECK (
    "appointmentStatus" IS NULL OR "appointmentStatus" IN
      ('SCHEDULED','CONFIRMED_BY_BUYER','RESCHEDULE_REQUESTED','COMPLETED','NO_SHOW')
  );

CREATE INDEX "Order_serviceResourceId_start_idx" ON "Order"("serviceResourceId", "serviceStart");
CREATE INDEX "Order_shopId_type_serviceStart_idx" ON "Order"("shopId", "type", "serviceStart");
CREATE INDEX "Order_shopId_appointmentStatus_idx" ON "Order"("shopId", "appointmentStatus");

-- ============================================================
-- 4) 🛑 EXCLUDE constraint — หัวใจของการกันจองเกินความจุ (BR-RSV-16)
-- ============================================================
-- Prisma DSL ประกาศไม่ได้ = unmanaged SQL — ห้าม `prisma db pull` เด็ดขาด
--
-- ต่างจาก Order_room_no_overlap ของ feature 00017 ตรงมิติ "serviceSeat":
--   ทรัพยากรหนึ่งหน่วยจึงรับได้หลายคิวพร้อมกัน ตราบใดที่อยู่คนละที่นั่ง
--   เพดานจำนวนที่นั่งบังคับที่ service layer (วนลอง seat 1..capacity)
--
-- '[)'  = รวมเวลาเริ่ม ไม่รวมเวลาสิ้นสุด → นัดที่ต่อกันพอดีอยู่ร่วมกันได้ (BR-RSV-14)
-- status <> 'CANCELLED' → นัดที่ยกเลิกแล้วคืนที่ว่างทันที (BR-RSV-17)
-- serviceResourceId IS NOT NULL → ออเดอร์สินค้า/การจองบ้านพักไม่ถูกแตะ (BR-RSV-04)
--
-- พิสูจน์บน DB จริงแล้ว 9/9 ดู docs/20 - Features/00024 .../spike-capacity.cjs
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_service_seat_no_overlap"
  EXCLUDE USING gist (
    "serviceResourceId" WITH =,
    "serviceSeat"       WITH =,
    tstzrange("serviceStart", "serviceEnd", '[)') WITH &&
  )
  WHERE ("serviceResourceId" IS NOT NULL AND "status" <> 'CANCELLED');
