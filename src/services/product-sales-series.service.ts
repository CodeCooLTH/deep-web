/**
 * product-sales-series.service — ข้อมูลของรายงาน "ยอดขายรายสินค้า" (feature 00062)
 *
 * ── นิยาม "ขายแล้ว" ──────────────────────────────────────────────────────────
 * 🛑 `status != 'CANCELLED'` — ชุดเดียวกับ `getBestSellerProducts()` (product.service.ts)
 * **ไม่ใช่** `revenueOrderWhere` ที่ /sales และ /expenses ใช้
 *
 * เหตุผลอยู่ในคอมเมนต์ของ `getBestSellerProducts` อยู่แล้ว: ร้านที่ขายผ่านแชท ผู้ซื้อแทบไม่กลับ
 * มากดยืนยันรับของ (เคสจริง: SHIPPED 23 ใบ / CONFIRMED 0) ถ้าใช้เกณฑ์ยืนยันแล้ว ร้านกลุ่มนี้
 * จะเปิดรายงานมาเจอกราฟว่างเปล่าทั้งเดือนทั้งที่ขายได้ทุกวัน
 *
 * เพราะนิยามนี้ต่างจากหน้าอื่น หน้าจอ **ต้อง** แสดง `SALES_BASIS_NOTE` เสมอ (HR16 — ตัวเลข
 * สองหน้าที่ไม่ตรงกันโดยไม่มีคำอธิบาย ทำให้ผู้ขายเลิกเชื่อตัวเลขทั้งระบบ ไม่ใช่แค่หน้าเดียว)
 *
 * ── ทำไมถึง bucket ใน JS ไม่ใช่ SQL ────────────────────────────────────────────
 * ทุก time series ในรีโปนี้ bucket ใน JS ทั้งหมด (dashboard.service / sales/page.tsx) และ
 * `thaiDayKey()` คือ SSOT ของการตัดวันตามเวลาไทย — การเขียน SQL ตัดวันเองเป็นทางที่เคยพลาด
 * มาแล้ว (dashboard/page.tsx:449 ใช้ getFullYear/getMonth ของเซิร์ฟเวอร์ซึ่งเป็น UTC บน Vercel)
 * ขนาดข้อมูลรองรับได้: ร้านใหญ่สุดบน prod ~500 ออเดอร์/เดือน ⇒ OrderItem หลักพันแถว
 */
import { prisma } from '@/lib/prisma'
import { thaiDayKey } from '@/lib/format-date'
import { thaiMidnightUtc } from '@/lib/date-range'
import {
  CUSTOM_ITEM_KEY,
  CUSTOM_ITEM_LABEL,
  type SparseSeries,
  daysInMonth,
  toSparse,
} from '@/lib/product-sales-month'

/**
 * เพดานกันร้านที่มีออเดอร์ผิดปกติ — เดือนละ 20,000 บรรทัดคือ ~40 เท่าของร้านใหญ่สุดวันนี้
 * (idiom เดียวกับ `badge.service.ts:264` — ไม่ใช่ pagination แต่เป็นตัวกันหน้าจอค้าง)
 *
 * 🛑 ถ้าชนเพดานจริง ต้องบอกผู้ใช้ ไม่ใช่เงียบ — `truncated` ถูกส่งกลับขึ้นไปให้หน้าจอ
 * (ตัวเลขบางส่วนที่หน้าตาเหมือนตัวเลขครบแล้ว อันตรายกว่าไม่มีตัวเลข)
 */
const MAX_ITEM_ROWS = 20_000

