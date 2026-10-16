-- 00077 Chat Desk ext (2026-10-16): สัญญาณสด "ร้านตอบแล้ว" บน channel ร้าน
--
-- ที่มา: โต๊ะแชท (00077) ต้องเห็นลูกค้าเดินจากเลานจ์ไปหน้าโต๊ะทันทีที่ร้านตอบ แต่ channel 2
-- (`chat:shop:{shopId}`) ยิงเฉพาะข้อความจาก BUYER ⇒ ฝั่งร้านตอบต้องรอ poll 8 วิ
-- เพิ่ม event ใหม่ `shop_reply` (ไม่ใช้ `new_message` เดิม — listener เดิมทุกตัว (toast/เสียง/ตัวนับ)
-- ฟังเฉพาะ `new_message` อยู่แล้ว event ใหม่จึงไม่กระทบพฤติกรรมเดิมเลย)
--
-- ครอบทุกทางที่ข้อความร้านถูก INSERT: ตอบใน Deep · echo จาก Business Suite/แอป Messenger ·
-- Meta AI (standby) · บอท Deep — เพราะ trigger อยู่ที่ตาราง ไม่ใช่ที่โค้ดส่ง
--
-- 🛑 กรงเล็บเดิมยังอยู่: payload signal-only (conversationId เท่านั้น ห้าม body/imageUrl)
-- 🛑 บรรทัดระบบ (AUTO_ORDER_RESULT / META_NOTICE = INTERNAL_MESSAGE_TYPES ใน
--    src/lib/auto-order-message-type.ts) ไม่ใช่ "ร้านตอบ" ⇒ ไม่ยิง
-- 🛑 ยิงเฉพาะ INSERT (สถานะส่งเปลี่ยน = UPDATE ไม่ใช่การตอบใหม่)
-- เนื้อส่วนอื่นเหมือน 20260823110000_chat_broadcast_on_status_update ทุกบรรทัด (ตรวจ md5 บน prod
-- ก่อนเขียน 2026-10-16 = ตรงกับไฟล์นั้น) · trigger เดิมไม่ต้องสร้างใหม่ (ชี้ฟังก์ชันชื่อเดิม)

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
       OR (NEW."senderRole" = 'SHOP' AND NEW."type" NOT IN ('AUTO_ORDER_RESULT', 'META_NOTICE'))
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

-- ROLLBACK NOTE: re-apply เนื้อฟังก์ชันใน 20260823110000_chat_broadcast_on_status_update/migration.sql
-- (ไม่ต้องแตะ trigger) — ไม่มี data loss · client ที่ฟัง 'shop_reply' จะกลับไปพึ่ง poll 8 วิเอง
