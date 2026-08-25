import 'server-only'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { buildShippingStageSql } from '@/lib/order-stage-sql'
import { SHIPPING_STAGE_KEYS_ALL } from '@/lib/order-stage'

/**
 * order-list.service — เลือก "หน้าเดียว" ของรายการคำสั่งซื้อที่ฐานข้อมูล (CR 2026-08-25)
 *
 * ── ทำไมคืนแค่ `id` ไม่ใช่ทั้งแถว ────────────────────────────────────────────
 * ปัญหาที่ CR นี้แก้คือ **"enrich และ serialize แถวที่ผู้ใช้ไม่มีวันเห็น"** ไม่ใช่ "query ช้า"
 * (ข้อมูล prod 2026-08-25: ข้อมูลดิบทั้งร้านใหญ่ < 400 KB แต่ payload ที่ข้าม RSC 500–800 KB
 * เพราะ `page.tsx` เติมของอีก 6–7 ก้อนให้ทุกแถว · และ **77% ของแถวตกกอง `DONE`
 * ซึ่งไม่มีชิปหรือไทล์ไหนพาไปดูเลย**)
 *
 * ⇒ พอรู้ว่าหน้านี้ต้องการ id ชุดไหน ก็ปล่อยให้โค้ดเติมข้อมูลเดิมทำงานต่อกับ id แค่ชุดนั้น
 * **ไม่ต้องรื้อโค้ดแปลงข้อมูล ~200 บรรทัดที่ผ่านการใช้งานจริงมาแล้ว** — ผิวสัมผัสของการ
 * เปลี่ยนแปลงเล็กลงมาก ซึ่งสำคัญเพราะหน้านี้เป็นจอหลักของผู้ขาย
 *
 * ── 🛑 กติกา ────────────────────────────────────────────────────────────────
 * - กองงานพัสดุใช้ `buildShippingStageSql()` ซึ่งมีเทสเทียบผลกับ `deriveShippingStage()`
 *   ทุกคอมบิเนชันเป็นด่านอยู่ (`__tests__/order-stage-sql.test.ts`) — ห้ามเขียน CASE เองที่นี่
 * - keyset ไม่ใช่ `OFFSET` — `OFFSET` ช้าลงเรื่อย ๆ ตามหน้าที่ลึก และแถวจะกระโดดถ้ามีออเดอร์
 *   ใหม่เข้ามาระหว่างเปิดหน้า (ผู้ขายเปิดหน้า 3 แล้วเห็นใบซ้ำกับหน้า 2)
 * - เรียงด้วย `(createdAt DESC, id DESC)` เสมอ — `id` ต่อท้ายเพราะ 00033 ให้ผู้ขายเลือกวันที่เอง
 *   ⇒ หลายใบมี `createdAt` เท่ากันเป๊ะได้จริง ถ้าไม่มีตัวตัดสินที่สอง ลำดับจะไม่คงที่ระหว่างหน้า
 */

/** ตัวกรองทุกแกนของหน้า `/orders` — ทุกตัวเป็น optional และรวมกันแบบ AND */
export type OrderListFilters = {
  /** `Order.status` — ไม่ส่ง = ทุกสถานะ */
  status?: string | null
  /** กองงานพัสดุ (`AWAITING_PARCEL` ฯลฯ) — ไม่ส่ง = ทุกกอง */
  stage?: string | null
  /** `Order.type` */
  type?: string | null
  /** ช่วงเวลาแบบวันเจาะจง `YYYY-MM-DD` (เวลาไทย) หรือช่วง [from,to) เป็น ISO */
  createdFrom?: Date | null
  createdTo?: Date | null
}

export type OrderListCursor = { createdAt: Date; id: string } | null

export type OrderListPage = {
  /** id ของออเดอร์ในหน้านี้ เรียงตามลำดับที่ต้องแสดง */
  ids: string[]
  /** ส่งกลับมาเป็น cursor ของหน้าถัดไป — null = หมดแล้ว */
  nextCursor: OrderListCursor
}

/** ชื่อคอลัมน์ที่ใช้ประกอบสูตรกอง — ประกาศครั้งเดียว ใช้ทั้ง query หน้าและ query ตัวนับ */
const STAGE_COLUMNS = {
  orderStatus: 'o."status"',
  hasShipment: 's."id" IS NOT NULL',
  carrierStatus: 's."carrierStatus"',
  paymentMethod: 'o."paymentMethod"',
  codReceivedAt: 'o."codReceivedAt"',
} as const

/**
 * LATERAL หาพัสดุ active ใบล่าสุด
 *
 * 🛑 predicate ต้องตรงกับ `ACTIVE_FORWARD_SHIPMENT` (`src/lib/shipment-direction.ts`) เป๊ะ
 * และตรงกับ partial index `OrderShipment_active_forward_latest_idx` ด้วย — ถ้าไม่ตรง
 * index จะถูกมองข้ามเงียบ ๆ กลายเป็น seq scan โดยที่ผลลัพธ์ยังถูกทุกประการ
 * (พิสูจน์ว่ายังตรงอยู่ได้ด้วย `EXPLAIN` — ต้องเห็น Index Scan และ **ไม่มี Filter ตกค้าง**)
 */
