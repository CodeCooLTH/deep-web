-- Order.createdByUserId — บันทึกว่าใครเป็นคนกดสร้างออเดอร์ (2026-08-04)
--
-- ก่อนหน้านี้ระบบไม่เคยเก็บเลยว่าใครสร้าง หน้า "ประวัติคำสั่งซื้อ" จึงขึ้นคำว่า "ระบบ" ตายตัว
-- ทั้งที่คนกดจริงคือเจ้าของร้านหรือพนักงาน
--
-- nullable + ไม่มี backfill โดยตั้งใจ:
--   - ออเดอร์เก่าไม่มีทางรู้ว่าใครสร้าง เดาแล้วใส่เจ้าของร้านลงไปคือบันทึกข้อมูลเท็จ
--     (ร้านที่มีพนักงานหลายคนยิ่งผิด) หน้าจอจะแสดง "ระบบ" ต่อไปสำหรับแถวที่เป็น NULL
--   - ออเดอร์จากการปิดประมูล (auction.service) ไม่มีคนสร้างจริง ๆ ต้องเป็น NULL ตลอดไป
--
-- ON DELETE SET NULL — ลบบัญชีพนักงานแล้วออเดอร์ต้องอยู่ครบ (เป็นประวัติการขายของร้าน)
-- ไม่ใช่ CASCADE เด็ดขาด

ALTER TABLE "Order" ADD COLUMN "createdByUserId" TEXT;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Order_createdByUserId_idx" ON "Order"("createdByUserId");
