-- feature 00062 — บัญชีรับเงินของร้าน (D-5): ฟิลด์เดี่ยวบน Shop (ไม่ใช่ตารางใหม่ — MVP ไม่รองรับ
-- หลายบัญชี) + payoutSnapshot บน Order สำหรับ freeze ค่า ณ เวลาสร้างออเดอร์ (BR-BANK-01,
-- mirror OrderShipment.senderSnapshot/receiverSnapshot)
--
-- additive ล้วน, nullable ทั้งหมด, ไม่มี default, ไม่มี CHECK ใหม่ (รูปแบบเลขบัญชี/พร้อมเพย์
-- validate ที่ Valibot ชั้นเดียว) ร้านทุกร้านที่มีอยู่ก่อนได้ค่า NULL ทั้ง 5 คอลัมน์ ซึ่งคือความจริง
-- (ไม่เคยมีที่เก็บบัญชีรับเงินมาก่อนเลยทั้งระบบ)

ALTER TABLE "Shop" ADD COLUMN "payoutBankCode" TEXT;
ALTER TABLE "Shop" ADD COLUMN "payoutAccountNo" TEXT;
ALTER TABLE "Shop" ADD COLUMN "payoutAccountName" TEXT;
ALTER TABLE "Shop" ADD COLUMN "payoutPromptPayId" TEXT;
ALTER TABLE "Shop" ADD COLUMN "payoutUpdatedAt" TIMESTAMP(3);

ALTER TABLE "Order" ADD COLUMN "payoutSnapshot" JSONB;
