/**
 * order-search-sql — สูตรค้นหาในหน้ารายการคำสั่งซื้อ ฉบับ SQL (CR 2026-08-25 · D-2)
 *
 * pure module — สร้างแค่ *ข้อความ SQL + พารามิเตอร์* ไม่ได้ยิงอะไรเอง
 *
 * ── ทำไมต้องมีฉบับที่สอง ────────────────────────────────────────────────────
 * ตัวจริงคือ `searchOrders()` ใน `order-search.ts` ซึ่งทำงานบนอาร์เรย์ที่โหลดมาแล้ว
 * แต่พอหน้า `/orders` แบ่งหน้าที่ฐานข้อมูล **การค้นหาต้องย้ายไปพร้อมกันเสมอ** —
 * ถ้าแบ่งหน้าที่ server แล้วค้นที่ client ผู้ใช้จะ **ค้นเจอแค่หน้าที่เปิดอยู่**
 * ซึ่งแย่กว่าตอนก่อนทำ 00058 (R-2 ในเอกสาร CR)
 *
 * ── 🛑 กติกาที่ห้ามละเมิด ──────────────────────────────────────────────────
 * 1. **กติกาการจับคู่ต้องตรงกับ `order-search.ts` ทุกข้อ** — หลายคำ = AND · คนละคำตรง
 *    คนละฟิลด์ได้ · substring · ไม่สนตัวพิมพ์ · คำตัวเลขได้สิทธิ์ *เพิ่ม* (ไม่ใช่แทน) ·
 *    คำที่มีตัวอักษรห้ามถูกตัดสัญลักษณ์ · `shortCode` ตรงเต็มค่าเท่านั้น
 * 2. **ตัวตัดคำต้องเรียก `tokenizeSearchQuery()` ตัวเดียวกัน** ห้ามเขียน split เอง —
 *    กฎ "เบอร์ที่ก็อปมาพร้อมช่องว่าง = คำเดียว" อยู่ในนั้น
 * 3. **มีเทสเทียบผลสองฝั่งเป็นด่าน** (`__tests__/order-search-sql.test.ts`)
 *
 * ── เลขคำสั่งซื้อ: derive ใน SQL ไม่ใช่อ่านคอลัมน์ ────────────────────────
 * `Order.orderNo` มี index และ prod ไม่มีแถว NULL แล้ว **แต่ยังมี 3 แถวที่ค่าไม่ตรงกับที่
 * หน้าจอแสดง** (seed `DEMO-000x`) และหน้าจอ **คำนวณสดเสมอ** ⇒ ถ้าค้นจากคอลัมน์
 * ผู้ใช้จะค้นเลขที่ตัวเองเห็นแล้วไม่เจอ ซึ่งเป็นบั๊กที่ 00058 เพิ่งแก้ไปในทิศตรงข้าม
 * ⇒ derive ใน SQL ให้ตรงกับ `formatOrderNo()` แทน — ไม่มีทาง drift ได้เลยตามนิยาม
 * (แลกกับการที่ index บน `orderNo` ช่วยไม่ได้ ซึ่งยอมรับได้: ผู้ขายมักค้นด้วยท่อนท้าย
 * ไม่ใช่เลขเต็ม และ `publicToken` มี unique index อยู่แล้ว)
 */

import { isNumericSearchToken, searchDigitsOnly, tokenizeSearchQuery } from './order-search'

/** ชื่อ alias ของตารางที่ผู้เรียกใช้ */
export type SearchSqlAliases = {
  /** alias ของ `Order` */
  order: string
  /** alias ของพัสดุ active ใบล่าสุด (LATERAL) — ใช้หาเลขพัสดุฝั่ง iShip */
  shipment: string
  /** alias ของ `ShipmentTracking` (เลขที่ร้านแจ้งเอง) */
  tracking: string
  /**
   * alias ของ `User` ที่ผูกกับออเดอร์ (`Order.buyerUserId`)
   * 🛑 `buyerUsername` **ไม่ใช่คอลัมน์บน `Order`** — มันคือ `buyer.username` ของผู้ใช้ที่สมัครแล้ว
   * (ด่านเทียบผลจับข้อนี้ได้ทันทีด้วย error `column o.buyerUsername does not exist`)
   */
  buyerUser: string
}

