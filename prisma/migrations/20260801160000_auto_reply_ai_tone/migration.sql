-- feature 00023 · phase `00023-ai-enhance` — น้ำเสียงของ AI ต่อกลุ่มคำ (Mood & Tone)
-- user ขอ 2026-08-01: "Mood & Tone อยู่ไหน"
--
-- ADDITIVE: คอลัมน์ nullable ไม่มี DEFAULT ที่ต้องเขียนทับแถวเดิม — null = ใช้ค่ากลาง
ALTER TABLE "AutoReplyKeyword" ADD COLUMN "aiTone" TEXT;
