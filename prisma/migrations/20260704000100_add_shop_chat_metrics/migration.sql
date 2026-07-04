-- feature 00011 ext #2: Response-rate / Response-time Trust Metric
-- additive nullable columns on "Shop" — denormalized ผลคำนวณจาก cron รายวัน
-- (`/api/cron/chat-response-metrics`, S-24) อ่านจาก Conversation/ChatMessage
-- ไม่กระทบ row เดิม (ทุก column nullable, ไม่มี default ที่ backfill)

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN "chatResponseRate" DOUBLE PRECISION;
ALTER TABLE "Shop" ADD COLUMN "chatResponseSampleSize" INTEGER;
ALTER TABLE "Shop" ADD COLUMN "chatMedianResponseSec" INTEGER;
ALTER TABLE "Shop" ADD COLUMN "chatMetricsUpdatedAt" TIMESTAMP(3);
