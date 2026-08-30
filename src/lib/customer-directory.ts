/**
 * customer-directory — นิยามเดียวของ "แถวลูกค้า 1 คน" ที่หน้า `/customers` และ `/customers/[id]` ใช้ร่วมกัน
 * (feature 00057)
 *
 * ทุกอย่างในไฟล์นี้เป็น **ฟังก์ชันบริสุทธิ์** ไม่แตะ prisma — ทดสอบเกณฑ์ได้โดยไม่ต้อง mock DB
 * (ท่าเดียวกับ `customer-behavior.ts` / `buyer-reputation.ts` / `order-stats.ts`)
 * ส่วนที่คุยกับฐานข้อมูลอยู่ที่ `src/services/customer-directory.service.ts`
 *
 * 🛑 ทำไมต้องมีไฟล์นี้ (BR-CUSTP-05): ก่อนหน้านี้การ group ออเดอร์เป็น "ลูกค้า" เขียนอยู่ใน
 * `customers/page.tsx` ที่เดียว พอหน้าโปรไฟล์ต้องหาลูกค้าจาก key เดียวกัน ถ้าเขียน logic ใหม่
 * อีกชุด สองหน้าจะ dedupe ไม่ตรงกันทันทีที่มีคนแก้ที่เดียว — และไม่มี gate ไหนของโปรเจกต์
 * จับได้เลย เพราะทั้งสองชุด "ถูก" ในตัวเอง (HR16)
 *
 * 🛑 `CustomerDirectoryEntry` เป็น **server-internal เท่านั้น** — `contactFull` คือเบอร์ดิบ
 * ห้ามส่งทั้งก้อนข้าม RSC boundary ไปหา client component เด็ดขาด ต้อง map เป็น `CustomerRow`
 * (masked) ก่อนเสมอ (`feedback_rsc_pii_neutralize_at_source`)
 */

import type { CustomerBehavior } from './customer-behavior'
import { MIN_SHIPPED_FOR_RATE, type BuyerReputation, type CustomerRiskTier } from './buyer-reputation'

/** ออเดอร์ 1 ใบเท่าที่หน้าลูกค้าต้องใช้ — ผู้เรียก select มาให้เท่านี้พอ */
export type CustomerDirectoryOrder = {
  publicToken: string
  /** เลขคำสั่งซื้อที่เก็บไว้ (อาจเป็น null สำหรับใบเก่า — ปลายทางคำนวณสดด้วย `formatOrderNo`) */
  orderNo: string | null
  status: string
  totalAmount: number
  createdAtISO: string
  /** เวลาแบบตัวเลขสำหรับเรียง — ไม่ส่งข้าม RSC boundary */
  createdAtRaw: number
  /**
   * เธรดแชทที่สร้างออเดอร์ใบนี้จริง ๆ (BR-CUSTP-07)
   * null = ใบนี้ไม่ได้เกิดจากแชท → **ห้ามเดาเธรดจากเบอร์/Customer** ให้ไม่แสดงปุ่มไปเลย
   */
  conversationId: string | null
  /** ใบนี้นับเป็นยอดขายไหม (`countsAsRevenue` — SSOT เดียวกับ dashboard/รายงาน) */
  isRevenue: boolean
  /** ที่อยู่จัดส่งของใบนี้ (Json ดิบจาก Prisma) — null = ใบนี้ไม่มีที่อยู่ */
  shippingAddress: unknown
}

/**
 * ลูกค้า 1 คนของร้านหนึ่ง หลัง group ด้วย `makeCustomerRowKey`
 * 🛑 unmasked — server-only (ดูหัวไฟล์)
 */
