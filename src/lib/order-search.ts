/**
 * order-search — SSOT ของ "ค้นหาในหน้ารายการคำสั่งซื้อ" (feature 00058)
 *
 * pure module — ห้าม import prisma/server-only (เรียกจากทั้งการ์ดมือถือและตารางเดสก์ท็อป)
 * สถาปัตยกรรมยกมาจาก `order-date-filter.ts` ด้วยเหตุผลเดียวกันเป๊ะ
 *
 * ── ทำไมต้องมีไฟล์นี้ ──────────────────────────────────────────────────────────
 * ก่อนหน้านี้หน้า /orders มีช่องค้นหา **2 ตัวที่เป็นคนละตรรกะ**:
 *   - มือถือ (`OrdersList.tsx`) เขียนมือ ค้น 4 ฟิลด์ และหนึ่งในนั้นคือ `o.buyer`
 *     ซึ่งเป็น **contact ที่ถูกปิดบังไว้แล้ว** (`••••••5678`) ⇒ พิมพ์ `081234` ไม่มีวันเจอ
 *     ทั้งที่ placeholder เขียนไว้เองว่าค้นเบอร์ได้ (จอโกหกผู้ใช้มาตลอด)
 *   - เดสก์ท็อป (`OrdersTable.tsx`) ใช้ `globalFilterFn: 'includesString'` ของ TanStack
 *     ซึ่งไล่เฉพาะคอลัมน์ที่มี accessor และแปลง value เป็นสตริง ⇒ คอลัมน์ `items`
 *     (array ของ object) กลายเป็น `[object Object]` = ค้นชื่อสินค้าไม่ได้ แต่พิมพ์คำว่า
 *     `object` แล้วตรงทุกใบ
 * คำค้นเดียวกันจึงให้ผลไม่เท่ากันระหว่างสองจอ — คลาสบั๊กที่รีโปนี้เจอซ้ำหลายรอบ
 * (`docs/conventions/sibling-surface-parity.md` + Hard Rule 16)
 *
 * ── ความสัมพันธ์กับ `phone.ts` (Hard Rule 16 — อ่านก่อนแก้) ──────────────────
 * `digitsOnly()` ในไฟล์นี้ **ไม่ใช่** นิยามเบอร์โทรตัวที่สามของระบบ และห้ามถูกใช้เป็น
 * ตัวตัดสินว่า "ค่านี้เป็นเบอร์ที่ถูกต้องไหม" — นั่นคืองานของ `MOBILE_PHONE_RE`
 * (ด่านขาเข้า) และ `normalizePhone()` (ตัวตีความข้อมูลเก่า) ใน `src/lib/phone.ts`
 * ตัวนี้ตอบคนละคำถาม: *"ผู้ใช้พิมพ์ตัวเลขชุดนี้มา มันโผล่อยู่ในค่าที่เก็บไว้ไหม"*
 * จึงต้องหลวมกว่าทั้งคู่โดยเจตนา (ใช้กับเลขพัสดุและเลขคำสั่งซื้อด้วย ซึ่งไม่ใช่เบอร์เลย)
 * และ **ห้ามคืน null เมื่อรูปแบบไม่ตรง** — คำค้นที่ยังพิมพ์ไม่จบต้องค้นได้ระหว่างพิมพ์
 */

import { formatOrderNo } from './order-no'

/**
 * ต่ำกว่านี้ไม่กรอง — 1 ตัวอักษรจะตรงเกือบทุกใบในชุดฟิลด์นี้ ซึ่งอ่านเหมือนช่องค้นหาพัง
 * เกณฑ์เดียวกับ `CustomerSearchSheet` ที่ใช้อยู่ก่อนแล้ว (ไม่ใช่ตัวเลขที่คิดขึ้นใหม่)
 */
export const ORDER_SEARCH_MIN_CHARS = 2

/**
 * รูปร่างที่ฟังก์ชันนี้ต้องการ — structural typing แคบ ๆ ไม่ import `OrderRow` ตรง ๆ
 * เพื่อให้เทสสร้างของปลอมได้โดยไม่ต้องแต่ง 26 ฟิลด์ และให้หน้าอื่นหยิบไปใช้ได้ทีหลัง
 */
