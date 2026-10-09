-- เสียงแจ้งเตือนแชทใหม่ในแอปผู้ขาย (2026-10-09) — additive · default "chat" = พฤติกรรมปัจจุบัน
-- ADD COLUMN พร้อม DEFAULT ค่าคงที่ = fast default ของ Postgres 11+ (ไม่ rewrite ตาราง)
ALTER TABLE "User" ADD COLUMN "chatPushSound" TEXT NOT NULL DEFAULT 'chat';
