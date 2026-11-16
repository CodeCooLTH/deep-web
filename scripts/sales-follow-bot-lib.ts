/**
 * 00095 — ตัวช่วยร่วมของสคริปต์ปฏิบัติการบอทติดตามยอดขาย (guard URL + guard SQL + ตัวสร้าง SQL ของ preflight)
 * แยกเป็นไฟล์ pure (ไม่ import prisma) เพื่อให้เทสจับได้ — สคริปต์ 3 ตัวต้องไม่มีกฎของตัวเองซ้ำ
 */
import { realBuyerMsgSql, countedShopReplySql } from '../src/lib/sales-follow-bot/message-defs'

/** ชื่อ env ของสคริปต์ปิดร้าน — ตั้งใจแยกจาก DATABASE_URL กันชี้ผิดฐานโดยไม่รู้ตัว */
export const CLOSE_URL_ENV = 'SALES_FOLLOW_CLOSE_DATABASE_URL'

export const dbHost = (url: string | undefined): string => {
  try {
    return new URL(url ?? '').hostname
  } catch {
    return ''
  }
}

export const isLocalhostUrl = (url: string | undefined): boolean => ['localhost', '127.0.0.1'].includes(dbHost(url))

/** qa-seed: เข้มกว่า localhost ทั่วไป — ต้อง localhost:5434 (ฐาน dev ของ repo) เท่านั้น */
export const isLocal5434Url = (url: string | undefined): boolean => {
  try {
    const u = new URL(url ?? '')
    return ['localhost', '127.0.0.1'].includes(u.hostname) && u.port === '5434'
  } catch {
    return false
  }
}

export function assertLocal5434(url: string | undefined): void {
  if (!isLocal5434Url(url)) throw new Error(`ปฏิเสธ: DATABASE_URL ต้องเป็น localhost:5434 (host="${dbHost(url) || 'ไม่ทราบ'}")`)
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** ตัดข้อความใน '...' และ "..." ออกก่อนตรวจคำสั่ง — ชื่อคอลัมน์/ค่า enum ที่บังเอิญมีคำว่า UPDATE ไม่ทำให้ guard ลั่น */
const stripQuoted = (sql: string): string => sql.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""')

const WRITE_WORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY|CALL|DO|MERGE|VACUUM|REINDEX|REFRESH|LOCK|SET|COMMENT|NOTIFY|LISTEN)\b/i

/** อนุญาตเฉพาะ SELECT/WITH ล้วน ๆ คำสั่งเดียว (ไม่มี ; กลางข้อความ) และไม่มีคำสั่งเขียนอยู่ที่ใดเลย */
export function isReadOnlySql(sql: string): boolean {
  const s = stripQuoted(sql).replace(/--[^\n]*/g, '').trim().replace(/;+\s*$/, '')
  if (!/^(SELECT|WITH)\b/i.test(s)) return false
  if (s.includes(';')) return false
  return !WRITE_WORDS.test(s)
}

export function assertReadOnlySql(sql: string): void {
  if (!isReadOnlySql(sql)) throw new Error(`preflight: SQL ไม่ใช่ SELECT ล้วน — ปฏิเสธ: ${sql.slice(0, 80)}`)
}

// ───────────────────────── preflight SQL (TFR-FB-23 · BR-FB-82) ─────────────────────────

const PROVIDERS = `('MESSENGER','INSTAGRAM','LINE')`
const SINCE_24H = `now() - interval '24 hours'`
const SINCE_30D = `now() - interval '30 days'`

/** ร้านที่ระบุเป็น literal (ตรวจ uuid ก่อน — ไม่รับ input อื่น) · ไม่ระบุ = ทุกร้าน ONLINE_SALES */
function shopFilter(shopIds: string[], col: string): string {
  for (const id of shopIds) if (!UUID_RE.test(id)) throw new Error(`--shop ต้องเป็น uuid: ${id}`)
  return shopIds.length ? `${col} IN (${shopIds.map((i) => `'${i.toLowerCase()}'`).join(', ')})` : 'TRUE'
}