export type CustomerDirectoryEntry = {
  /** opaque key — `c-{customerId}` > `u-{buyerUserId}` > `g-{sha256}` > `guest-unknown` */
  key: string
  customerId: string | null
  buyerUserId: string | null
  displayName: string
  initial: string
  /** เบอร์/อีเมลดิบ ยังไม่ mask — null = ลูกค้ารายนี้ไม่มีข้อมูลติดต่อเลย */
  contactFull: string | null
  isRegistered: boolean
  username: string | null
  avatarUrl: string | null
  /** ออเดอร์ทั้งหมดรวมที่ยกเลิก (นิยามเดิมของ 00014 FR-9 — ห้ามเปลี่ยน) */
  totalOrders: number
  /** ผลรวม `totalAmount` เฉพาะใบที่ `countsAsRevenue` */
  totalSpent: number
  /**
   * จำนวนใบที่ `countsAsRevenue` — **ตัวหารของยอดเฉลี่ยต่อบิล**
   * ต้องมาจากชุดเดียวกับ `totalSpent` เสมอ (`feedback_subtrahend_must_match_minuend_scope`)
   */
  revenueOrderCount: number
  firstOrderISO: string
  /** เวลาแบบตัวเลขสำหรับเทียบ — ไม่ส่งข้าม RSC boundary (เหมือน lastOrderRaw) */
  firstOrderRaw: number
  lastOrderISO: string
  lastOrderRaw: number
  behavior: CustomerBehavior
  /**
   * ความน่าเชื่อถือของลูกค้าคนนี้ **กับร้านนี้เท่านั้น** (feature 00057 รอบ UI)
   *
   * 🛑 ใช้ `summarizeBuyerReputation()` ตัวเดียวกับสถิติข้ามร้านของ 00055 — ฟังก์ชันนั้น
   * เป็น pure function ที่สรุปหลักฐานอะไรก็ได้ที่ป้อนเข้าไป **สิ่งที่กำหนดขอบเขตคือ query
   * ของผู้เรียก ไม่ใช่ตัวฟังก์ชัน** ⇒ ป้อนออเดอร์เฉพาะร้านนี้ ได้ตัวเลขระดับร้านที่ใช้
   * **เกณฑ์เดียวกันเป๊ะ** (ฐานขั้นต่ำของอัตรา · นิยาม "รับของแล้ว" · ลำดับตีกลับชนะยกเลิก)
   * โดยไม่ต้องตั้งเกณฑ์ชุดที่สองซึ่งจะ drift แน่นอนในวันที่มีคนแก้ที่เดียว (HR16)
   *
   * 🛑 **คนละตัวกับ "ทั้งระบบ"** ที่หน้า Details ดึงผ่าน `getBuyerReputation(customerId)` —
   * ตัวนั้นข้ามร้านและมีเฉพาะลูกค้าที่ผูก `Customer` แล้ว ส่วนตัวนี้มีให้ทุกคนรวม guest
   * ⇒ **ทุกที่ที่แสดงต้องมีป้ายกำกับขอบเขตเสมอ** ห้ามปล่อยให้ผู้ใช้เดาว่าเลขไหนคือของใคร
   */
  shopReputation: BuyerReputation
  /** ออเดอร์ทั้งหมดของลูกค้าคนนี้กับร้านนี้ เรียงใหม่ → เก่า */
  orders: CustomerDirectoryOrder[]
}

/* ────────────────────────────────────────────────────────────────────────────
 * การปิดบังข้อมูลติดต่อ (PDPA)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * แสดงแค่ 4 ตัวท้าย ปิดที่เหลือ — ย้ายมาจาก `customers/page.tsx` เพื่อให้ทุกที่ใช้ตัวเดียวกัน
 * (เดิมเขียนอยู่ในไฟล์หน้าเดียว คนอื่นหยิบไปใช้ไม่ได้)
 *
 * 🛑 ต่างจากของเดิม 1 จุด: **สตริงว่างคืน `—` เหมือน null** ของเดิมเขียน `return c ?? '—'`
 * ซึ่ง `??` ตกเฉพาะ null/undefined ⇒ `''` คืน `''` ทำให้ช่องข้อมูลติดต่อว่างเปล่าโดยไม่มี
 * อะไรบอกว่า "ไม่มีข้อมูล" (บนหน้าจอแยกจาก "โหลดไม่ขึ้น" ไม่ได้). ไม่กระทบข้อมูลจริง —
 * `Order.buyerContact` ไม่มีแถวไหนเป็นสตริงว่างบน prod (2026-08-24) แต่ปิดช่องไว้ก่อน
 * เพราะเทสของฟีเจอร์นี้ทำให้ความกำกวมนี้โผล่มา
 */
