/**
 * auto-order-validate.service — จุดต่อระหว่างชั้น pure กับ I/O (00061 · TFR-008 / TFR-010)
 *
 * ห่อ `deriveDraftReasons()` (pure) ด้วยสิ่งเดียวที่ต้องถาม DB: **สินค้าที่ร้านพิมพ์มา
 * ตรงกับรายการในแคตตาล็อกไหม**
 *
 * 🛑 จำนวน query ต่อ 1 ข้อความ = **คงที่ 2 ครั้ง** ไม่ว่ารายการสินค้าจะมีกี่บรรทัด
 * เส้นทางนี้อยู่บน webhook ที่มี KPI latency 5 วินาที — query ต่อบรรทัดจะกลายเป็น
 * 10 round-trip ต่อข้อความเดียวเมื่อร้านพิมพ์รายการยาว
 *
 * 🛑 การเทียบ in-memory **ไม่ใช่การผ่อนกฎ "ตรงเป๊ะเท่านั้น"** — เทียบสตริงหลัง
 * `trim().toLowerCase()` ใน JS ให้ผลเหมือน SQL `mode:'insensitive'` ทุกประการ
 * และไม่ใช่ทางเลือกรองด้วย: Prisma **ไม่รองรับ `mode:'insensitive'` ร่วมกับ `in`**
 * ⇒ ต่อให้อยากยิง query เดียวก็ทำ case-insensitive ไม่ได้อยู่ดี
 */
import 'server-only'

import { prisma } from '@/lib/prisma'
import { shopShipsGoods } from '@/lib/shipping-address-status'
import {
  deriveDraftReasons,
  sortDraftReasons,
  type DraftReasonCode,
} from '@/lib/auto-order-reasons'
import type { ParsedAutoOrderMessage } from '@/lib/auto-order-parser'

/** รายการสินค้าหลังจับคู่ — `matchedProductId` เป็น null ได้เสมอ (คือสิ่งที่ทำให้ตกร่าง) */
export type MatchedAutoOrderItem = {
  rawName: string
  qty: number
  price: number | null
  matchedProductId: string | null
}

export type AutoOrderValidation = {
  complete: boolean
  reasons: DraftReasonCode[]
  /** ทุกบรรทัดที่แกะได้ พร้อมผลการจับคู่ — เก็บลง `Order.draftRawItems` ทั้งชุดเมื่อตกร่าง */
  matchedItems: MatchedAutoOrderItem[]
  shipsGoods: boolean
}

/**
 * @param messageAt เวลาที่ **ข้อความถูกส่ง** (ไม่ใช่เวลาที่ตัวดักจับเริ่มทำงาน — TFR-009)
 */
export async function validateAutoOrderCompleteness(
  shopId: string,
  parsed: ParsedAutoOrderMessage,
  messageAt: Date,
  nowMs: number,
): Promise<AutoOrderValidation> {
  // query #1 — ร้านนี้ส่งของไหม (ตัวตัดสินว่าที่อยู่บังคับหรือเปล่า)
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { vertical: true } })
  const shipsGoods = shopShipsGoods(shop?.vertical)

  // query #2 — แคตตาล็อกทั้งร้านครั้งเดียว
  //
  // ⚠️ ความเสี่ยงที่ยอมรับและบันทึกไว้: ร้านที่มีสินค้าหลักพันรายการจะโหลดข้อมูลมากกว่าที่
  // จำเป็นต่อ 1 ข้อความ — **ยังไม่มีตัวเลขจริงจาก prod ว่าร้านทั่วไปมีสินค้ากี่รายการ**
  // ⇒ จงใจไม่ตั้ง threshold ลอย ๆ ตอนนี้ พบว่าเป็นปัญหาจริงหลัง deploy ค่อยเติม cache/limit
  const catalog =
    parsed.items.length > 0
      ? await prisma.product.findMany({ where: { shopId }, select: { id: true, name: true, sku: true } })
      : []

  const byName = new Map<string, string>()
  const bySku = new Map<string, string>()
  for (const p of catalog) {
    const nameKey = p.name.trim().toLowerCase()
    // ชื่อซ้ำในร้านเดียวกันเป็นไปได้ — ตัวแรกชนะ (deterministic ตามลำดับที่ DB คืน)
    // และถึงจะจับผิดใบ ผลก็ยังเป็น "สินค้าที่มีอยู่จริงในร้านนี้" ไม่ใช่ของร้านอื่น
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, p.id)
    const skuKey = p.sku?.trim()
    if (skuKey && !bySku.has(skuKey)) bySku.set(skuKey, p.id)
  }

  const matchedItems: MatchedAutoOrderItem[] = parsed.items.map((i) => {
    const raw = i.rawName.trim()
    return {
      rawName: i.rawName,
      qty: i.qty,
      price: i.price,
      // 🛑 ไม่มี fuzzy/similarity ใด ๆ — ชื่อตรงเป๊ะ (case-insensitive) หรือ SKU ตรงเป๊ะเท่านั้น
      // SKU เทียบแบบ case-sensitive เพราะรหัสสินค้าเป็นตัวระบุ ไม่ใช่คำที่คนอ่าน
      matchedProductId: byName.get(raw.toLowerCase()) ?? bySku.get(raw) ?? null,
    }
  })

  const reasons = sortDraftReasons(
    deriveDraftReasons({
      phone: parsed.phone,
      shipsGoods,
      address: {
        line1: parsed.addressLine,
        province: parsed.province,
        postcode: parsed.postcode,
      },
      items: matchedItems,
      discount: parsed.discount,
      statedTotal: parsed.statedTotal,
      messageAtMs: messageAt.getTime(),
      nowMs,
    }),
  )

  return { complete: reasons.length === 0, reasons, matchedItems, shipsGoods }
}
