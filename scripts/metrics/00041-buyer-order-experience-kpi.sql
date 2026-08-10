-- KPI ของ feature 00041 — Buyer Order Experience
--
-- วิธีใช้: รันทีละบล็อกบน Supabase SQL editor (หรือ psql ที่ชี้ฐานที่ต้องการวัด)
-- ทุกบล็อกอ่านอย่างเดียว ไม่มีคำสั่งเขียน/ลบ
--
-- 🛑 ทุก query ที่นับ "Review" ต้องมี `"deletedAt" IS NULL` เสมอ
-- feature นี้เพิ่ม soft delete (BR-BOE-18) — แถวที่ผู้ซื้อลบไปแล้วยังอยู่ในตารางโดยตั้งใจ
-- (เพื่อกันการลบ-เขียนใหม่เพื่อรีเซ็ตหน้าต่างแก้ไข 24 ชม.) ลืมกรอง = Review Rate สูงเกินจริง
-- และจะสูงขึ้นเรื่อย ๆ ตามจำนวนคนที่ลบรีวิว ซึ่งเป็นทิศตรงข้ามกับความจริง
--
-- หมายเหตุเรื่องเวลา: ตัดวันด้วยเวลาไทย (UTC+7) ให้ตรงกับหน้า /sales และ dashboard
-- (ระบบเคยตัดวันด้วย UTC แล้วตัวเลขไม่ตรงกันข้ามหน้าจอมาแล้ว — feature 00033)


-- ─────────────────────────────────────────────────────────────────────────────
-- KPI-1 · Review Rate — ออเดอร์ที่ยืนยันแล้วกี่ % ที่ได้รีวิว
-- เป้า: เพิ่มขึ้นหลังปล่อยฟีเจอร์ (ผู้ซื้อเขียนรีวิวได้ง่ายขึ้น + แก้ไขได้ใน 24 ชม.)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  to_char(o."createdAt" AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM')      AS "เดือน",
  count(*)                                                            AS "ออเดอร์ที่ยืนยันแล้ว",
  count(r.id)                                                         AS "มีรีวิว",
  round(100.0 * count(r.id) / nullif(count(*), 0), 1)                 AS "Review Rate (%)"
FROM "Order" o
LEFT JOIN "Review" r
  ON r."orderId" = o.id
 AND r."deletedAt" IS NULL          -- 🛑 ห้ามตัดทิ้ง (ดูหัวไฟล์)
WHERE o.status = 'CONFIRMED'
GROUP BY 1
ORDER BY 1 DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- KPI-2 · Shop Reply Rate — ร้านตอบรีวิวกี่ %
-- เป้า: > 0 (ก่อนฟีเจอร์นี้ตอบไม่ได้เลย ค่าเริ่มต้นจึงเป็น 0 โดยนิยาม)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  to_char(r."createdAt" AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM')       AS "เดือน",
  count(*)                                                            AS "รีวิวทั้งหมด",
  count(*) FILTER (WHERE r."shopReplyComment" IS NOT NULL)            AS "ร้านตอบแล้ว",
  round(
    100.0 * count(*) FILTER (WHERE r."shopReplyComment" IS NOT NULL)
    / nullif(count(*), 0), 1
  )                                                                   AS "Reply Rate (%)",
  -- เวลาเฉลี่ยที่ร้านใช้ตอบ (ชั่วโมง) — ช้าเกินไปแปลว่าผู้ขายไม่เห็นว่ามีรีวิวค้าง
  round(
    avg(extract(epoch FROM (r."shopRepliedAt" - r."createdAt")) / 3600.0)
      FILTER (WHERE r."shopRepliedAt" IS NOT NULL)::numeric, 1
  )                                                                   AS "ตอบเฉลี่ยภายใน (ชม.)"
FROM "Review" r
WHERE r."deletedAt" IS NULL
GROUP BY 1
ORDER BY 1 DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- KPI-3 · การใช้สิทธิ์แก้ไข/ลบรีวิว (BR-BOE-17/18)
-- ใช้ดูว่าหน้าต่าง 24 ชม. ยาวพอไหม — ถ้าแทบไม่มีใครแก้ อาจแปลว่าปุ่มหายากไม่ใช่ว่าไม่ต้องการ
--
-- "แก้ไขแล้ว" ตรวจจาก updatedAt > createdAt เกิน 1 วินาที
-- (Prisma เขียน updatedAt ทุกครั้งที่ update รวมตอนร้านตอบกลับ — ตัวเลขนี้จึงเป็น "เพดานบน"
--  ของจำนวนที่ผู้ซื้อแก้เอง ไม่ใช่ตัวเลขสุทธิ ต้องอ่านคู่กับ KPI-2 เสมอ)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  count(*)                                                            AS "รีวิวที่ยังอยู่",
  count(*) FILTER (
    WHERE r."updatedAt" > r."createdAt" + interval '1 second'
      AND r."shopRepliedAt" IS NULL       -- ตัดเคสที่ updatedAt ขยับเพราะร้านตอบ
  )                                                                   AS "ผู้ซื้อแก้ไข (เพดานบน)",
  (SELECT count(*) FROM "Review" WHERE "deletedAt" IS NOT NULL)        AS "ถูกลบ (soft)",
  count(*) FILTER (WHERE jsonb_array_length(r.images) > 0)            AS "มีรูปแนบ",
  round(
    avg(jsonb_array_length(r.images)) FILTER (WHERE jsonb_array_length(r.images) > 0)::numeric, 2
  -- ชื่อ alias สั้นเพราะ Postgres ตัดที่ 63 "ไบต์" ไม่ใช่ 63 ตัวอักษร — ไทยตัวละ 3 ไบต์
  -- ⇒ ยาวเกิน 21 ตัวอักษรจะโดนตัดหางทิ้งพร้อม NOTICE (หัวคอลัมน์จะอ่านไม่รู้เรื่อง)
  )                                                                   AS "รูปเฉลี่ย/รีวิว"
FROM "Review" r
WHERE r."deletedAt" IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- KPI-4 · Guest view → เข้าสู่ระบบ (FR-001/TFR-001)
-- วัดว่าการเปิดให้ guest เห็นออเดอร์แบบจำกัด ทำให้คนเดินต่อไปยืนยันตัวตนไหม
--
-- อาศัย OrderEvent 2 ชนิดที่เพิ่มใน Batch B: AUTH_FLOW_STARTED / AUTH_FLOW_COMPLETED
-- 🛑 ทั้งคู่เป็น instrumentation — ถูกซ่อนจากไทม์ไลน์ที่ผู้ใช้เห็น (INSTRUMENTATION_EVENT_TYPES)
--    ถ้าวันหนึ่งมีคนเอาออกจากรายการนั้น ประวัติออเดอร์ของลูกค้าจะรกขึ้นทันที
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  to_char(e."occurredAt" AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD')   AS "วัน",
  count(*) FILTER (WHERE e.type = 'AUTH_FLOW_STARTED')                AS "เริ่มยืนยันตัวตน",
  count(*) FILTER (WHERE e.type = 'AUTH_FLOW_COMPLETED')              AS "ยืนยันสำเร็จ",
  round(
    100.0 * count(*) FILTER (WHERE e.type = 'AUTH_FLOW_COMPLETED')
    / nullif(count(*) FILTER (WHERE e.type = 'AUTH_FLOW_STARTED'), 0), 1
  )                                                                   AS "Conversion (%)"
FROM "OrderEvent" e
WHERE e.type IN ('AUTH_FLOW_STARTED', 'AUTH_FLOW_COMPLETED')
GROUP BY 1
ORDER BY 1 DESC
LIMIT 30;