/**
 * เลขคำสั่งซื้อฉบับ SQL — ต้องให้ผลเท่ากับ `formatOrderNo(publicToken, createdAt)`
 * = `DP` + ปีพ.ศ.(4) + เดือน(2) + 8 ตัวแรกของ publicToken ตัวใหญ่ · ปี/เดือนคิดตามเวลาไทย
 */
export function orderNoSql(order: string): string {
  /**
   * 🛑 ต้องแปลงสองขั้น: `AT TIME ZONE 'UTC'` ก่อน แล้วค่อย `AT TIME ZONE 'Asia/Bangkok'`
   *
   * `Order.createdAt` เป็น `timestamp **without** time zone` ที่เก็บเวลา UTC ไว้ ⇒ การเขียน
   * `x AT TIME ZONE 'Asia/Bangkok'` ตรง ๆ แปลว่า *"ตีความ x ว่าเป็นเวลาไทย แล้วแปลงเป็น UTC"*
   * ซึ่ง **ตรงข้ามกับที่ต้องการ** และเพี้ยนไป 7 ชั่วโมง
   *
   * ผลจริงที่ด่านจับได้ตอนเขียน: ออเดอร์ที่สร้าง `2026-08-01 06:48 UTC` (= 13:48 ไทย
   * วันที่ 1 ส.ค.) ถูกคิดเป็น 31 ก.ค. ⇒ ได้เลข `DP256907…` ขณะที่หน้าจอแสดง `DP256908…`
   * ⇒ ผู้ขายค้นเลขที่ตัวเองเห็นแล้วไม่เจอ **เฉพาะออเดอร์ที่สร้างช่วง 00:00–07:00 UTC
   * ของวันที่ 1 ของเดือน** — เคสที่หายากพอจะรอดสายตาไปได้นานมาก
   *
   * คลาสเดียวกับบั๊กที่ CLAUDE.md บันทึกไว้แล้ว ("ออเดอร์ช่วง 00:00–07:00 น. ตกไปนับเป็น
   * วันก่อนหน้า" — feature 00033 เคยแก้ที่ /sales และ /orders มาแล้ว)
   */
  const bkk = `(${order}."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok')`
  return (
    `('DP' || lpad((extract(year from ${bkk})::int + 543)::text, 4, '0')` +
    ` || lpad(extract(month from ${bkk})::int::text, 2, '0')` +
    ` || upper(left(${order}."publicToken", 8)))`
  )
}

/** ตัดอักขระที่ไม่ใช่ตัวเลขออก — คู่กับ `searchDigitsOnly()` ฝั่ง TypeScript */
function digitsOnlySql(expr: string): string {
  return `regexp_replace(coalesce(${expr}, ''), '[^0-9]', '', 'g')`
}

export type SearchSql = {
  /** เงื่อนไขที่เอาไปต่อใน `WHERE` — `null` = คำค้นสั้นเกินเกณฑ์ ไม่ต้องกรอง */
  where: string | null
  /** พารามิเตอร์เรียงตามลำดับ `$1, $2, …` ที่ปรากฏใน `where` */
  params: string[]
}

/**
 * สร้างเงื่อนไขค้นหา
 *
 * 🛑 ใช้พารามิเตอร์ (`$n`) สำหรับ **ทุกค่าที่มาจากผู้ใช้** ไม่ต่อสตริงเข้า SQL ตรง ๆ
 * (คำค้นเป็น input ที่ผู้ใช้พิมพ์เอง — ต่อสตริงคือช่อง SQL injection)
 */