export function maskContact(c: string | null | undefined): string {
  if (!c) return '—'
  if (c.length <= 4) return c
  return '•'.repeat(c.length - 4) + c.slice(-4)
}

/* ────────────────────────────────────────────────────────────────────────────
 * การค้นหา (FR-001)
 *
 * 🛑 ต้องเทียบกับ `contactFull` (ดิบ) **ก่อน mask** — นี่คือเหตุผลทั้งหมดที่การค้นหาต้องย้าย
 * มาอยู่ฝั่ง server: ของเดิมกรอง array ที่ `contact` ถูก mask ไปแล้วตั้งแต่ RSC boundary
 * จึงค้นเบอร์เต็มไม่เจอ "โดยโครงสร้าง" ไม่ว่าจะแก้ UI ยังไงก็ตาม
 * ──────────────────────────────────────────────────────────────────────────── */

/** เหลือเฉพาะตัวเลข — ใช้เทียบเบอร์ที่พิมพ์มาคนละรูปแบบ (`081-234-5678` = `0812345678`) */
function digitsOnly(s: string): string {
  return s.replace(/\D+/g, '')
}

/**
 * แถวนี้ตรงกับคำค้นหาไหม
 *
 * - คำค้นที่มีตัวเลข ≥3 ตัว → เทียบแบบ "เอาเฉพาะตัวเลข" กับข้อมูลติดต่อ (ครอบเบอร์ที่มีขีด/เว้นวรรค)
 * - ทุกกรณีเทียบ substring กับชื่อและข้อมูลติดต่อดิบด้วย (case-insensitive) เพื่อให้ค้นอีเมล/ชื่อได้
 *
 * เกณฑ์ "≥3 ตัวเลข" กันไม่ให้คำค้นที่มีเลขปนนิดเดียว (เช่นชื่อร้าน "7 สหาย") กลายเป็นการค้นเบอร์
 * ที่ match มั่วไปทั้งลิสต์
 */
export function matchesCustomerQuery(
  entry: Pick<CustomerDirectoryEntry, 'displayName' | 'contactFull'>,
  rawQuery: string,
): boolean {
  const q = rawQuery.trim()
  if (!q) return true

  const lower = q.toLowerCase()
  if (entry.displayName.toLowerCase().includes(lower)) return true
  if (entry.contactFull && entry.contactFull.toLowerCase().includes(lower)) return true

  const qDigits = digitsOnly(q)
  if (qDigits.length >= 3 && entry.contactFull) {
    if (digitsOnly(entry.contactFull).includes(qDigits)) return true
  }
  return false
}

/* ────────────────────────────────────────────────────────────────────────────
 * ตัวกรอง (FR-002/FR-003) — มีแค่ 2 ตัว ห้ามเพิ่มตัวที่ 3 ที่อิงช่วงเวลา (BR-CUSTP-13)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * ตัวกรองของลิสต์ — **เลือกได้ทีละอัน** (ชิปแนวนอน 1 แถว) แทนดรอปดาวน์ 2 ตัวของเดิม
 *
 * user เคาะ 2026-08-25 หลังบอกว่าหน้าเดิมบนมือถือ "ดูยาก" — ดรอปดาวน์ 2 ตัว + ช่องจำนวนแถว
 * กินพื้นที่เกือบ 100px ก่อนถึงลูกค้าคนแรก และกดยากด้วยนิ้ว
 *
 * 🛑 `warn` (มีสัญญาณเตือน) กับ `returned` (เคยตีกลับ) **ไม่ใช่อันเดียวกัน** — `warn` รวม
 * การยกเลิกด้วย ส่วน `returned` เจาะจงเฉพาะพัสดุที่ตีกลับ ซึ่งเป็นสิ่งที่ user ขอให้เน้น
 * (`เคยตีกลับ` ⊂ `มีสัญญาณเตือน` เสมอ)
 */