export type SearchableOrder = {
  /** publicToken 8 ตัวแรก — โผล่บนจอในรูปเลขคำสั่งซื้อท่อนท้าย */
  id: string
  publicToken: string
  /** รหัสสั้นสำหรับแชร์ลิงก์ — ผู้ขายก็อปจากแชทกลับมาวางได้ (null = ออเดอร์ก่อน backfill) */
  shortCode: string | null
  /** ใช้ derive เลขคำสั่งซื้อ — 🛑 ผู้ขายแก้วันที่ได้ (00033) เลขจึงเปลี่ยนตาม ห้าม cache */
  createdAtISO: string
  buyerName: string | null
  buyerUsername: string | null
  /** เบอร์จริงไม่ปิดบัง — **ห้ามส่ง `OrderRow.buyer` มาแทน** นั่นคือค่าที่ถูกปิดบังแล้ว */
  buyerPhone: string | null
  /** null = ยังไม่มีพัสดุ · undefined = ร้านที่ไม่ใช่ ONLINE_SALES (ไม่มีแกนนี้เลย) */
  shipment?: { trackingNo: string | null } | null
  items: { name: string }[]
}

export type OrderSearchHit<T extends SearchableOrder> = {
  order: T
  /**
   * ตรง "เต็มค่า" ของตัวระบุเฉพาะ — ใบนี้ถูกยกขึ้นบนสุด
   * ไม่ใช่คะแนนความคล้าย: เป็น boolean ที่อธิบายให้ผู้ใช้ฟังได้ในประโยคเดียว
   */
  isExactMatch: boolean
  /**
   * ดัชนีของสินค้าที่ตรงกับคำค้น — จอที่ยุบรายการสินค้าไว้ใช้ค่านี้ตัดสินว่าต้องกางไหม
   * (ตรงในของที่ซ่อนอยู่แล้วไม่กาง = ใบโผล่มาโดยผู้ใช้หาไม่เจอว่าตรงตรงไหน)
   */
  matchedItemIndexes: number[]
}

/**
 * เหลือเฉพาะตัวเลข — ดูหมายเหตุ Hard Rule 16 ที่หัวไฟล์ก่อนนำไปใช้ที่อื่น
 *
 * export เพราะตัวไฮไลต์บนจอต้องตัดสินด้วยเกณฑ์เดียวกับตัวกรองเป๊ะ ๆ ไม่งั้นจะเกิดสภาพ
 * "ใบนี้โผล่มาแต่ไม่มีอะไรถูกไฮไลต์" ซึ่งอ่านเหมือนระบบกรองมั่ว
 */
export function searchDigitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

const digitsOnly = searchDigitsOnly

/** คำค้นที่ "พูดถึงตัวเลข" — ตัดสินหลังตัดสัญลักษณ์ เพื่อให้ `081-234` นับเป็นตัวเลข */
export function isNumericSearchToken(token: string): boolean {
  return isNumericToken(token)
}

function isNumericToken(token: string): boolean {
  const digits = digitsOnly(token)
  return digits.length > 0 && digits.length === token.replace(/[\s\-._()+]/g, '').length
}

/** เลขคำสั่งซื้อที่ผู้ขายเห็นบนจอ — derive สดเสมอ ตัวเดียวกับที่การ์ด/แถวเรนเดอร์ */
function orderNoOf(order: SearchableOrder): string {
  return formatOrderNo(order.publicToken, order.createdAtISO)
}

/**
 * ค่าทั้งหมดที่คำค้น "ตัวหนังสือ" มีสิทธิ์ตรงได้ — ที่อยู่/หมายเหตุ/ช่องทางไม่อยู่ในนี้
 * โดยเจตนา (D-2): เป็นข้อความยาวที่จะลากผลลัพธ์เกินจนผู้ใช้เลิกเชื่อช่องค้นหา
 */
function textFieldsOf(order: SearchableOrder): string[] {
  const fields = [
    orderNoOf(order),
    order.id,
    order.buyerName ?? '',
    order.buyerUsername ?? '',
    order.buyerPhone ?? '',
    order.shipment?.trackingNo ?? '',
  ]
  for (const item of order.items) fields.push(item.name)
  return fields.filter(Boolean)
}