export type ProductSalesRow = {
  /** `productId` หรือ CUSTOM_ITEM_KEY สำหรับแถวรวมรายการที่พิมพ์เอง */
  key: string
  name: string
  /** URL รูปแรกของสินค้า — null ได้เสมอ (แถวรวมไม่มีรูปโดยนิยาม) */
  image: string | null
  /** false = สินค้าถูกปิดการขายไปแล้ว (ยอดในอดีตยังเป็นข้อเท็จจริง) */
  isActive: boolean
  isCustom: boolean
  /** ยอดรายวันแบบย่อ — `[dayIndex0based, จำนวนชิ้น][]` */
  qty: SparseSeries
  /** ยอดเงินรายวันแบบย่อ — `[dayIndex0based, บาท][]` (ไม่รวมส่วนลด/VAT ระดับออเดอร์) */
  amount: SparseSeries
  totalQty: number
  totalAmount: number
  /** จำนวนบรรทัดรายการที่ขายได้ = "กี่ครั้ง" — ใช้เป็นด่านขั้นต่ำของป้ายสรุป */
  saleEvents: number
  /** วันล่าสุดที่มียอด (0-based) — null = ไม่มียอดเลยในเดือนนี้ */
  lastSoldDayIndex: number | null
}

export type ProductSalesMonth = {
  rows: ProductSalesRow[]
  days: number
  /** ร้านนี้มีสินค้าในระบบอย่างน้อย 1 ชิ้นไหม — แยก "ยังไม่มีสินค้า" ออกจาก "เดือนนี้ขายไม่ได้" */
  hasAnyProduct: boolean
  /** จำนวนออเดอร์ที่นับเข้ารายงานนี้ในเดือนนั้น */
  orderCount: number
  /** true = ข้อมูลถูกตัดเพราะชนเพดาน MAX_ITEM_ROWS */
  truncated: boolean
}

/**
 * getProductSalesMonth — ยอดขายรายสินค้ารายวันของเดือนหนึ่ง
 *
 * 🛑 scope ด้วย `shopId` ใน `where` ตั้งแต่ query แรก ไม่ใช่ดึงมาแล้วกรองทีหลัง
 * (feedback_rsc_dal_authz)
 */
