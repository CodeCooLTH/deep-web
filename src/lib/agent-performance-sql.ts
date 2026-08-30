/**
 * agent-performance-sql — สูตรของ `agent-performance.ts` ฉบับ SQL (feature 00059)
 *
 * pure module — สร้างแค่ *ข้อความ SQL* ไม่ยิงอะไรเอง (ห้าม import prisma ที่นี่)
 * แพตเทิร์นและเหตุผลเดียวกับ `order-stage-sql.ts` ทุกประการ
 *
 * ── ทำไมต้องมีฉบับที่สอง ─────────────────────────────────────────────────────
 * สูตรตัวจริงเป็น TypeScript เพราะต้องพิสูจน์ด้วยเทสได้โดยไม่ต้องมีฐานข้อมูล แต่การคำนวณ
 * จริงต้องเกิดที่ฐานข้อมูล ไม่ใช่ที่แอป — ไม่งั้นต้องดึง `ChatMessage` ทุกใบของทุกเธรดใน
 * ช่วงเวลาลงมาเรียงในหน่วยความจำ ซึ่งเป็นสิ่งที่โจทย์ห้ามไว้ตรงตัว และเป็นตารางที่ใหญ่ที่สุด
 * ในระบบอยู่แล้ว
 *
 * ── 🛑 กติกาที่ห้ามละเมิด ────────────────────────────────────────────────────
 * 1. เงื่อนไข "ตอบโดยคน" ต้องตรงกับ `isHumanAgentReply()` ทุกตัวอักษร
 * 2. การจับคู่รอบรอต้องให้ผลเดียวกับ `computeResponsePairs()` — วิธีพิสูจน์อยู่ที่
 *    `src/services/__tests__/agent-performance-sql-parity.test.ts` (รันบนฐาน dev เท่านั้น)
 * 3. ห้ามพิมพ์ชื่อสถานะออเดอร์ลงที่นี่เอง — "ใบไหนนับเป็นยอดขาย" มี SSOT อยู่แล้วที่
 *    `order-revenue.ts` (ฉบับ Prisma) และฉบับ SQL อยู่ข้างล่างนี้ซึ่ง derive จากค่าคงที่ตัวเดียวกัน
 */

import { REVENUE_CARRIER_STATUSES } from './order-revenue'

/** ใส่ quote ให้ literal สตริงแบบปลอดภัย — ใช้กับค่าคงที่ในโค้ดเท่านั้น ไม่ใช่ input ผู้ใช้ */
function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** ชื่อ alias ของตาราง `ChatMessage` ที่ผู้เรียกใช้อยู่ */
export type MessageColumns = {
  senderRole: string
  senderUserId: string
  autoReplyKind: string
  isDeleted: string
}

/** ตรงกับ `isCustomerMessage()` */
export function customerMessageSql(m: MessageColumns): string {
  return `(${m.senderRole} = 'BUYER' AND ${m.isDeleted} = false)`
}

/** ตรงกับ `isHumanAgentReply()` */
export function humanAgentReplySql(m: MessageColumns): string {
  return `(${m.senderRole} = 'SHOP' AND ${m.autoReplyKind} IS NULL AND ${m.senderUserId} IS NOT NULL AND ${m.isDeleted} = false)`
}

/** ตรงกับ `isUnattributedShopReply()` — คนตอบจาก Business Suite (ระบุตัวไม่ได้) */
export function unattributedShopReplySql(m: MessageColumns): string {
  return `(${m.senderRole} = 'SHOP' AND ${m.autoReplyKind} IS NULL AND ${m.senderUserId} IS NULL AND ${m.isDeleted} = false)`
}

/**
 * "ออเดอร์ใบนี้นับเป็นยอดขายแล้วหรือยัง" ฉบับ SQL — คู่แฝดของ `revenueOrderWhere`
 *
 * 🛑 รายชื่อ carrier status มาจาก `REVENUE_CARRIER_STATUSES` ตัวเดียวกัน ห้ามพิมพ์เอง
 * และเงื่อนไขพัสดุต้องครบทั้ง 4 ข้อเหมือนฝั่ง Prisma: `status='CREATED'` · ไม่ใช่ dry-run ·
 * `direction='FORWARD'` (พัสดุขากลับของใบคืนไม่ใช่หลักฐานว่าขายได้) · carrierStatus อยู่ในลิสต์
 *
 * @param o alias ของตาราง `Order`
 */
export function revenueOrderSql(o: string): string {
  const statuses = REVENUE_CARRIER_STATUSES.map(lit).join(', ')
  return `(
    ${o}."status" = 'CONFIRMED'
    OR (
      ${o}."status" = 'SHIPPED'
      AND EXISTS (
        SELECT 1 FROM "OrderShipment" rs
        WHERE rs."orderId" = ${o}."id"
          AND rs."status" = 'CREATED'
          AND rs."isDryRun" = false
          AND rs."direction" = 'FORWARD'
          AND rs."carrierStatus" IN (${statuses})
      )
    )
  )`
}

