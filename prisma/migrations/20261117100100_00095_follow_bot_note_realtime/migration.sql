-- 00095 บอทติดตามยอดขาย (2026-11-17): บรรทัดระบบ "บอทหยุด" (ChatMessage.type = 'FOLLOW_BOT_NOTE')
-- เป็นสมาชิกตัวที่สามของ INTERNAL_MESSAGE_TYPES (src/lib/auto-order-message-type.ts) ⇒ ไม่ใช่ "ร้านตอบ"
-- ต้องไม่ยิง 'shop_reply' บน channel ร้าน (ไม่งั้นโต๊ะแชทเห็นลูกค้าเดินไปหน้าโต๊ะทั้งที่ไม่มีใครตอบ)
-- channel 1 (per-conversation 'update') ยังยิงตามเดิม — หน้าห้องต้องดึงบรรทัดใหม่มาแสดง
--
-- เนื้อฟังก์ชัน = 20261016230000_chat_shop_reply_broadcast ทุกบรรทัด ต่างแค่รายการ NOT IN
-- กรงเล็บเดิมคงอยู่: payload signal-only · ยิงเฉพาะ INSERT · fail-safe ไม่ rollback การเขียนหลัก

CREATE OR REPLACE FUNCTION public.chat_message_realtime_broadcast() RETURNS trigger AS $$
DECLARE
  v_shop_id TEXT;
BEGIN
  -- UPDATE ที่ deliveryStatus ไม่ได้เปลี่ยนจริง → ไม่ต้องรบกวน client
  IF TG_OP = 'UPDATE' AND NEW."deliveryStatus" IS NOT DISTINCT FROM OLD."deliveryStatus" THEN
    RETURN NEW;
  END IF;

  -- channel 1: per-conversation — signal เฉพาะ id ไม่ฝัง body/imageUrl (PII)
  PERFORM realtime.send(
    jsonb_build_object(
      'conversationId', NEW."conversationId",
      'messageId', NEW.id
    ),
    'update', 'chat:' || NEW."conversationId", false
  );

  -- channel 2: shop-wide — ข้อความ "ใหม่" เท่านั้น (ห้ามยิงตอน UPDATE)
  --   BUYER → 'new_message' (เดิม) · SHOP ที่ไม่ใช่บรรทัดระบบ → 'shop_reply' (ใหม่ 00077)
  IF TG_OP = 'INSERT' AND (
       NEW."senderRole" = 'BUYER'
       OR (NEW."senderRole" = 'SHOP' AND NEW."type" NOT IN ('AUTO_ORDER_RESULT', 'META_NOTICE', 'FOLLOW_BOT_NOTE'))
     ) THEN
    SELECT "shopId" INTO v_shop_id FROM "Conversation" WHERE id = NEW."conversationId";

    IF v_shop_id IS NOT NULL THEN
      PERFORM realtime.send(
        jsonb_build_object('conversationId', NEW."conversationId"),
        CASE WHEN NEW."senderRole" = 'BUYER' THEN 'new_message' ELSE 'shop_reply' END,
        'chat:shop:' || v_shop_id, false
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;  -- fail-safe: Realtime ล่มต้องไม่ rollback การเขียนหลัก
END;
$$ LANGUAGE plpgsql;

-- ROLLBACK NOTE: re-apply เนื้อฟังก์ชันใน 20261016230000_chat_shop_reply_broadcast/migration.sql
-- (ไม่ต้องแตะ trigger) — ไม่มี data loss · ผลคือบรรทัดระบบของบอทยิง shop_reply ผิด ๆ อีกครั้ง
