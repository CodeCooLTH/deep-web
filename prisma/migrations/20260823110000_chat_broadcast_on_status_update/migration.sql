-- CR 2026-08-23 (00018): broadcast เมื่อสถานะการส่งเปลี่ยน ไม่ใช่แค่ตอน INSERT
--
-- ที่มา: ตั้งแต่ 20260703000400 trigger เป็น AFTER INSERT เท่านั้น พอคิวส่งข้อความมาถึง
-- (CR นี้) การเปลี่ยน QUEUED → SENT/FAILED เป็น **UPDATE** จึงไม่มี broadcast เลย
-- ผลคือจอเครื่องอื่น/แท็บอื่นค้างที่ "กำลังส่ง" ตลอดกาลโดยไม่มี error อะไรให้เห็น
--
-- 🛑 ทำไม `UPDATE OF "deliveryStatus"` ไม่ใช่ `AFTER UPDATE` เปล่า ๆ: ทุกรีแอ็กชัน/ทุกการแก้
-- ข้อความ/ทุก unsend ก็เป็น UPDATE ของตารางนี้ ถ้าไม่จำกัดคอลัมน์ client จะถูกสั่ง refetch รัว
--
-- 🛑 channel 2 (chat:shop:{id}) ยังต้องยิงเฉพาะ INSERT + senderRole='BUYER' เหมือนเดิม —
-- มันคือสัญญาณ "ลูกค้าทักมา" ไม่ใช่ "สถานะเปลี่ยน"

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

  -- channel 2: shop-wide — เฉพาะข้อความ "ใหม่" จาก BUYER เท่านั้น (ห้ามยิงตอน UPDATE)
  IF TG_OP = 'INSERT' AND NEW."senderRole" = 'BUYER' THEN
    SELECT "shopId" INTO v_shop_id FROM "Conversation" WHERE id = NEW."conversationId";

    IF v_shop_id IS NOT NULL THEN
      PERFORM realtime.send(
        jsonb_build_object('conversationId', NEW."conversationId"),
        'new_message', 'chat:shop:' || v_shop_id, false
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;  -- fail-safe: Realtime ล่มต้องไม่ rollback การเขียนหลัก
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_message_realtime_broadcast_trigger ON "ChatMessage";

CREATE TRIGGER chat_message_realtime_broadcast_trigger
  AFTER INSERT OR UPDATE OF "deliveryStatus" ON "ChatMessage"
  FOR EACH ROW EXECUTE FUNCTION public.chat_message_realtime_broadcast();

-- ROLLBACK NOTE: re-apply เนื้อไฟล์ 20260703000400_chat_realtime_broadcast/migration.sql
-- (function + trigger เวอร์ชัน AFTER INSERT) — ไม่มี data loss
--
-- 🛑 แต่ตอน rollback **เฉพาะโค้ด** ไม่ต้อง re-apply: โค้ดเก่าไม่ได้ UPDATE "deliveryStatus" อยู่แล้ว
--    (เขียนสถานะครั้งเดียวตอน INSERT) trigger ตัวนี้จึงมีพฤติกรรมเท่าเดิมทุกประการเมื่ออยู่กับโค้ดเก่า
--    สิ่งที่ต้องทำจริงคือปิดแถวที่ค้าง 'QUEUED' เป็น FAILED — อ่าน §13 "ถ้าต้อง rollback" ของ
--    docs/20 - Features/00018 - Facebook Chat Integration/EXTENSIONS-2026-08-23-outbound-queue.md