/** ไม่มีออเดอร์อ้างอิง E ของห้อง = สถานะ "ยังไม่ซื้อ" (TFR-FB-01 แถว 0) */
const noOrderOf = (room: string) =>
  `NOT EXISTS (SELECT 1 FROM "Order" o WHERE o."conversationId" = ${room} AND o."status" <> 'DRAFTED' AND o."isDryRun" = false)`

export interface PreflightQuery {
  key: 'A' | 'B' | 'C' | 'D'
  title: string
  note: string
  sql: string
}

export function buildPreflightQueries(shopIds: string[]): PreflightQuery[] {
  const roomsCte = `WITH rooms AS (
  SELECT c."id", c."shopId", c."channel"
  FROM "Conversation" c
  JOIN "Shop" s ON s."id" = c."shopId" AND s."vertical" = 'ONLINE_SALES'
  JOIN "ShopChannel" ch ON ch."id" = c."shopChannelId" AND ch."status" = 'ACTIVE'
  JOIN "ExternalContact" ec ON ec."id" = c."externalContactId" AND ec."isBlocked" = false
  WHERE c."channel" IN ${PROVIDERS} AND c."isSpam" = false AND c."isHidden" = false
    AND c."lastInboundAt" >= ${SINCE_30D} AND ${shopFilter(shopIds, 'c."shopId"')}
)`

  const A = `${roomsCte}
SELECT r."shopId", r."channel", count(*)::int AS rooms
FROM rooms r
WHERE ${noOrderOf('r."id"')}
  AND EXISTS (SELECT 1 FROM "ChatMessage" m WHERE m."conversationId" = r."id" AND ${realBuyerMsgSql('m', SINCE_24H)})
GROUP BY 1, 2 ORDER BY 1, 2`

  const B = `${roomsCte}
SELECT r."shopId", r."channel", count(*)::int AS rooms,
       (count(*) FILTER (WHERE ${noOrderOf('r."id"')}))::int AS rooms_not_bought
FROM rooms r
JOIN LATERAL (SELECT max(m."createdAt") AS t FROM "ChatMessage" m WHERE m."conversationId" = r."id" AND ${realBuyerMsgSql('m', SINCE_30D)}) b ON true
JOIN LATERAL (SELECT max(m."createdAt") AS t FROM "ChatMessage" m WHERE m."conversationId" = r."id" AND ${countedShopReplySql('m', SINCE_30D)}) sh ON true
WHERE b.t IS NOT NULL AND sh.t IS NOT NULL AND b.t > sh.t
GROUP BY 1, 2 ORDER BY 1, 2`

  // ประมาณจากสถานะออเดอร์ (ไม่ได้ย้ายตรรกะ deriveShippingStage ทั้งก้อนมาเป็น SQL) — จับ "สถานะที่ตราประทับมาจาก event ล้วน" ที่ event หาย
  const hasEv = (types: string[]) =>
    `EXISTS (SELECT 1 FROM "OrderEvent" ev WHERE ev."orderId" = e."id" AND ev."type" IN (${types.map((t) => `'${t}'`).join(', ')}))`
  const C = `WITH e AS (
  SELECT DISTINCT ON (o."conversationId") o."id", o."shopId", o."status"
  FROM "Order" o
  JOIN "Shop" s ON s."id" = o."shopId" AND s."vertical" = 'ONLINE_SALES'
  WHERE o."conversationId" IS NOT NULL AND o."status" <> 'DRAFTED' AND o."isDryRun" = false AND ${shopFilter(shopIds, 'o."shopId"')}
  ORDER BY o."conversationId", o."createdAt" DESC, o."id" DESC
)
SELECT e."shopId", count(*)::int AS latest_orders,
  (count(*) FILTER (WHERE e."status" NOT IN ('PENDING','SHIPPED','CONFIRMED','CANCELLED','RETURNED')))::int AS unknown_status,
  (count(*) FILTER (WHERE e."status" = 'CANCELLED' AND NOT ${hasEv(['ORDER_CANCELLED'])}))::int AS cancelled_no_stamp,
  (count(*) FILTER (WHERE e."status" = 'SHIPPED' AND NOT ${hasEv(['MANUAL_DISPATCHED', 'SHIPMENT_CREATED', 'SHIPMENT_LINKED', 'TRACKING_ADDED'])}))::int AS shipped_no_stamp,
  (count(*) FILTER (WHERE e."status" = 'CONFIRMED' AND NOT ${hasEv(['SELLER_DELIVERED', 'BUYER_CONFIRMED', 'SYSTEM_CONFIRMED', 'COD_SETTLED', 'HANDED_OVER'])}
     AND NOT EXISTS (SELECT 1 FROM "OrderShipment" sh WHERE sh."orderId" = e."id" AND sh."deliveredAt" IS NOT NULL)))::int AS confirmed_no_stamp,
  (count(*) FILTER (WHERE e."status" = 'RETURNED' AND NOT ${hasEv(['RETURN_RECEIVED', 'PARCEL_PROBLEM_CLOSED'])}
     AND NOT EXISTS (SELECT 1 FROM "OrderShipment" sh WHERE sh."orderId" = e."id" AND sh."problemAt" IS NOT NULL)))::int AS returned_no_stamp
FROM e GROUP BY 1 ORDER BY 1`

  // เชื่อมด้วย ExternalContact.customerId เท่านั้น (ไม่เดาจากเบอร์) — ออเดอร์ที่ลูกค้ายังไม่ผูกผู้ติดต่อจะไม่ถูกนับ
  const D = `SELECT o."shopId", count(DISTINCT o."id")::int AS orders_outside_room, count(DISTINCT o."customerId")::int AS customers,
  count(DISTINCT c."id")::int AS rooms_linked,
  (count(DISTINCT c."id") FILTER (WHERE ${noOrderOf('c."id"')}))::int AS rooms_bot_would_see_as_not_bought
FROM "Order" o
JOIN "Shop" s ON s."id" = o."shopId" AND s."vertical" = 'ONLINE_SALES'
JOIN "ExternalContact" ec ON ec."customerId" = o."customerId"
JOIN "ShopChannel" ch ON ch."id" = ec."shopChannelId" AND ch."shopId" = o."shopId" AND ch."provider" IN ${PROVIDERS}
JOIN "Conversation" c ON c."externalContactId" = ec."id" AND c."shopId" = o."shopId" AND c."channel" IN ${PROVIDERS}
WHERE o."conversationId" IS NULL AND o."status" <> 'DRAFTED' AND o."isDryRun" = false AND o."customerId" IS NOT NULL
  AND ${shopFilter(shopIds, 'o."shopId"')}
GROUP BY 1 ORDER BY 1`

  return [
    { key: 'A', title: '(ก) ห้องที่เข้าเงื่อนไข "ยังไม่ซื้อ" ทันที (ลูกค้าทักจริงใน 24 ชม. · ไม่มีออเดอร์)', note: 'ต่อ ร้าน/ช่องทาง', sql: A },
    { key: 'B', title: '(ข) ห้องที่ลูกค้าตอบหลังข้อความร้านล่าสุดแล้ว (30 วัน)', note: 'rooms_not_bought = ในนั้นที่ยังไม่มีออเดอร์ — บอทจะหยุดทันทีด้วย CUSTOMER_REPLIED ถ้าถูกแนบ', sql: B },
    { key: 'C', title: '(ค) ออเดอร์ล่าสุดของห้องที่หาตราประทับไม่ได้ (ประมาณจากสถานะ)', note: 'unknown_status = สถานะที่ไม่รู้จัก (BR-FB-17) · *_no_stamp = รอบไม่จบเอง/แนบไม่ได้', sql: C },
    { key: 'D', title: '(ง) ออเดอร์นอกห้อง (conversationId = NULL) ของลูกค้าที่มีผู้ติดต่อ Messenger/IG/LINE (R-FB-3)', note: 'rooms_bot_would_see_as_not_bought = ห้องที่บอทเห็นเป็นยังไม่ซื้อทั้งที่ซื้อแล้ว', sql: D },
  ]
}
