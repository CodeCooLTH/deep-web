-- 00070 EXT: เทมเพลตข้อความรายงาน (additive ล้วน — คอลัมน์ใหม่ ไม่มีแถวเดิมชน CHECK · ไม่มี backfill/index)
-- Rollback: โค้ดเก่าไม่อ่านคอลัมน์ใหม่ (ปลอดภัยที่จะทิ้งไว้) · ล้างค่า = UPDATE "LineReportGroup" SET "template" = NULL
ALTER TABLE "LineReportGroup"
  ADD COLUMN "template" JSONB,
  ADD COLUMN "templateVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "LineReportGroup"
  ADD CONSTRAINT "LineReportGroup_template_size_chk"
    CHECK ("template" IS NULL OR octet_length("template"::text) <= 16384),
  ADD CONSTRAINT "LineReportGroup_template_version_chk"
    CHECK ("templateVersion" >= 0);
