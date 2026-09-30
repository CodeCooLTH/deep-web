-- M3 chat image size reserve: ขนาดรูป (px) ต่อไฟล์ — additive, CREATE TABLE เท่านั้น
-- Rollback: DROP TABLE "MediaImageSize"; (ไม่มีตารางอื่นอ้างถึง)
CREATE TABLE "MediaImageSize" (
    "fileId" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaImageSize_pkey" PRIMARY KEY ("fileId"),
    CONSTRAINT "MediaImageSize_dims_check" CHECK ("width" > 0 AND "height" > 0)
);