export type CustomerListFilter = 'all' | 'warn' | 'returned' | 'repeat'

const FILTERS: CustomerListFilter[] = ['all', 'warn', 'returned', 'repeat']

/**
 * แกนที่ **สอง** ของหน้ารายชื่อลูกค้า — ระดับความเสี่ยง **ข้ามร้าน** (user เคาะ 2026-08-26)
 *
 * 🛑 เป็นคนละแกนกับ `CustomerListFilter` และ **AND กัน** ไม่ใช่แทนที่กัน:
 *   · `?f=` ถามว่า "ลูกค้าคนนี้ทำอะไรกับ **ร้านฉัน**" (ตีกลับกับร้านนี้ / ซื้อซ้ำที่ร้านนี้)
 *   · `?risk=` ถามว่า "ลูกค้าคนนี้มีประวัติยังไง **ทั้งระบบ**"
 * สองคำถามนี้ตอบต่างกันได้ในคนเดียวกัน (ไม่เคยตีกลับกับเรา แต่ตีกลับร้านอื่น 4 ครั้ง)
 * ⇒ ยุบเป็นแกนเดียวเมื่อไหร่ ข้อมูลข้ามร้านจะหายไปจากหน้าจอทันที
 *
 * 🛑 ตัวเลขบนไทล์/การ์ดที่กดได้ **ต้องนับด้วยฟังก์ชันนี้ตัวเดียวกับที่กรองจริง**
 * ไม่งั้นกดเลข 2 เข้าไปเจอ 1 (บทเรียน Command Center 2026-08-04)
 */
export type CustomerRiskFilter = 'all' | 'high' | 'watch'

const RISK_FILTERS: CustomerRiskFilter[] = ['all', 'high', 'watch']

/** fail-closed เหมือน `parseCustomerFilter` — ค่าที่ไม่รู้จักตกเป็น 'all' */
export function parseCustomerRiskFilter(v: string | undefined | null): CustomerRiskFilter {
  return RISK_FILTERS.includes(v as CustomerRiskFilter) ? (v as CustomerRiskFilter) : 'all'
}

/**
 * แถวนี้ผ่านตัวกรองความเสี่ยงไหม
 *
 * 🛑 `tier` ส่งเข้ามาจากผู้เรียก ไม่ derive ที่นี่ — ไฟล์นี้ไม่รู้จัก `BuyerReputation`
 * ข้ามร้าน (มันมาจาก batch query คนละชั้น) และการ derive ซ้ำคือช่องให้เกณฑ์ drift
 */
export function matchesRiskFilter(tier: CustomerRiskTier, filter: CustomerRiskFilter): boolean {
  return filter === 'all' || tier === filter
}

/** fail-closed — ค่าที่ไม่รู้จัก (พิมพ์ใน URL เอง/ของเก่าที่ bookmark ไว้) ตกเป็น 'all' ไม่ใช่ throw */
export function parseCustomerFilter(v: string | undefined | null): CustomerListFilter {
  return FILTERS.includes(v as CustomerListFilter) ? (v as CustomerListFilter) : 'all'
}

/**
 * แถวนี้ผ่านตัวกรองไหม
 *
 * 🛑 `hasWarning` ส่งเข้ามาจากผู้เรียก ไม่คำนวณเองที่นี่ — ต้องเป็นค่าเดียวกับที่การ์ดสถิติ
 * "ลูกค้าต้องเฝ้าระวัง" นับ ไม่งั้นการ์ดจะบอก 12 แล้วกดกรองได้ 9 โดยไม่มีอะไรฟ้อง
 *
 * `repeat` นับจาก `totalOrders` (รวมที่ยกเลิก) ตามนิยามเดิมของ 00014 FR-9 — และ **ไม่ผูกกับ
 * ป้าย `REGULAR`** ที่ใช้ `completed >= 3` เพราะเป็นคนละคำถาม (บนข้อมูลจริงลูกค้าซื้อซ้ำมี
 * ~16 จาก 397 คน ถ้าใช้เกณฑ์ป้ายจะเหลือแทบไม่มีใคร)
 */