export function buildOrderSearchSql(
  query: string,
  a: SearchSqlAliases,
  paramOffset = 0,
): SearchSql {
  const tokens = tokenizeSearchQuery(query)
  if (tokens.length === 0) return { where: null, params: [] }

  const params: string[] = []
  const p = (value: string) => {
    params.push(value)
    return `$${paramOffset + params.length}`
  }

  /**
   * เลขพัสดุ — **รวมสองแหล่งด้วย COALESCE ให้ iShip ชนะ ไม่ใช่ OR สองคอลัมน์**
   *
   * 🛑 ฝั่ง TypeScript รับมาเป็นฟิลด์เดียวที่ `page.tsx` รวมไว้แล้ว (iShip ชนะเมื่อมีทั้งคู่ —
   * `docs/conventions/one-value-many-entry-points.md`) ถ้า SQL เขียนเป็น `OR` ใบที่มีทั้ง
   * เลข iShip และเลขที่ร้านแจ้งเอง **และสองเลขนั้นต่างกัน** จะถูก SQL หาเจอด้วยเลขที่ TS
   * มองไม่เห็น ⇒ สองฝั่งให้ผลไม่ตรงกันเฉพาะเคสนั้น ซึ่งหายากพอที่จะรอดสายตาไปได้นาน
   */
  const trackingNo = (s: string, t: string) => `coalesce(${s}."trackingNo", ${t}."trackingNo")`

  /** ฟิลด์ตัวหนังสือ — ตรงกับ `textFieldsOf()` ใน order-search.ts ตัวต่อตัว */
  const textFields = (o: string, s: string, t: string) => [
    orderNoSql(o),
    `left(${o}."publicToken", 8)`,
    `${o}."buyerName"`,
    `${a.buyerUser}."username"`,
    `${o}."buyerContact"`,
    trackingNo(s, t),
  ]

  /** ฟิลด์ที่คำตัวเลขเทียบแบบตัดสัญลักษณ์ได้ — ตรงกับ `numericFieldsOf()` */
  const numericFields = (o: string, s: string, t: string) => [
    orderNoSql(o),
    `left(${o}."publicToken", 8)`,
    `${o}."buyerContact"`,
    trackingNo(s, t),
  ]

  const clauses = tokens.map((token) => {
    const parts: string[] = []
    const like = p(`%${token.replace(/[\\%_]/g, (m) => `\\${m}`)}%`)

    for (const f of textFields(a.order, a.shipment, a.tracking)) {
      parts.push(`coalesce(${f}, '') ILIKE ${like}`)
    }
    // ชื่อสินค้าอยู่คนละตาราง — ใช้ EXISTS ไม่ใช่ join กันแถวซ้ำเมื่อใบหนึ่งมีหลายรายการ
    parts.push(
      `EXISTS (SELECT 1 FROM "OrderItem" oi WHERE oi."orderId" = ${a.order}."id" AND oi."name" ILIKE ${like})`,
    )
    // รหัสสั้น — **ตรงเต็มค่าเท่านั้น** (ไม่เคยแสดงบนจอ ถ้าตรงบางส่วนจะได้ผลที่อธิบายไม่ได้)
    parts.push(`lower(coalesce(${a.order}."shortCode", '')) = lower(${p(token)})`)

    if (isNumericSearchToken(token)) {
      const digits = p(`%${searchDigitsOnly(token)}%`)
      for (const f of numericFields(a.order, a.shipment, a.tracking)) {
        parts.push(`${digitsOnlySql(f)} LIKE ${digits}`)
      }
    }
    return `(${parts.join(' OR ')})`
  })

  return { where: clauses.join(' AND '), params }
}

/**
 * เงื่อนไข "ตรงเต็มค่าของตัวระบุเฉพาะ" — ใช้จัดให้ลอยขึ้นบนสุด (D-10 ของ 00058)
 * ต้องตรงกับ `isExactIdentifierMatch()` ฝั่ง TypeScript
 */
export function buildExactMatchSql(
  query: string,
  a: SearchSqlAliases,
  paramOffset = 0,
): SearchSql {
  const q = query.trim()
  if (!q) return { where: null, params: [] }

  const params: string[] = []
  const p = (value: string) => {
    params.push(value)
    return `$${paramOffset + params.length}`
  }

  const lower = p(q.toLowerCase())
  const parts = [
    `lower(${orderNoSql(a.order)}) = ${lower}`,
    `lower(left(${a.order}."publicToken", 8)) = ${lower}`,
    `lower(coalesce(${a.order}."shortCode", '')) = ${lower}`,
    `lower(coalesce(${a.shipment}."trackingNo", ${a.tracking}."trackingNo", '')) = ${lower}`,
  ]
  if (isNumericSearchToken(q)) {
    const digits = searchDigitsOnly(q)
    if (digits) {
      parts.push(`${digitsOnlySql(`${a.order}."buyerContact"`)} = ${p(digits)}`)
    }
  }
  return { where: `(${parts.join(' OR ')})`, params }
}
