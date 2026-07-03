-- Feature 00011 (Deep Chat) — Migration 2: chat_realtime_broadcast
-- SSOT: docs/20 - Features/00011 - Deep Chat/DATABASE.md §10 + SRS.md §7.1 (Broadcast-from-DB, FLAG-1)
-- ไม่แก้ schema.prisma (Prisma ไม่ track trigger/function) — raw SQL เท่านั้น, apply ผ่าน `prisma migrate deploy` เหมือนไฟล์อื่น
--
-- เหตุผล: postgres_changes ของ Supabase Realtime broadcast แถวเต็มทั้งแถว และโปรเจกต์ไม่มี RLS
-- → ChatMessage.body/imageUrl (เนื้อหาบทสนทนาจริง) จะหลุดถึงใครก็ตามที่รู้ conversationId แล้ว subscribe channel
-- แก้ด้วย Broadcast from Database: trigger เลือกส่งแค่ id (signal-only) ไม่ผ่าน publication — pattern เดียวกับ
-- prisma/migrations/20260701000003_auction_realtime_broadcast/migration.sql
--
-- 2 channel:
--   1) `chat:{conversationId}` — ทุกข้อความ (ทั้ง BUYER และ SHOP ส่ง) event 'update' — ให้ client ที่เปิด thread อยู่ refetch
--   2) `chat:shop:{shopId}` — เฉพาะข้อความที่ senderRole='BUYER' event 'new_message' — ให้ seller listener (mount ที่
--      (dashboard)/layout.tsx) เด้ง pacesToast.chat.* แม้ไม่ได้เปิดหน้า /inbox/[conversationId] อยู่ (FR-CHAT-11-AC-02)
--
-- 🛑 กรงเล็บ (grep-gate): payload ห้ามมี body / imageUrl (signal-only — client ต้อง refetch ผ่าน authenticated GET เสมอ)
--
-- fail-safe: EXCEPTION WHEN OTHERS THEN RETURN NEW — กัน Realtime ล่มแล้ว rollback INSERT หลัก

CREATE OR REPLACE FUNCTION public.chat_message_realtime_broadcast() RETURNS trigger AS $$
DECLARE
  v_shop_id TEXT;
BEGIN
  -- channel 1: per-conversation — ทุกข้อความ, signal เฉพาะ id ไม่ฝัง body/imageUrl (PII — neutralize-at-broadcast)
  PERFORM realtime.send(
    jsonb_build_object(
      'conversationId', NEW."conversationId",
      'messageId', NEW.id
    ),
    'update', 'chat:' || NEW."conversationId", false
  );

  -- channel 2: shop-wide — เฉพาะข้อความจาก BUYER (seller ต้องได้ signal แม้ไม่ได้เปิด thread อยู่)
  IF NEW."senderRole" = 'BUYER' THEN
    SELECT "shopId" INTO v_shop_id FROM "Conversation" WHERE id = NEW."conversationId";

    IF v_shop_id IS NOT NULL THEN
      PERFORM realtime.send(
        jsonb_build_object('conversationId', NEW."conversationId"),
        'new_message', 'chat:shop:' || v_shop_id, false
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;  -- fail-safe: Realtime ล่มต้องไม่ rollback INSERT หลัก (เหมือน auction)
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_message_realtime_broadcast_trigger ON "ChatMessage";

CREATE TRIGGER chat_message_realtime_broadcast_trigger
  AFTER INSERT ON "ChatMessage" FOR EACH ROW EXECUTE FUNCTION public.chat_message_realtime_broadcast();

-- ROLLBACK NOTE:
-- DROP TRIGGER IF EXISTS chat_message_realtime_broadcast_trigger ON "ChatMessage";
-- DROP FUNCTION IF EXISTS public.chat_message_realtime_broadcast();
-- ปลอดภัย — ไม่มี data loss (function/trigger ไม่เก็บ state); ผลกระทบเดียวคือ client ต้อง fallback เป็น
-- fetch-on-focus (visibilitychange/window focus) แทน realtime push จนกว่าจะ re-apply