/**
 * ค่าที่คำค้น "ตัวเลขล้วน" เทียบแบบตัดสัญลักษณ์ได้
 *
 * 🛑 ต้องรวมเลขคำสั่งซื้อและเลขพัสดุด้วย ไม่ใช่แค่เบอร์ — ผู้ขายก็อปเลขพัสดุมาจากแชท
 * มักติดช่องว่าง และเลขคำสั่งซื้อมีตัวอักษรคั่นหน้า (`DP2569…`) การพิมพ์เฉพาะท่อนตัวเลข
 * เป็นพฤติกรรมปกติ ไม่ใช่เคสขอบ
 */
function numericFieldsOf(order: SearchableOrder): string[] {
  return [orderNoOf(order), order.id, order.buyerPhone ?? '', order.shipment?.trackingNo ?? '']
    .filter(Boolean)
    .map(digitsOnly)
    .filter(Boolean)
}

/**
 * ตัดคำด้วยช่องว่าง — คำว่างถูกทิ้ง (คำค้นที่มีช่องว่างหัวท้าย/ซ้อนกันต้องไม่เปลี่ยนผล)
 *
 * 🛑 ข้อยกเว้น: คำค้นที่ "ทั้งก้อนเป็นตัวเลข+ตัวคั่น" ถือเป็น **คำเดียว** ไม่ใช่หลายคำ
 * เบอร์/เลขพัสดุที่ก็อปมาจากแชทมีช่องว่างคั่นเป็นเรื่องปกติ (`081 234 5678`) — ถ้าหั่นเป็น
 * `081`/`234`/`5678` แล้ว AND ทีละท่อน ใบที่บังเอิญมี `081` ในเบอร์ `234` ในชื่อสินค้า และ
 * `5678` ในเลขพัสดุ จะตรงด้วย ทั้งที่ไม่มีอะไรเกี่ยวกับเบอร์ที่ผู้ใช้พิมพ์เลยสักตัว
 * (เทสจับได้ตอนเขียน: `081 234 5678` เคยลากใบที่เบอร์ลงท้าย `...56780` ติดมาด้วย)
 */
export function tokenizeSearchQuery(query: string): string[] {
  const trimmed = query.trim()
  if (isNumericToken(trimmed)) return [trimmed]
  return trimmed.split(/\s+/).filter(Boolean)
}

const tokenize = tokenizeSearchQuery

/**
 * คำนี้ตรงกับใบนี้ไหม — คนละคำตรงคนละฟิลด์ได้ (D-5)
 *
 * คำที่เป็นตัวเลขล้วนได้สิทธิ์เพิ่ม (เทียบกับค่าที่ตัดสัญลักษณ์แล้ว) **ไม่ใช่สิทธิ์แทน** —
 * ยังต้องเทียบกับฟิลด์ตัวหนังสือด้วย ไม่งั้นสินค้าชื่อ "เสื้อ 250" จะหาด้วย `250` ไม่เจอ
 */
function tokenMatches(order: SearchableOrder, token: string): boolean {
  const lower = token.toLowerCase()
  if (textFieldsOf(order).some((f) => f.toLowerCase().includes(lower))) return true
  /**
   * 🛑 รหัสสั้นตรงแบบ "เต็มค่าเท่านั้น" ไม่ใช่ substring — ต่างจากฟิลด์อื่นโดยเจตนา
   *
   * เพราะมันเป็นฟิลด์เดียวในชุดที่ **ไม่เคยถูกแสดงบนจอเลยสักที่** ถ้าให้ตรงแบบบางส่วนได้
   * ใบจะโผล่ขึ้นมาโดยไม่มีอะไรบนจอถูกไฮไลต์ = ผลลัพธ์ที่ผู้ใช้อธิบายไม่ได้ว่ามาจากไหน
   * พอบังคับให้เต็มค่า ทุกการตรงจะเข้าเงื่อนไข `isExactIdentifierMatch` ⇒ ได้ ring เป็นสัญญาณเสมอ
   * (ผู้ขายก็อปรหัสจากลิงก์มาวางทั้งก้อนอยู่แล้ว การพิมพ์บางส่วนไม่ใช่พฤติกรรมจริง)
   */
  if (order.shortCode && order.shortCode.toLowerCase() === lower) return true
  if (isNumericToken(token)) {
    const digits = digitsOnly(token)
    return numericFieldsOf(order).some((f) => f.includes(digits))
  }
  return false
}

