-- feature 00060 — แผนการตรวจสอบร้านค้า (Shop Inspection Plan)
--
-- additive ล้วน: enum ใหม่ 5 · ตารางใหม่ 7 · คอลัมน์ใหม่ 1 บน "User" (มี DEFAULT จึงไม่ล็อก
-- ตารางนานและแถวเดิมได้ค่า false ทันที) — ไม่แก้ ไม่ลบ ไม่เปลี่ยนชนิดคอลัมน์เดิมแม้แต่ตัวเดียว
--
-- 🛑 CHECK ทุกตัวในไฟล์นี้เป็นของตารางใหม่ทั้งหมด ไม่มีการแก้ CHECK เดิมของใคร จึงไม่เข้าเงื่อนไข
--    "ต้องอ่านของเดิมมาต่อท้าย" ของ docs/conventions/migration-check-constraint-additive.md
--    (บทเรียน 00033: migration 2 สายแก้ CHECK รายชื่อของตารางเดียวกัน แล้วตัวที่รันทีหลัง
--     ลบค่าของอีกฝั่งทิ้งเงียบ ๆ โดย migrate สำเร็จทุกไฟล์ ไม่มี error)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Enums
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE "InspectionPlanStatus" AS ENUM ('ACTIVE', 'LAPSED');
CREATE TYPE "InspectionMethod" AS ENUM ('AUTO', 'DOCUMENT', 'VIDEO_CALL', 'ONSITE');
CREATE TYPE "InspectionOutcome" AS ENUM ('PASS', 'FAIL', 'NOT_APPLICABLE');
CREATE TYPE "InspectionEvidenceVisibility" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "InspectionEvidenceKind" AS ENUM ('PHOTO', 'VIDEO_STILL', 'DOCUMENT', 'GEO');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) บทบาทผู้ตรวจบน User — แยกจาก isAdmin โดยเจตนา (AC-INS-24-1)
--    ผู้ตรวจท้องถิ่นเป็นบุคคลภายนอกที่จ้างรายครั้ง ให้สิทธิ์แอดมินเต็มไม่ได้
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN "isInspector" BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) ตาราง
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "InspectionPlan" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "status" "InspectionPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "lapsedReason" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "graceUntil" TIMESTAMPTZ(3),
    "activatedAt" TIMESTAMPTZ(3) NOT NULL,
    "currentPeriodStart" TIMESTAMPTZ(3) NOT NULL,
    "nextRenewalAt" TIMESTAMPTZ(3) NOT NULL,
    "lastRenewalAt" TIMESTAMPTZ(3),
    "lapsedAt" TIMESTAMPTZ(3),
    "termsAcceptedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InspectionPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InspectionRound" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "roomId" TEXT,
    "step" INTEGER NOT NULL,
    "method" "InspectionMethod" NOT NULL,
    "inspectorUserId" TEXT,
    "inspectorDisplayName" TEXT NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL,
    "dueAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "suspectedFraudNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionRound_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InspectionResult" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "roomId" TEXT,
    "checkKey" TEXT NOT NULL,
    "roundId" TEXT,
    "outcome" "InspectionOutcome" NOT NULL,
    "checkedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastConfirmedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "invalidatedAt" TIMESTAMPTZ(3),
    "invalidatedReason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InspectionResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InspectionEvidence" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "resultId" TEXT,
    "visibility" "InspectionEvidenceVisibility" NOT NULL DEFAULT 'PRIVATE',
    "kind" "InspectionEvidenceKind" NOT NULL,
    "fileId" TEXT,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "caption" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InspectionIntakeQuota" (
    "id" TEXT NOT NULL,
    "periodYearMonth" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InspectionIntakeQuota_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InspectionTermsAcceptance" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL,
    "step" INTEGER NOT NULL,
    "priceSnapshotBaht" INTEGER NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionTermsAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InspectorRoleChange" (
    "id" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "isInspector" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectorRoleChange_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Index
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "InspectionPlan_shopId_key" ON "InspectionPlan"("shopId");
CREATE INDEX "InspectionPlan_status_nextRenewalAt_idx" ON "InspectionPlan"("status", "nextRenewalAt");

CREATE INDEX "InspectionRound_shopId_completedAt_idx" ON "InspectionRound"("shopId", "completedAt");
CREATE INDEX "InspectionRound_roomId_idx" ON "InspectionRound"("roomId");
CREATE INDEX "InspectionRound_inspectorUserId_completedAt_idx" ON "InspectionRound"("inspectorUserId", "completedAt");
CREATE INDEX "InspectionRound_completedAt_dueAt_idx" ON "InspectionRound"("completedAt", "dueAt");
CREATE INDEX "InspectionRound_shopId_roomId_step_completedAt_idx" ON "InspectionRound"("shopId", "roomId", "step", "completedAt");

-- 🛑 index ต้องเรียงตรงกับ ORDER BY จริง (checkedAt DESC, id DESC) ไม่งั้น Postgres สแกนแล้วเรียงเอง
--    tie-break ด้วย id ห้ามตัดออก — cron ขั้นที่ 1 เขียนหลายข้อในทรานแซกชันเดียว checkedAt
--    ซ้ำวินาทีจึงเป็นเรื่องปกติ ถ้า TS กับ SQL เลือกคนละแถว ป้ายกับไทม์ไลน์จะไม่ตรงกันแบบสุ่ม
CREATE INDEX "InspectionResult_shopId_checkKey_checkedAt_id_idx" ON "InspectionResult"("shopId", "checkKey", "checkedAt" DESC, "id" DESC);
CREATE INDEX "InspectionResult_roomId_checkKey_checkedAt_id_idx" ON "InspectionResult"("roomId", "checkKey", "checkedAt" DESC, "id" DESC);
CREATE INDEX "InspectionResult_roundId_idx" ON "InspectionResult"("roundId");

