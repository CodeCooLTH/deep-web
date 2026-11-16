-- 00096 P2: ต้นทุนผันแปรต่อออเดอร์ของร้าน (additive · nullable · ไม่แตะข้อมูลเดิม)
ALTER TABLE "Shop" ADD COLUMN "variableCosts" JSONB;
