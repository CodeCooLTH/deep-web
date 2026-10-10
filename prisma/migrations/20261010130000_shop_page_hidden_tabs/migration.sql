-- CR 00053 (2026-10-10) — ร้านเลือกซ่อนแท็บบนหน้าร้านสาธารณะเองได้
-- additive ล้วน ไม่มี backfill · default '{}' ⇒ ทุกร้านเห็นแท็บเหมือนเดิม
ALTER TABLE "ShopPageLayout" ADD COLUMN "hiddenTabs" TEXT[] NOT NULL DEFAULT '{}';  -- รูปเดียวกับ "tabOrder" (20260807160000)
