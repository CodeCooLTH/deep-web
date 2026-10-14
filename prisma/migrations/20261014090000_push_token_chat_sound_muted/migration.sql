-- 00018 ส่วนขยาย 2026-10-14: ปุ่มปิดเสียงหน้าแชทปิดเสียงแจ้งเตือนเด้งของเครื่องนั้นด้วย
-- additive · ค่าเริ่ม false = ทุกเครื่องมีเสียงเหมือนเดิม (ไม่ต้อง backfill)
ALTER TABLE "PushToken" ADD COLUMN IF NOT EXISTS "chatSoundMuted" BOOLEAN NOT NULL DEFAULT false;