/**
 * CTE ที่ย่อย `ChatMessage` ให้เหลือ "หนึ่งแถวต่อหนึ่งรอบการรอที่ถูกตอบแล้ว"
 *
 * ผู้เรียกต้องมี CTE ชื่อ `conv` อยู่ก่อนแล้ว (คอลัมน์อย่างน้อย: `id`) = ชุดเธรดที่อยู่ในขอบเขต
 * รายงานหลังกรองครบทุกแกน — จำกัดของที่ต้องอ่านตั้งแต่ต้นทาง ไม่ใช่กรองทีหลัง
 *
 * ── วิธีจับคู่ (เท่ากับ `computeResponsePairs()`) ────────────────────────────
 * `grp` = จำนวนคำตอบของคนที่เกิดมาแล้วถึงแถวนี้ (running sum) ⇒
 *   - ข้อความลูกค้าที่ยังไม่ถูกตอบทุกใบในรอบเดียวกันได้ `grp` เท่ากัน → `MIN(createdAt)`
 *     ของกลุ่มคือ "ใบแรกที่รอ" พอดี (ลูกค้าพิมพ์รัว = รอบเดียว ตามข้อ 6 ของโจทย์)
 *   - คำตอบที่ปิดรอบนั้นคือแถวที่ `grp = รอบ + 1` — คำตอบใบที่ 2, 3 ของชุดเดียวกันจะได้
 *     `grp` ที่ไม่มีกลุ่มการรอไหน match จึงไม่ถูกนับซ้ำโดยอัตโนมัติ
 *   - รอบที่ยังไม่ถูกตอบไม่มีแถวคู่ → หายไปเองจาก INNER JOIN (ไม่ใช่ 0 ไม่ใช่อนันต์)
 *
 * คอลัมน์ที่คืน: conversationId · agentUserId · askedAt · repliedAt · waitSec · pairNo
 * (`pairNo = 1` คือ First Response Time ของเธรดนั้น)
 *
 * หมายเหตุ `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`: เขียนไว้ชัด ๆ ทั้งที่
 * **ให้ผลเท่ากับค่าตั้งต้น (RANGE) ในบริบทนี้** เพราะ `ChatMessage.seq` เป็น `@unique`
 * ⇒ ไม่มีวันมีแถวที่คีย์เรียงเสมอกัน (ไม่มี peer row) — ยืนยันด้วย mutation แล้วว่าถอดออก
 * เทสยังเขียว คือ *equivalent* ไม่ใช่ชุดข้อมูลอ่อน. เก็บไว้เพราะวันที่มีคนเปลี่ยนคีย์เรียง
 * (เช่นเอา `seq` ออก) RANGE จะเริ่มรวม peer เข้ามาเงียบ ๆ แล้วตัวเลขเพี้ยนโดยไม่มีอะไรฟ้อง
 */
export function buildResponsePairsSql(opts?: {
  /**
   * ตารางต้นทางของข้อความ — ค่าตั้งต้นคือตารางจริง
   *
   * 🛑 มีพารามิเตอร์นี้เพื่อ **เทสเท่านั้น** (`agent-performance-sql-parity.test.ts` ป้อน
   * ชุดค่าสังเคราะห์ผ่าน CTE แล้วเทียบผลกับฟังก์ชัน TS) — โค้ดที่ทำงานจริงต้องไม่ส่งค่านี้
   * ทำแบบเดียวกับ `order-stage-sql.ts` ที่รับชื่อคอลัมน์เข้ามาเพื่อให้เทสป้อน `VALUES` ได้
   * ⇒ ด่านพิสูจน์ทำงานได้โดย **ไม่แตะข้อมูลจริงและไม่เขียนอะไรลงฐานเลย**
   */
  messageSource?: string
}): string {
  const source = opts?.messageSource ?? '"ChatMessage"'
  const m: MessageColumns = {
    senderRole: 'm."senderRole"',
    senderUserId: 'm."senderUserId"',
    autoReplyKind: 'm."autoReplyKind"',
    isDeleted: 'm."isDeleted"',
  }
  return `
  ev AS (
    SELECT
      m."conversationId",
      m."createdAt",
      m."seq",
      m."senderUserId",
      ${customerMessageSql(m)}   AS is_in,
      ${humanAgentReplySql(m)}   AS is_out
    FROM ${source} m
    JOIN conv ON conv."id" = m."conversationId"
    WHERE ${customerMessageSql(m)} OR ${humanAgentReplySql(m)}
  ),
  ev_grp AS (
    SELECT
      ev.*,
      SUM(CASE WHEN ev.is_out THEN 1 ELSE 0 END)
        OVER (PARTITION BY ev."conversationId" ORDER BY ev."createdAt", ev."seq"
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS grp
    FROM ev
  ),
  waits AS (
    SELECT "conversationId", grp, MIN("createdAt") AS asked_at
    FROM ev_grp WHERE is_in GROUP BY "conversationId", grp
  ),
  replies AS (
    SELECT "conversationId", grp, "createdAt" AS replied_at, "senderUserId" AS agent_user_id
    FROM ev_grp WHERE is_out
  ),
  pairs AS (
    SELECT
      w."conversationId",
      r.agent_user_id,
      w.asked_at,
      r.replied_at,
      ROUND(EXTRACT(EPOCH FROM (r.replied_at - w.asked_at)))::int AS wait_sec,
      ROW_NUMBER() OVER (PARTITION BY w."conversationId" ORDER BY w.asked_at)::int AS pair_no
    FROM waits w
    JOIN replies r ON r."conversationId" = w."conversationId" AND r.grp = w.grp + 1
  )`
}
