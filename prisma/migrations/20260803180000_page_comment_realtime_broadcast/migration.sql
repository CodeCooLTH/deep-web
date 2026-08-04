-- feature 00029 — realtime ของแท็บความคิดเห็น (Broadcast from Database)
--
-- pattern เดียวกับ 20260703000400_chat_realtime_broadcast ของแชท: **ไม่ใช้ postgres_changes**
-- เพราะมันกระจายทั้งแถวให้ทุกคนที่ subscribe channel ได้ และโปรเจกต์นี้ไม่มี RLS —
-- `PageComment.message` (ข้อความของลูกค้า) จะหลุดถึงใครก็ตามที่เดา postId/shopId ถูก
-- → trigger ส่งเฉพาะ "สัญญาณ" (id) แล้วให้ client refetch ผ่าน authenticated GET เสมอ
--
-- 🛑 grep-gate: payload ห้ามมี message / fromName / attachmentUrl (signal-only)
--
-- 2 channel:
--   1) `comments:post:{postId}`  — คนที่เปิดโพสต์นั้นอยู่ → refetch คอมเมนต์ของโพสต์
--   2) `comments:shop:{shopId}`  — คนที่เปิดแท็บความคิดเห็นอยู่ → refetch รายการโพสต์ + ตัวนับยังไม่ตอบ
--
-- ทำไม AFTER INSERT **OR UPDATE OF** ไม่ใช่ INSERT อย่างเดียวเหมือนแชท: คอมเมนต์แก้ได้/ลบได้จาก
-- ฝั่ง Facebook (verb=edited/remove → เราเขียนทับแถวเดิม ไม่ได้ INSERT ใหม่) ถ้า broadcast แต่ตอน
-- INSERT หน้าจอจะค้างข้อความเวอร์ชันเก่า. จำกัดคอลัมน์ที่ trigger ตอบสนองด้วย OF (...) เพื่อไม่ให้
-- การ upsert ซ้ำจาก webhook/backfill ที่ไม่ได้เปลี่ยนเนื้อหาจริง ยิง broadcast รัวโดยเปล่าประโยชน์
--
-- fail-safe: EXCEPTION WHEN OTHERS THEN RETURN NEW — Realtime ล่มต้องไม่ rollback การบันทึกคอมเมนต์

CREATE OR REPLACE FUNCTION public.page_comment_realtime_broadcast() RETURNS trigger AS $$
DECLARE
  v_shop_id TEXT;
BEGIN
  -- channel 1: per-post — signal เฉพาะ id ไม่ฝังเนื้อคอมเมนต์ (neutralize-at-broadcast)
  PERFORM realtime.send(
    jsonb_build_object('postId', NEW."postId", 'commentId', NEW.id),
    'update', 'comments:post:' || NEW."postId", false
  );

  -- channel 2: shop-wide — ให้รายการโพสต์/ตัวนับ "ยังไม่ตอบ" อัปเดตแม้ยังไม่ได้เปิดโพสต์นั้น
  SELECT "shopId" INTO v_shop_id FROM "ShopChannel" WHERE id = NEW."shopChannelId";
  IF v_shop_id IS NOT NULL THEN
    PERFORM realtime.send(
      jsonb_build_object('postId', NEW."postId"),
      'new_comment', 'comments:shop:' || v_shop_id, false
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS page_comment_realtime_broadcast_trigger ON "PageComment";

CREATE TRIGGER page_comment_realtime_broadcast_trigger
  AFTER INSERT OR UPDATE OF "message", "isDeleted", "editedAt" ON "PageComment"
  FOR EACH ROW EXECUTE FUNCTION public.page_comment_realtime_broadcast();

-- ROLLBACK NOTE:
-- DROP TRIGGER IF EXISTS page_comment_realtime_broadcast_trigger ON "PageComment";
-- DROP FUNCTION IF EXISTS public.page_comment_realtime_broadcast();
-- ปลอดภัย ไม่มี data loss — ผลกระทบเดียวคือแท็บความคิดเห็นตกกลับไปใช้ poll ตามรอบ (ยังมีเป็น fallback)