/** สินค้าชิ้นไหนในใบที่ตรงกับคำค้นบ้าง — ต้องตรง "ทุกคำ" เหมือนเกณฑ์ของทั้งใบ */
function matchedItemIndexes(order: SearchableOrder, tokens: string[]): number[] {
  const out: number[] = []
  order.items.forEach((item, i) => {
    const name = item.name.toLowerCase()
    if (tokens.every((t) => name.includes(t.toLowerCase()))) out.push(i)
  })
  return out
}

/**
 * คำค้นทั้งก้อนตรง "เต็มค่า" กับตัวระบุเฉพาะของออเดอร์ไหม (D-10)
 *
 * ตัวระบุเฉพาะ = เลขคำสั่งซื้อ · รหัสสั้น · เบอร์โทร · เลขพัสดุ
 * ชื่อผู้ซื้อและชื่อสินค้า **ไม่นับ** แม้พิมพ์ตรงเป๊ะ — ลูกค้าชื่อซ้ำกันได้ สินค้าชื่อซ้ำกันได้
 * การยกใบใดใบหนึ่งขึ้นบนสุดด้วยชื่อจึงเป็นการเดาว่าผู้ใช้หมายถึงใบไหน
 */
export function isExactIdentifierMatch(order: SearchableOrder, query: string): boolean {
  const q = query.trim()
  if (!q) return false
  const lower = q.toLowerCase()
  const identifiers = [orderNoOf(order), order.id, order.shortCode ?? '', order.shipment?.trackingNo ?? '']
  if (identifiers.filter(Boolean).some((v) => v.toLowerCase() === lower)) return true
  if (isNumericToken(q) && order.buyerPhone) {
    const digits = digitsOnly(q)
    return digits.length > 0 && digitsOnly(order.buyerPhone) === digits
  }
  return false
}

/** คำค้นสั้นเกินเกณฑ์ → ไม่กรอง (นับหลัง trim — ช่องว่างไม่ใช่ตัวอักษรที่ค้นหาได้) */
export function isSearchActive(query: string): boolean {
  return query.trim().length >= ORDER_SEARCH_MIN_CHARS
}

/**
 * กรอง + จัดลำดับ — **ตัวเดียวที่ทั้งสองจอเรียก**
 *
 * `orders` ที่รับเข้ามาคือชุดที่ผ่านตัวกรองอื่น (สถานะ/กองพัสดุ/ช่วงวันที่) มาแล้ว —
 * ฟังก์ชันนี้ไม่รู้จักตัวกรองพวกนั้นเลยโดยตั้งใจ (AND เกิดจากการเรียงลำดับการเรียก ไม่ใช่
 * จากเงื่อนไขที่เขียนซ้ำในนี้)
 *
 * การจัดลำดับเป็น **stable partition** ไม่ใช่การเรียงใหม่: ใบที่ตรงเต็มค่าขึ้นก่อน
 * ที่เหลือคงลำดับเดิมทุกใบ ⇒ ผู้ขายที่เพิ่งกดเรียงคอลัมน์เองจะไม่เจอลำดับที่ตัวเองสั่งหายไป
 */
export function searchOrders<T extends SearchableOrder>(orders: T[], query: string): OrderSearchHit<T>[] {
  if (!isSearchActive(query)) {
    return orders.map((order) => ({ order, isExactMatch: false, matchedItemIndexes: [] }))
  }
  const tokens = tokenize(query)
  const hits: OrderSearchHit<T>[] = []
  for (const order of orders) {
    if (!tokens.every((t) => tokenMatches(order, t))) continue
    hits.push({
      order,
      isExactMatch: isExactIdentifierMatch(order, query),
      matchedItemIndexes: matchedItemIndexes(order, tokens),
    })
  }
  const exact = hits.filter((h) => h.isExactMatch)
  const rest = hits.filter((h) => !h.isExactMatch)
  return [...exact, ...rest]
}

/** จำนวนใบที่ตรงในชุดที่กว้างกว่า — ใช้เขียนประโยค "พบ N รายการในทั้งร้าน" ตอนผลว่าง */
export function countMatchingOrders<T extends SearchableOrder>(orders: T[], query: string): number {
  if (!isSearchActive(query)) return 0
  return searchOrders(orders, query).length
}