export function matchesCustomerFilter(
  entry: Pick<CustomerDirectoryEntry, 'totalOrders' | 'shopReputation'>,
  filter: CustomerListFilter,
  hasWarning: boolean,
): boolean {
  switch (filter) {
    case 'warn':
      return hasWarning
    case 'returned':
      return entry.shopReputation.returned > 0
    case 'repeat':
      return entry.totalOrders >= 2
    default:
      return true
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * การหาแถวจาก key (FR-006/FR-007)
 * ──────────────────────────────────────────────────────────────────────────── */

/** prefix ที่ `makeCustomerRowKey` ผลิตได้จริง — ค่าอื่น = key ปลอม/พิมพ์มั่ว */
const VALID_KEY_PREFIXES = ['c-', 'u-', 'g-'] as const

/**
 * key นี้มีรูปแบบที่เป็นไปได้ไหม (ยังไม่ได้แปลว่ามีอยู่จริงในร้าน)
 *
 * 🛑 ต้องมีส่วนหลัง prefix ด้วย — `'c-'` เปล่า ๆ ต้องตกที่นี่ ไม่ใช่ไปตกที่ `findEntryByKey`
 * แล้วคืน "ไม่พบ" เหมือนกัน เพราะสองอย่างนี้ต่างกัน: อันหนึ่งคือ URL ที่ประกอบไม่ถูก
 * อีกอันคือลูกค้าที่ไม่ได้อยู่ในร้านนี้
 *
 * `guest-unknown` **ไม่นับว่าใช้ได้** — มัน match ลูกค้าหลายคนที่ไม่มีข้อมูลติดต่อพร้อมกัน
 * (ข้อจำกัดที่สืบทอดมาจาก `makeCustomerRowKey` ของ 00014) การเปิดโปรไฟล์ด้วยคีย์นี้จะได้
 * หน้าที่รวมคนหลายคนเป็นคนเดียว ซึ่งแย่กว่าไม่มีหน้าให้เปิด
 */
export function isValidCustomerKey(key: string): boolean {
  return VALID_KEY_PREFIXES.some((p) => key.startsWith(p) && key.length > p.length)
}

/**
 * หา entry จาก key — **เทียบสตริงตรง ๆ ไม่ต้อง reverse hash**
 *
 * 🛑 นี่คือเหตุผลที่ `g-` (sha256 ทางเดียว) resolve ได้โดยไม่ต้องถอดรหัส: key ของทุก entry
 * ถูกคำนวณด้วย `makeCustomerRowKey` ที่จุดเดียวกันตอน build aggregate อยู่แล้ว การหาลูกค้า
 * จาก URL จึงเป็นแค่การเทียบสตริงกับชุดที่คำนวณสดมา ไม่ใช่การถอดค่ากลับ
 */
export function findEntryByKey(
  entries: CustomerDirectoryEntry[],
  key: string,
): CustomerDirectoryEntry | null {
  if (!isValidCustomerKey(key)) return null
  return entries.find((e) => e.key === key) ?? null
}

/* ────────────────────────────────────────────────────────────────────────────
 * ตัวเลขสรุป (FR-009)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * ยอดเฉลี่ยต่อบิล = ยอดซื้อสะสม ÷ **จำนวนใบที่นับเป็นยอดขาย**
 *
 * 🛑 ตัวหารต้องเป็น `revenueOrderCount` ไม่ใช่ `totalOrders` — ถ้าหารด้วย `totalOrders`
 * ค่าเฉลี่ยจะลดลงทุกครั้งที่ลูกค้ามีออเดอร์ยกเลิกเพิ่ม ทั้งที่ใบที่ยกเลิกไม่เคยอยู่ในตัวตั้งเลย
 * (ตัวตั้งกับตัวหารมาจากคนละกอง — รอยที่ระบบนี้เคยเจ็บมาแล้ว)
 *
 * คืน `null` เมื่อไม่มีใบที่นับเป็นยอดขายเลย — ปลายทางต้องแสดง `—` ห้ามแสดง `฿0`
 * (`฿0` แปลว่า "เฉลี่ยแล้วได้ศูนย์บาท" ซึ่งไม่จริง ความจริงคือ "ยังไม่มีอะไรให้เฉลี่ย")
 */
export function avgPerOrder(
  entry: Pick<CustomerDirectoryEntry, 'totalSpent' | 'revenueOrderCount'>,
): number | null {
  if (entry.revenueOrderCount <= 0) return null
  return entry.totalSpent / entry.revenueOrderCount
}

/* ────────────────────────────────────────────────────────────────────────────
 * สถิติความน่าเชื่อถือระดับร้าน — การ์ด 4 ใบบนหัวหน้า `/customers`
 * ──────────────────────────────────────────────────────────────────────────── */

export type CustomerDirectoryStats = {
  totalCustomers: number
  /** ใบที่เปิดพัสดุขาไปจริง — ตัวหารของทั้งสองอัตรา */
  shipped: number
  received: number
  returned: number
  /** `null` = ฐานน้อยเกินกว่าจะพูดเป็นอัตรา (กติกาเดียวกับรายคน) */
  receivedRate: number | null
  returnRate: number | null
  /** จำนวนลูกค้าที่มีป้ายเตือนอย่างน้อย 1 ใบ */
  watchCount: number
}

/**
 * รวมสถิติของทั้งร้านจากแถวลูกค้าที่ aggregate มาแล้ว — **ไม่ query เพิ่ม**
 *
 * 🛑 `hasWarning` ต้องส่งเข้ามาจากผู้เรียก ไม่คำนวณเองที่นี่ เพราะเกณฑ์ป้ายเตือนอยู่ที่
 * `customerBadges()` ซึ่งต้องใช้คำจาก dictionary + คำนามผันตาม vertical (ไฟล์นี้เป็น pure
 * ไม่รู้จักทั้งสองอย่าง) — และที่สำคัญกว่าคือ **ตัวเลขบนการ์ดกับผลของชิปกรอง "ต้องเฝ้าระวัง"
 * ต้องมาจากเกณฑ์เดียวกัน** ถ้าคำนวณแยกกันสองที่ วันหนึ่งการ์ดจะบอก 12 แล้วกดกรองได้ 9
 *
 * 🛑 อัตราใช้ฐาน `shipped` (ใบที่เปิดพัสดุจริง) ไม่ใช่จำนวนออเดอร์ทั้งหมด — ใบที่รับหน้าร้าน/
 * สินค้าดิจิทัล/บริการ ไม่มีทางตีกลับได้ เอาไปหารจะได้อัตราที่ต่ำกว่าความจริงเสมอ
 * (`feedback_subtrahend_must_match_minuend_scope`)
 */
export function aggregateCustomerStats(
  rows: { shopReputation: BuyerReputation; hasWarning: boolean }[],
): CustomerDirectoryStats {
  let shipped = 0
  let received = 0
  let returned = 0
  let watchCount = 0

  for (const r of rows) {
    shipped += r.shopReputation.shipped
    received += r.shopReputation.received
    returned += r.shopReputation.returned
    if (r.hasWarning) watchCount += 1
  }

  // ฐานเดียวกับรายคน (`MIN_SHIPPED_FOR_RATE`) — ร้านที่เพิ่งเปิดพัสดุ 1 ใบแล้วตีกลับ
  // ต้องไม่ขึ้นว่า "อัตราตีกลับ 100%" บนหัวหน้าจอตัวเอง
  const enough = shipped >= MIN_SHIPPED_FOR_RATE

  return {
    totalCustomers: rows.length,
    shipped,
    received,
    returned,
    receivedRate: enough ? received / shipped : null,
    returnRate: enough ? returned / shipped : null,
    watchCount,
  }
}
