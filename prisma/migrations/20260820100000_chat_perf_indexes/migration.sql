-- 2026-08-20 · index จาก Supabase Query Performance (index_advisor)
--
-- ทุกตัวเลข before/after ในไฟล์นี้วัดจาก **ฐาน prod จริง** (EXPLAIN ANALYZE + hypopg 1.4.1 ซึ่ง
-- ติดตั้งอยู่แล้วเพราะ index_advisor ใช้มันเอง — hypothetical index อยู่ในหน่วยความจำ session
-- ไม่แตะดิสก์ ไม่ล็อก ไม่มีผลกับการรันจริง) ณ วันที่วัด: ChatMessage 40,687 แถว / heap 42MB
--
-- ที่มา: รายงาน pg_stat_statements + index_advisor ของ Supabase (39 statement ที่มี suggestion,
-- รวม 1,478 วินาที) — จาก 24 suggestion ที่มันเสนอมา **22 ตัวเป็น prefix ของ index ที่เรามีอยู่แล้ว**
-- (advisor เสนอได้แต่ btree คอลัมน์เดียว จึงมองไม่เห็น composite ในสคีมา) การทำตามทั้งหมดคือการ
-- จ่ายค่า write amplification เพื่อ cost ที่ลดลง 2–5% ไฟล์นี้จึงหยิบมาเฉพาะตัวที่ตรวจแล้วว่า
-- "ไม่มีของเดิมครอบ" และเพิ่ม composite ที่ advisor เสนอไม่เป็นอีก 1 ตัว
--
-- 🛑 ไม่ใช้ CREATE INDEX CONCURRENTLY — prisma migrate deploy ห่อทุก statement ในทรานแซกชันเดียว
-- ซึ่ง CONCURRENTLY ทำในทรานแซกชันไม่ได้ (เหตุผลเดียวกับที่บันทึกไว้ใน
-- 20260802160000_chat_attachment_meta/migration.sql) ChatMessage ยังอยู่ระดับหลักหมื่นแถว
-- การล็อกเขียนช่วงสั้น ๆ ตอน deploy จึงรับได้ — ถ้าโตถึงระดับล้านแถวค่อยแยกไปสร้างมือ
--
-- ทุกตัวเป็น IF NOT EXISTS: ถ้ามีใครสร้างมือบน console ไปแล้ว migration ต้องไม่ล้ม (และ
-- ห้ามพึ่ง prisma db pull มาไล่ตาม — ดู docs/conventions/migrate-on-deploy.md)

-- ── 1. ChatMessage.orderRefToken ───────────────────────────────────────────────
-- คอลัมน์นี้เพิ่มมาตั้งแต่ 2026-07-24 (การ์ดออเดอร์/ใบเสนอราคาในแชท) โดยไม่เคยมี index
-- query "หาข้อความสรุปออเดอร์ล่าสุดของ token นี้" จึง seq scan ตารางที่ใหญ่ที่สุดในระบบทุกครั้ง
--   mean 1,166ms · max 3,419ms · total_cost 4,171.94 → 4.79 (ลด 99.9% — gain สูงสุดในรายงาน)
-- ยืนยันบน prod: EXPLAIN ANALYZE ได้ `Seq Scan on "ChatMessage" · Rows Removed by Filter: 40,687`
-- (= ทั้งตาราง) · shared hit=4,880 · 109ms ทั้งที่ข้อมูลอยู่ในแคชครบ  →  หลังใส่ index cost 4.78
-- เรียกไม่บ่อย (16 ครั้งในหน้าต่างที่วัด) แต่แต่ละครั้งกินเกือบวินาทีครึ่ง และค่านี้โตตามตาราง
CREATE INDEX IF NOT EXISTS "ChatMessage_orderRefToken_idx"
  ON "ChatMessage"("orderRefToken");

-- ── 2. ChatMessage(conversationId, senderRole, createdAt) ──────────────────────
-- 4 query ของ badge/ตัวกรอง "ยังไม่อ่าน" กินรวมกัน **73% ของเวลาฐานข้อมูลทั้งหมด** (1,080 วิ):
--   countUnreadByConversation · unreadConversationIdsForShops ·
--   countUnreadConversations · countUnreadSpamConversations   (ทั้งหมดใน chat.service.ts)
-- ทุกตัวกรอง senderRole='BUYER' แต่ index ที่มีคือ (conversationId, createdAt) ⇒ planner
-- อ่านข้อความทุกใบของเธรดแล้วค่อยทิ้งฝั่ง SHOP ทีหลัง — ซึ่งบน prod คือ **69% ของทั้งตาราง**
-- (SHOP 28,093 : BUYER 12,593) index นี้ทำให้ senderRole กลายเป็น index qual
--
-- ยืนยันบน prod (ร้านที่คุยเยอะสุด 1,188 เธรด / 19,677 ข้อความ):
--   ก่อน: Index Scan บน (conversationId, createdAt) · senderRole เป็น Filter
--         Rows Removed by Filter 31/loop × 121 loops = 3,751 แถวที่อ่านมาทิ้ง
--         shared hit=3,229 (2,758 มาจากขานี้อย่างเดียว) · 5.0ms · cost 1,492.49
--   หลัง: **Index Only Scan** · Index Cond: (conversationId = c.id) AND (senderRole = 'BUYER')
--         cost 583.76 (ลด 61%) — Index Only = ไม่แตะ heap เลย ซึ่งเป็นที่มาของ buffer ส่วนใหญ่
--
-- 🛑 หลัง deploy ให้ยืนยันซ้ำว่า planner เลือกใช้จริงกับข้อมูลที่โตขึ้น ถ้าไม่ถูกเลือกให้ถอดออก
-- (index ที่ไม่มีใครใช้ = ค่า write ล้วน ๆ บนตารางที่ insert ถี่ที่สุดในระบบ)
--
-- ไม่แทนที่ (conversationId, createdAt) — ตัวนั้นยังเป็นตัวที่ thread pagination และ
-- enrichWithAutoReplyBadge (ORDER BY conversationId, createdAt DESC โดยไม่กรอง senderRole) ใช้
CREATE INDEX IF NOT EXISTS "ChatMessage_conversationId_senderRole_createdAt_idx"
  ON "ChatMessage"("conversationId", "senderRole", "createdAt");

-- ── 3. CommentReplyLog.conversationId ──────────────────────────────────────────
-- lookup ย้อนกลับ "ห้องแชทนี้เกิดจากคอมเมนต์ใบไหน" (private reply, feature 00038)
-- ไม่มี index มาตั้งแต่เพิ่มคอลัมน์ ⇒ seq scan ทุกครั้งที่เปิดเธรด
--   3,548 calls · total_cost 53.35 → 4.46 (ลด 91.6%)
-- ยืนยันบน prod: ก่อน = Seq Scan · Rows Removed by Filter 507 (= ทั้งตาราง) · 10.0ms
--                หลัง = Index Scan · Index Cond: ("conversationId" = ...) · cost 2.24
CREATE INDEX IF NOT EXISTS "CommentReplyLog_conversationId_idx"
  ON "CommentReplyLog"("conversationId");