CREATE INDEX "InspectionEvidence_roundId_visibility_idx" ON "InspectionEvidence"("roundId", "visibility");
CREATE INDEX "InspectionEvidence_resultId_idx" ON "InspectionEvidence"("resultId");

CREATE UNIQUE INDEX "InspectionIntakeQuota_periodYearMonth_step_key" ON "InspectionIntakeQuota"("periodYearMonth", "step");

CREATE INDEX "InspectionTermsAcceptance_shopId_acceptedAt_idx" ON "InspectionTermsAcceptance"("shopId", "acceptedAt");

CREATE INDEX "InspectorRoleChange_targetUserId_createdAt_idx" ON "InspectorRoleChange"("targetUserId", "createdAt");

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Foreign key
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "InspectionPlan" ADD CONSTRAINT "InspectionPlan_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InspectionRound" ADD CONSTRAINT "InspectionRound_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- 🛑 Room เป็น RESTRICT ไม่ใช่ CASCADE โดยเจตนา: ห้ามลบที่พักที่เคยถูกตรวจ ไม่งั้นประวัติ
--    รอบตรวจหายไปพร้อมกัน ซึ่งละเมิด AC-INS-27-1 เงียบ ๆ (ที่พักที่เลิกใช้ให้ปิดด้วย
--    Room.isActive=false ซึ่งมีอยู่แล้ว ไม่ใช่ลบทิ้ง)
ALTER TABLE "InspectionRound" ADD CONSTRAINT "InspectionRound_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionRound" ADD CONSTRAINT "InspectionRound_inspectorUserId_fkey"
    FOREIGN KEY ("inspectorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_roundId_fkey"
    FOREIGN KEY ("roundId") REFERENCES "InspectionRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InspectionEvidence" ADD CONSTRAINT "InspectionEvidence_roundId_fkey"
    FOREIGN KEY ("roundId") REFERENCES "InspectionRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InspectionEvidence" ADD CONSTRAINT "InspectionEvidence_resultId_fkey"
    FOREIGN KEY ("resultId") REFERENCES "InspectionResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InspectionTermsAcceptance" ADD CONSTRAINT "InspectionTermsAcceptance_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 🛑 RESTRICT ทั้งคู่ (ต่างจาก convention Cascade ทั่วไปโดยเจตนา) — audit ที่หายไปพร้อมกับ
--    การลบ user คือ audit ที่ใช้ไม่ได้ในวันที่ต้องใช้จริง
ALTER TABLE "InspectorRoleChange" ADD CONSTRAINT "InspectorRoleChange_targetUserId_fkey"
    FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectorRoleChange" ADD CONSTRAINT "InspectorRoleChange_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) CHECK constraint (unmanaged SQL — Prisma introspection มองไม่เห็น
--    ดูข้อห้ามเรื่อง introspect ทับ schema ใน CLAUDE.md Hard Rule 14)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "InspectionPlan" ADD CONSTRAINT "InspectionPlan_step_check"
    CHECK ("step" BETWEEN 1 AND 4);
ALTER TABLE "InspectionRound" ADD CONSTRAINT "InspectionRound_step_check"
    CHECK ("step" BETWEEN 1 AND 4);
ALTER TABLE "InspectionTermsAcceptance" ADD CONSTRAINT "InspectionTermsAcceptance_step_check"
    CHECK ("step" BETWEEN 1 AND 4);
ALTER TABLE "InspectionIntakeQuota" ADD CONSTRAINT "InspectionIntakeQuota_capacity_check"
    CHECK ("capacity" >= 0 AND "usedCount" >= 0 AND "usedCount" <= "capacity");

-- หลักฐานที่ไม่มีทั้งไฟล์และพิกัดคือแถวเปล่าที่ไม่ควรมีอยู่ (รองรับ kind='GEO' ที่ไม่มีไฟล์)
ALTER TABLE "InspectionEvidence" ADD CONSTRAINT "InspectionEvidence_payload_check"
    CHECK ("fileId" IS NOT NULL OR ("lat" IS NOT NULL AND "lng" IS NOT NULL));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Partial index (unmanaged SQL)
--    ความเร่งด่วนของข้อสงสัยฉ้อโกง **ไม่ผูกกับ dueAt** (ซึ่งวัดว่าข้อตรวจใกล้หมดอายุ)
--    ถ้าเรียงแผงแอดมินด้วย dueAt อย่างเดียว รอบที่ผู้ตรวจเขียนว่าเจอเรื่องผิดปกติจะจมอยู่
--    ล่างสุดเพราะกำหนดเสร็จยังอีกไกล — partial เพราะเงื่อนไขนี้เกิดน้อยมากเทียบกับรอบทั้งหมด
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX "InspectionRound_unresolved_fraud_note_idx"
    ON "InspectionRound" ("createdAt")
    WHERE "suspectedFraudNote" IS NOT NULL;