export async function getProductSalesMonth(
  shopId: string,
  year: number,
  month0: number,
): Promise<ProductSalesMonth> {
  const days = daysInMonth(year, month0)
  const gte = thaiMidnightUtc(year, month0, 1)
  // Date.UTC รับ month=12 แล้วข้ามปีให้เอง — ไม่ต้องคำนวณปีเอง
  const lt = thaiMidnightUtc(year, month0 + 1, 1)

  const [items, products] = await Promise.all([
    prisma.orderItem.findMany({
      where: {
        order: { shopId, status: { not: 'CANCELLED' }, createdAt: { gte, lt } },
      },
      select: {
        productId: true,
        name: true,
        qty: true,
        price: true,
        orderId: true,
        order: { select: { createdAt: true } },
      },
      take: MAX_ITEM_ROWS + 1,
    }),
    // สินค้าทั้งร้าน (ไม่ใช่เฉพาะที่ขายได้) — สวิตช์ "แสดงสินค้าที่ไม่มียอดขาย" ต้องเปิดได้ทันที
    // โดยไม่ยิงเซิร์ฟเวอร์ใหม่ ตามมติที่ไม่มี API endpoint เพิ่ม
    prisma.product.findMany({
      where: { shopId },
      select: { id: true, name: true, images: true, isActive: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const truncated = items.length > MAX_ITEM_ROWS
  const rowsIn = truncated ? items.slice(0, MAX_ITEM_ROWS) : items

  /** dayIndex 0-based ของวันแรกในเดือน — เทียบด้วยคีย์สตริงจาก thaiDayKey เพื่อไม่คำนวณ offset เอง */
  const dayIndexByKey = new Map<string, number>()
  for (let d = 1; d <= days; d++) {
    dayIndexByKey.set(thaiDayKey(thaiMidnightUtc(year, month0, d)), d - 1)
  }

  type Acc = {
    qty: number[]
    amount: number[]
    saleEvents: number
    totalQty: number
    totalAmount: number
    /** ชื่อจาก snapshot ของ OrderItem — ใช้เมื่อหา Product ไม่เจอ (ถูกลบไปแล้ว) */
    fallbackName: string
  }
  const acc = new Map<string, Acc>()
  const orderIds = new Set<string>()

  for (const it of rowsIn) {
    const idx = dayIndexByKey.get(thaiDayKey(it.order.createdAt))
    // ออเดอร์ที่หลุดขอบเขตวัน (ไม่ควรเกิดเพราะกรองใน where แล้ว) — ข้าม ไม่ยัดลงวันที่ 1
    if (idx === undefined) continue

    orderIds.add(it.orderId)
    const key = it.productId ?? CUSTOM_ITEM_KEY
    let a = acc.get(key)
    if (!a) {
      a = {
        qty: new Array<number>(days).fill(0),
        amount: new Array<number>(days).fill(0),
        saleEvents: 0,
        totalQty: 0,
        totalAmount: 0,
        fallbackName: it.name,
      }
      acc.set(key, a)
    }
    const qty = it.qty
    // 🛑 ไม่รวมส่วนลด/VAT — ทั้งสองอย่างอยู่ที่ระดับ Order ไม่มีรายบรรทัด (MONEY_MODE_CAVEAT)
    const amount = qty * Number(it.price)
    a.qty[idx] += qty
    a.amount[idx] += amount
    a.saleEvents += 1
    a.totalQty += qty
    a.totalAmount += amount
  }

  const productById = new Map(products.map((p) => [p.id, p]))
  const rows: ProductSalesRow[] = []

  for (const [key, a] of acc) {
    const isCustom = key === CUSTOM_ITEM_KEY
    const p = isCustom ? undefined : productById.get(key)
    let lastSold: number | null = null
    for (let i = 0; i < days; i++) if (a.qty[i] !== 0) lastSold = i

    rows.push({
      key,
      // สินค้าที่ถูกลบ (hard delete → productId ถูกล้างเป็น null) จะตกมารวมที่แถว custom
      // อยู่แล้ว จึงไม่มีเคส "หา product ไม่เจอแต่ productId มีค่า" ในทางปฏิบัติ —
      // fallbackName เป็นตาข่ายกันพลาดเฉย ๆ ไม่ใช่เส้นทางหลัก
      name: isCustom ? CUSTOM_ITEM_LABEL : (p?.name ?? a.fallbackName),
      image: isCustom ? null : firstImage(p?.images),
      isActive: isCustom ? true : (p?.isActive ?? true),
      isCustom,
      qty: toSparse(a.qty),
      amount: toSparse(a.amount.map(round2)),
      totalQty: a.totalQty,
      totalAmount: round2(a.totalAmount),
      saleEvents: a.saleEvents,
      lastSoldDayIndex: lastSold,
    })
  }

  // สินค้าที่ไม่มียอดในเดือนนี้ — ส่งลงไปด้วยเสมอ (payload เล็กเพราะอนุกรมว่าง) เพื่อให้
  // สวิตช์ "แสดงสินค้าที่ไม่มียอดขาย" ทำงานได้ทันทีโดยไม่ต้องโหลดใหม่
  for (const p of products) {
    if (acc.has(p.id)) continue
    rows.push({
      key: p.id,
      name: p.name,
      image: firstImage(p.images),
      isActive: p.isActive,
      isCustom: false,
      qty: [],
      amount: [],
      totalQty: 0,
      totalAmount: 0,
      saleEvents: 0,
      lastSoldDayIndex: null,
    })
  }

  // เรียงจากขายดี → น้อย ตั้งแต่ฝั่งเซิร์ฟเวอร์ เพื่อให้ "Top N" ที่หน้าจอหยิบไปใช้เป็นชุดเดียว
  // กับลำดับแถวแรกของตาราง (ความสัมพันธ์นี้อ่านออกโดยไม่ต้องอธิบาย)
  rows.sort((a, b) => b.totalQty - a.totalQty || b.totalAmount - a.totalAmount)

  return {
    rows,
    days,
    hasAnyProduct: products.length > 0,
    orderCount: orderIds.size,
    truncated,
  }
}

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null
  const first = images[0]
  return typeof first === 'string' && first.length > 0 ? first : null
}

/** ปัดสองตำแหน่งกันเศษทศนิยมลอยของ float สะสมข้ามวัน */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
