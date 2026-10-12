-- feature 00073 เฟส B — ตั้งค่ารายงานการเงินของร้านบริการ
-- additive อย่างเดียว: คอลัมน์ nullable · ไม่มี backfill (NULL = ค่าตั้งต้น = เหมือนก่อนมีฟีเจอร์)
-- ร้านทุกแถวได้ NULL ⇒ ไม่มีร้านไหนเห็นอะไรเปลี่ยนจนกว่าเจ้าของร้านบริการจะเข้าไปตั้งเอง
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "reportSettings" JSONB;