const ACTIVE_SHIPMENT_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT sh."id", sh."carrierStatus"
    FROM "OrderShipment" sh
    WHERE sh."orderId" = o."id"
      AND sh."status" = 'CREATED'
      AND sh."isDryRun" = false
      AND sh."direction" = 'FORWARD'
    ORDER BY sh."createdAt" DESC
    LIMIT 1
  ) s ON true`

function whereFragments(shopId: string, f: OrderListFilters): Prisma.Sql[] {
  const parts: Prisma.Sql[] = [Prisma.sql`o."shopId" = ${shopId}`]
  if (f.status) parts.push(Prisma.sql`o."status" = ${f.status}`)
  if (f.type) parts.push(Prisma.sql`o."type" = ${f.type}`)
  if (f.createdFrom) parts.push(Prisma.sql`o."createdAt" >= ${f.createdFrom}`)
  if (f.createdTo) parts.push(Prisma.sql`o."createdAt" < ${f.createdTo}`)
  return parts
}

/** `AND` ต่อกัน — ว่างไม่ได้เพราะมี `shopId` เป็นอย่างน้อยเสมอ (ห้ามคืน query ที่ไม่ scope ร้าน) */
function andAll(parts: Prisma.Sql[]): Prisma.Sql {
  return parts.reduce((acc, p, i) => (i === 0 ? p : Prisma.sql`${acc} AND ${p}`))
}

/**
 * หนึ่งหน้าของรายการ — คืนเฉพาะ `id` ตามลำดับที่ต้องแสดง
 *
 * @param limit จำนวนแถวต่อหน้า (ดึงเกินมา 1 แถวเพื่อรู้ว่ามีหน้าถัดไปไหม โดยไม่ต้อง count)
 */
export async function listShopOrderIds(
  shopId: string,
  filters: OrderListFilters = {},
  cursor: OrderListCursor = null,
  limit = 20,
): Promise<OrderListPage> {
  const stageSql = buildShippingStageSql(STAGE_COLUMNS)
  const parts = whereFragments(shopId, filters)

  // keyset: เอาแถวที่ "เก่ากว่า" cursor — เทียบเป็น tuple เพื่อให้ตรงกับลำดับ (createdAt, id)
  if (cursor) {
    parts.push(
      Prisma.sql`(o."createdAt", o."id") < (${cursor.createdAt}, ${cursor.id})`,
    )
  }

  const stageFilter = filters.stage
    ? Prisma.sql` AND (${Prisma.raw(stageSql)}) = ${filters.stage}`
    : Prisma.empty

  const rows = await prisma.$queryRaw<{ id: string; createdAt: Date }[]>(Prisma.sql`
    SELECT o."id", o."createdAt"
    FROM "Order" o
    ${Prisma.raw(ACTIVE_SHIPMENT_LATERAL)}
    WHERE ${andAll(parts)}${stageFilter}
    ORDER BY o."createdAt" DESC, o."id" DESC
    LIMIT ${limit + 1}
  `)

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]
  return {
    ids: page.map((r) => r.id),
    nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
  }
}

/**
 * จำนวนออเดอร์ต่อกองงานพัสดุ — **นับด้วยเกณฑ์เดียวกับที่ `listShopOrderIds` ใช้กรอง**
 *
 * 🛑 นี่คือข้อที่ CLAUDE.md เตือนตรง ๆ ว่า "ห้ามนับด้วย SQL แล้วกรองด้วย TS (จะกดเลข 5
 * เข้าไปเจอ 4)" — ตัวนับกับตัวกรองจึงต้องอ่านสูตรจาก `buildShippingStageSql()` ตัวเดียวกัน
 * และรับ `filters` ชุดเดียวกัน (ยกเว้น `stage` เอง ซึ่งเป็นแกนที่กำลังนับ)
 */
export async function countShopOrdersByStage(
  shopId: string,
  filters: Omit<OrderListFilters, 'stage'> = {},
): Promise<Record<string, number>> {
  const stageSql = buildShippingStageSql(STAGE_COLUMNS)
  const parts = whereFragments(shopId, filters)

  const rows = await prisma.$queryRaw<{ stage: string; n: bigint }[]>(Prisma.sql`
    SELECT (${Prisma.raw(stageSql)}) AS stage, count(*)::bigint AS n
    FROM "Order" o
    ${Prisma.raw(ACTIVE_SHIPMENT_LATERAL)}
    WHERE ${andAll(parts)}
    GROUP BY 1
  `)

  // เริ่มจาก 0 ทุกกองเสมอ — กองที่ไม่มีแถวต้องขึ้น 0 ไม่ใช่หายไปจากชิป
  const counts: Record<string, number> = {}
  for (const key of SHIPPING_STAGE_KEYS_ALL) counts[key] = 0
  for (const r of rows) counts[r.stage] = Number(r.n)
  return counts
}
