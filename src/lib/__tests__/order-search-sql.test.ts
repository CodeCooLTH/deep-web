import { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

import { formatOrderNo } from '../order-no'
import { searchOrders, type SearchableOrder } from '../order-search'
import { buildOrderSearchSql, orderNoSql } from '../order-search-sql'

/**
 * ด่านเทียบผล "ค้นหาที่ SQL" กับ "ค้นหาที่ TypeScript" (CR 2026-08-25 · D-2)
 *
 * 🛑 นี่คือด่านที่ทำให้ย้ายการค้นหาไป server ได้อย่างปลอดภัย — ไม่ใช่คอมเมนต์
 * กติกาการจับคู่ของ 00058 มี 8 ข้อ (AND ข้ามฟิลด์ · substring · ตัดสัญลักษณ์เฉพาะคำตัวเลข ·
 * รหัสสั้นตรงเต็มค่า · ฯลฯ) ถ้าสองฝั่งเลื่อนออกจากกันแม้ข้อเดียว ผู้ขายจะค้นเจอไม่เท่ากัน
 * ระหว่างก่อน/หลังเปลี่ยน โดยไม่มีอะไรฟ้อง
 *
 * 🛑 `SELECT` อย่างเดียว ไม่เขียนอะไร · fail-closed ถ้า connection ไม่ใช่ localhost (HR13/14)
 */

const DB_URL = process.env.DATABASE_URL ?? ''
const CAN_RUN = Boolean(DB_URL) && /@(localhost|127\.0\.0\.1)[:/]/.test(DB_URL)

const prisma = CAN_RUN ? new PrismaClient() : null
afterAll(async () => {
  await prisma?.$disconnect()
})

const ALIASES = { order: 'o', shipment: 's', tracking: 't', buyerUser: 'bu' }

const LATERAL_AND_TRACKING = `
  LEFT JOIN LATERAL (
    SELECT sh."trackingNo"
    FROM "OrderShipment" sh
    WHERE sh."orderId" = o."id"
      AND sh."status" = 'CREATED' AND sh."isDryRun" = false AND sh."direction" = 'FORWARD'
    ORDER BY sh."createdAt" DESC LIMIT 1
  ) s ON true
  LEFT JOIN "ShipmentTracking" t ON t."orderId" = o."id"
  LEFT JOIN "User" bu ON bu."id" = o."buyerUserId"`

/** ดึงทุกออเดอร์ในรูปที่ `searchOrders()` ต้องการ — ตรงกับที่ `page.tsx` ประกอบให้ client */
async function loadAll(): Promise<SearchableOrder[]> {
  const rows = await prisma!.$queryRawUnsafe<
    {
      id: string
      publicToken: string
      shortCode: string | null
      createdAt: Date
      buyerName: string | null
      buyerUsername: string | null
      buyerContact: string | null
      trackingNo: string | null
      itemNames: string[] | null
    }[]
  >(`
    SELECT o."id", o."publicToken", o."shortCode", o."createdAt",
           o."buyerName", bu."username" AS "buyerUsername", o."buyerContact",
           coalesce(s."trackingNo", t."trackingNo") AS "trackingNo",
           (SELECT array_agg(oi."name") FROM "OrderItem" oi WHERE oi."orderId" = o."id") AS "itemNames"
    FROM "Order" o
    ${LATERAL_AND_TRACKING}
  `)
  return rows.map((r) => ({
    // `id` ในรูปที่ client เห็นคือ publicToken 8 ตัวแรก ไม่ใช่ Order.id
    id: r.publicToken.slice(0, 8),
    publicToken: r.publicToken,
    shortCode: r.shortCode,
    createdAtISO: r.createdAt.toISOString(),
    buyerName: r.buyerName,
    buyerUsername: r.buyerUsername,
    buyerPhone: r.buyerContact,
    shipment: r.trackingNo ? { trackingNo: r.trackingNo } : null,
    items: (r.itemNames ?? []).map((name) => ({ name })),
  }))
}

async function sqlSearch(query: string): Promise<string[]> {
  const built = buildOrderSearchSql(query, ALIASES)
  if (!built.where) return []
  const rows = await prisma!.$queryRawUnsafe<{ publicToken: string }[]>(
    `SELECT o."publicToken" FROM "Order" o ${LATERAL_AND_TRACKING} WHERE ${built.where}`,
    ...built.params,
  )
  return rows.map((r) => r.publicToken.slice(0, 8)).sort()
}

describe('ค้นหา — SQL ต้องได้ผลชุดเดียวกับ TypeScript บนข้อมูลจริง', () => {
  it('[blocker] เลขคำสั่งซื้อที่ derive ใน SQL ต้องเท่ากับ formatOrderNo() ทุกแถว', async () => {
    if (!CAN_RUN) {
      console.warn('[order-search-sql] ข้าม: ต้องมี DATABASE_URL ชี้ localhost')
      expect(CAN_RUN).toBe(false)
      return
    }
    /**
     * 🛑 ตัวนี้ต้องผ่านก่อนทุกอย่าง — ถ้าเลขที่ SQL คิดไม่ตรงกับที่หน้าจอแสดง ผู้ขายจะค้น
     * เลขที่ตัวเองเห็นแล้วไม่เจอ · ที่ต้อง derive แทนอ่านคอลัมน์ `orderNo` เพราะคอลัมน์นั้น
     * drift ได้ (prod มี 3 แถวที่ไม่ตรง — seed `DEMO-000x`)
     */
    const rows = await prisma!.$queryRawUnsafe<
      { publicToken: string; createdAt: Date; sql_no: string }[]
    >(`SELECT o."publicToken", o."createdAt", ${orderNoSql('o')} AS sql_no FROM "Order" o`)
    const bad = rows
      .filter((r) => formatOrderNo(r.publicToken, r.createdAt) !== r.sql_no)
      .map((r) => `${r.publicToken}: TS=${formatOrderNo(r.publicToken, r.createdAt)} SQL=${r.sql_no}`)
    expect(bad).toEqual([])
  }, 60_000)

  it('[blocker] ผลค้นหาตรงกันทุกคำค้น', async () => {
    if (!CAN_RUN) {
      expect(CAN_RUN).toBe(false)
      return
    }
    const all = await loadAll()
    if (all.length === 0) {
      console.warn('[order-search-sql] ฐาน dev ไม่มีออเดอร์ — เทสนี้ผ่านแบบไม่ได้ตรวจอะไร')
    }

    /**
     * คำค้นที่ต้องครอบ **ทุกกติกา** ของ 00058 ไม่ใช่แค่คำที่บังเอิญมีในฐาน
     * (`mutation-silence-means-weak-corpus.md` — ชุดที่อ่อนทำให้ mutation เงียบ)
     * ประกอบจากค่าจริงในฐาน + คำที่จงใจไม่มีใครตรง เพื่อให้ทั้งสองฝั่งต้องตอบ "ไม่เจอ" เหมือนกัน
     */
    const sample = all[0]
    /**
     * 🛑 ต้องหยิบใบที่ "มีค่าจริง" ของแต่ละฟิลด์ ไม่ใช่ใบแรกเสมอ — `all[0]` อาจไม่มีรหัสสั้น
     * เลย (ฐาน dev มีแค่ 3/65 ใบที่มี) แล้วคำค้นของฟิลด์นั้นจะกลายเป็นค่าสมมติที่ไม่มีใครตรง
     * ⇒ mutation ของฟิลด์นั้นเงียบ (พิสูจน์แล้ว: เปลี่ยนรหัสสั้นเป็น substring แล้วเทสยังเขียว)
     */
    const withShortCode = all.find((o) => o.shortCode)
    const withTracking = all.find((o) => o.shipment?.trackingNo)
    const withItem = all.find((o) => o.items[0]?.name)
    const withPhone = all.find((o) => (o.buyerPhone ?? '').replace(/\D/g, '').length >= 4)

    const queries = [
      // รหัสสั้น **บางส่วน** — ต้องไม่เจอ (ตรงเต็มค่าเท่านั้น) · ตัวที่จับ mutation W2
      ...(withShortCode ? [withShortCode.shortCode!.slice(0, 4), withShortCode.shortCode!] : []),
      ...(withTracking ? [withTracking.shipment!.trackingNo!.slice(-5)] : []),
      ...(withItem ? [withItem.items[0].name.slice(0, 3)] : []),
      ...(withPhone ? [withPhone.buyerPhone!.replace(/\D/g, '').slice(-4)] : []),
      'DP',
      sample ? sample.id.slice(0, 4) : 'abcd',
      sample?.buyerName?.slice(0, 3) ?? 'สม',
      sample?.buyerPhone?.replace(/\D/g, '').slice(-4) ?? '5678',
      sample?.shortCode ?? 'ZZ99YY88',
      sample?.items[0]?.name?.slice(0, 3) ?? 'เสื้อ',
      sample?.shipment?.trackingNo ?? 'TH0665398112',
      '081 234 5678',
      '081-234-5678',
      'ไม่มีทางตรงกับอะไรเลย',
      'DP2569',
      'สม 08',
    ].filter((q) => q.trim().length >= 2)

    const mismatches: string[] = []
    for (const q of queries) {
      const fromTs = searchOrders(all, q)
        .map((h) => h.order.id)
        .sort()
      const fromSql = await sqlSearch(q)
      if (JSON.stringify(fromTs) !== JSON.stringify(fromSql)) {
        mismatches.push(
          `"${q}" → TS(${fromTs.length})=[${fromTs.join(',')}] SQL(${fromSql.length})=[${fromSql.join(',')}]`,
        )
      }
    }
    expect(mismatches).toEqual([])
  }, 120_000)
})
