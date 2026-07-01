-- Feature 00002 (Seller Auction) — Migration 3: auction_realtime_broadcast
-- SSOT: docs/20 - Features/00002 - Seller Auction/DATABASE.md §9 + SRS.md §2.4 (Broadcast-from-DB, OQ-1 sign-off 2026-07-01)
-- ไม่แก้ schema.prisma (Prisma ไม่ track trigger/function) — raw SQL เท่านั้น, apply ผ่าน `prisma migrate deploy` เหมือนไฟล์อื่น
--
-- เหตุผล: postgres_changes ของ Supabase Realtime broadcast แถวเต็มทั้งแถว และโปรเจกต์ไม่มี RLS
-- → reservePrice/expectedPrice จะหลุดถึง buyer ทุกคนที่ subscribe (ขัด FR-AUC-13-AC-04)
-- แก้ด้วย Broadcast from Database: trigger เลือกคอลัมน์เอง ไม่ผ่าน publication
--
-- 🛑 กรงเล็บ (grep-gate): payload ห้ามมี reservePrice / expectedPrice / cancelledAt
-- (ยกเว้น "reservePrice IS NOT NULL" ที่ใช้คำนวณ hasReserve boolean เท่านั้น ไม่ส่งค่าตัวเลขจริง)
--
-- fail-safe: EXCEPTION WHEN OTHERS THEN RETURN NEW — กัน Realtime ล่มแล้ว rollback UPDATE หลัก (FR-AUC-10-AC-03)

CREATE OR REPLACE FUNCTION public.auction_realtime_broadcast() RETURNS trigger AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object(
      'id', NEW.id,
      'currentPrice', NEW."currentPrice",
      'bidCount', NEW."bidCount",
      'endTimeMs', extract(epoch from NEW."endTime") * 1000,
      'status', NEW.status,
      'antiSnipeCount', NEW."antiSnipeCount",
      'hasReserve', (NEW."reservePrice" IS NOT NULL)
      -- ห้ามใส่ reservePrice / expectedPrice / cancelledAt ตรงนี้ (leak — FR-AUC-13-AC-04)
    ),
    'update', 'auction:' || NEW.id, false
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;  -- fail-safe: Realtime ล่มต้องไม่ rollback UPDATE หลัก (FR-AUC-10-AC-03)
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auction_realtime_broadcast_trigger
  AFTER UPDATE ON "Auction" FOR EACH ROW EXECUTE FUNCTION public.auction_realtime_broadcast();

-- ROLLBACK NOTE:
-- DROP TRIGGER auction_realtime_broadcast_trigger ON "Auction";
-- DROP FUNCTION public.auction_realtime_broadcast();
