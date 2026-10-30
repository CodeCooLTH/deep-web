-- feature 00086 — หน้า "ค่าใช้จ่ายของฉัน" ของพนักงาน (S-15/16)
-- query หลัก: WHERE "shopId" = ? AND "createdByUserId" = ? ORDER BY "expenseDate" — index เดิม (shopId, expenseDate)
--   ต้องกรองผู้บันทึกทีละแถว · index นี้ตอบได้ตรง
-- additive ล้วน · รันซ้ำได้ (IF NOT EXISTS) · rollback: DROP INDEX "Expense_shopId_createdBy_expenseDate_idx"
-- ไม่ใช้ CONCURRENTLY เพราะ migrate deploy รันใน transaction (ตาราง Expense เล็ก — แถวละรายการที่ร้านกรอกมือ ระดับพัน–หมื่นแถว · ล็อกสั้น บล็อกแค่การเขียน)
-- lock_timeout: ถ้ารอ lock เกิน 5 วิ (มีคนถือตารางค้าง) ให้ล้มแล้วค่อย deploy ใหม่ ดีกว่าค้างคิวให้คำขออื่นรอต่อท้าย
SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS "Expense_shopId_createdBy_expenseDate_idx" ON "Expense" ("shopId", "createdByUserId", "expenseDate");
