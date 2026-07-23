import { prisma } from '@/lib/prisma'

/**
 * ai-context.service — ประกอบ "บริบทร้าน" ที่จะส่งให้ผู้ให้บริการ AI (feature 00019)
 *
 * SSOT: docs/20 - Features/00019 - AI Reply Assistant/{SRS.md TFR-003..TFR-007, SDS.md TD-003/TD-004/TD-006}
 *
 * WARNING: ไฟล์นี้คือ "จุดเดียว" ที่ตัดสินว่าข้อมูลอะไรของร้าน/ลูกค้าจะออกไปสู่ระบบภายนอก (Google Gemini)
 * ทุกฟังก์ชันจึงคืน **ข้อความที่ประกอบเสร็จแล้ว** ไม่ใช่ object ดิบ (TD-003) — เพื่อให้ตรวจสอบได้
 * ด้วยการอ่านไฟล์เดียวว่ามีฟิลด์อะไรหลุดออกไปบ้าง ถ้าคืน object แล้วให้ชั้นอื่น serialize
 * ฟิลด์ใหม่ที่เพิ่มใน model ภายหลังจะหลุดตามไปเงียบ ๆ โดยไม่มีใครสังเกต
 *
 * WARNING: ห้ามเพิ่ม phone / email / address / ที่อยู่จัดส่ง เข้าไปใน select ใด ๆ ในไฟล์นี้ (BR-AI-09,
 * NFR-Sec-02) — user อนุมัติกฎนี้ชัดเจน 2026-07-23. ถ้าอนาคตต้องการให้ AI ช่วยร่างข้อความยืนยัน
 * ที่อยู่จัดส่ง ต้องกลับไปแก้ PRD/BRD ก่อน ไม่ใช่แก้ที่ไฟล์นี้เงียบ ๆ
 *
 * WARNING: ทุก query ต้องมี shopId ของร้านที่ active อยู่ใน WHERE (NFR-Sec-01) — ห้าม post-filter ใน JS
 */

/** เพดานความยาวรวมของบล็อกบริบท (TFR-007) — กันต้นทุน token บานและกันโมเดลตัดข้อมูลสำคัญทิ้ง */
export const CONTEXT_MAX_CHARS = 6000
/** จำนวนสินค้าสูงสุดที่แนบต่อหนึ่งคำขอ (BR-AI-07) */
export const PRODUCT_CONTEXT_LIMIT = 20
/** จำนวนออเดอร์สูงสุดที่แนบต่อหนึ่งคำขอ (BR-AI-08) */
export const ORDER_CONTEXT_LIMIT = 5

export type ProductCardInfo = { name: string; price: string; isActive: boolean }

/**
 * resolveProductCards — ดึงชื่อ/ราคาของสินค้าที่ถูกอ้างถึงด้วยการ์ดสินค้าในเธรด (TFR-003)
 * batch query ครั้งเดียว (ห้าม N+1 — NFR-Perf-03); scope shopId เสมอ
 */
export async function resolveProductCards(
  shopId: string,
  productIds: string[],
): Promise<Map<string, ProductCardInfo>> {
  const ids = [...new Set(productIds)].filter(Boolean)
  if (ids.length === 0) return new Map()
  const rows = await prisma.product.findMany({
    where: { id: { in: ids }, shopId },
    select: { id: true, name: true, price: true, isActive: true },
  })
  return new Map(
    rows.map((r) => [r.id, { name: r.name, price: r.price.toFixed(2), isActive: r.isActive }]),
  )
}

/**
 * แยกคำค้นจากข้อความลูกค้า — ภาษาไทยไม่มีช่องว่างระหว่างคำ การตัดคำจริงต้องใช้ตัวตัดคำซึ่งเกิน
 * ขอบเขตเฟสนี้ จึงใช้วิธีที่ได้ผลจริงกับร้านอะไหล่/สินค้าทั่วไป: ตัดด้วยช่องว่างและเครื่องหมาย
 * แล้วเก็บ "ตัวเลข" แยกด้วย (เช่น 335, 100) ซึ่งเป็นคำค้นที่แม่นที่สุดของสินค้าประเภทอะไหล่
 * ถ้าไม่ได้ token ที่ใช้ได้เลย → caller จะ fallback เป็นสินค้าล่าสุดแทน (TFR-004)
 */
function extractSearchTokens(texts: string[]): string[] {
  const tokens = new Set<string>()
  for (const text of texts) {
    for (const raw of text.split(/[\s,./|()\-–—"'`\n\r\t]+/)) {
      const t = raw.trim()
      if (t.length >= 2) tokens.add(t)
    }
    for (const num of text.match(/\d{2,}/g) ?? []) tokens.add(num)
  }
  return [...tokens].slice(0, 8)
}

/**
 * buildProductBlock — รายการสินค้าที่เกี่ยวข้องกับสิ่งที่ลูกค้าถาม (TFR-004)
 *
 * - เฉพาะสินค้าเปิดขายของร้านที่ active (BR-AI-06)
 * - ไม่เกิน PRODUCT_CONTEXT_LIMIT รายการ
 * - แนบจำนวนคงเหลือเฉพาะสินค้าที่ "ติดตามสต็อก" จริง (stockQty ไม่เป็น null — ร้านที่ไม่ได้ใช้
 *   Inventory Add-on จะเป็น null ทั้งหมด จึงไม่มีตัวเลขสต็อกที่ไม่มีความหมายหลุดเข้า prompt, AC-005-05)
 */
export async function buildProductBlock(shopId: string, buyerTexts: string[]): Promise<string> {
  const tokens = extractSearchTokens(buyerTexts)

  const baseWhere = { shopId, isActive: true } as const
  const select = { name: true, price: true, stockQty: true } as const

  let rows = tokens.length
    ? await prisma.product.findMany({
        where: { ...baseWhere, OR: tokens.map((t) => ({ name: { contains: t, mode: 'insensitive' as const } })) },
        select,
        take: PRODUCT_CONTEXT_LIMIT,
        orderBy: { updatedAt: 'desc' },
      })
    : []

  // fallback: จับคู่ชื่อไม่ได้เลย (พิมพ์ไทยติดกันจนตัดคำไม่ออก / ถามลอย ๆ) → ให้สินค้าล่าสุดไว้อ้างอิง
  // ราคาแทนที่จะไม่มีข้อมูลเลย ดีกว่าปล่อยให้ AI ตอบ "ขอข้อมูลเพิ่ม" ซึ่งเป็นปัญหาตั้งต้นของฟีเจอร์นี้
  if (rows.length === 0) {
    rows = await prisma.product.findMany({
      where: baseWhere,
      select,
      take: 10,
      orderBy: { updatedAt: 'desc' },
    })
  }

  if (rows.length === 0) return ''

  const lines = rows.map((p) => {
    const stock = p.stockQty === null ? '' : ` (คงเหลือ ${p.stockQty} ชิ้น)`
    return `- ${p.name} — ${p.price.toFixed(2)} บาท${stock}`
  })
  return ['[สินค้าของร้าน (ราคาจริงจากระบบ ใช้อ้างอิงได้)]', ...lines].join('\n')
}

/**
 * buildCustomerBlock — ประวัติออเดอร์ของลูกค้าที่ผูกกับเธรดนี้ (TFR-005)
 *
 * allow-list ที่ระดับ Prisma select ไม่ใช่ตัดฟิลด์ทีหลัง (TD-004) — บทเรียน PII หลุดผ่าน RSC flight
 * ของโปรเจกต์นี้ชัดเจนว่า "ดึงมาแล้วค่อยตัดตอนแสดงผล" ไม่ปลอดภัยพอ ต้องไม่ดึงมาตั้งแต่แรก
 */
export async function buildCustomerBlock(
  shopId: string,
  conversation: { buyerUserId: string | null; externalContactId: string | null },
): Promise<string> {
  // หา Customer ที่ผูกกับเธรด: ช่องทางนอกผูกผ่าน ExternalContact.customerId, DEEP ผูกผ่าน Customer.userId
  let customerId: string | null = null
  if (conversation.externalContactId) {
    const contact = await prisma.externalContact.findUnique({
      where: { id: conversation.externalContactId },
      select: { customerId: true },
    })
    customerId = contact?.customerId ?? null
  } else if (conversation.buyerUserId) {
    const customer = await prisma.customer.findUnique({
      where: { userId: conversation.buyerUserId },
      select: { id: true },
    })
    customerId = customer?.id ?? null
  }

  if (!customerId) return ''

  const orders = await prisma.order.findMany({
    // shopId ใน WHERE = กันออเดอร์ข้ามร้านเด็ดขาด แม้เป็นลูกค้าคนเดียวกัน (BR-AI-08)
    where: { shopId, customerId },
    // allow-list: ห้ามเพิ่ม phone/email/shippingAddress ที่นี่ (BR-AI-09)
    select: { status: true, totalAmount: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: ORDER_CONTEXT_LIMIT,
  })

  if (orders.length === 0) return ''

  const lines = orders.map((o) => {
    const d = o.createdAt.toISOString().slice(0, 10)
    return `- ${d} ยอด ${o.totalAmount.toFixed(2)} บาท สถานะ ${o.status}`
  })
  return ['[ประวัติออเดอร์ของลูกค้ารายนี้กับร้านนี้]', ...lines].join('\n')
}

/**
 * composeContextBlock — รวมบล็อกบริบทและบังคับเพดานความยาว (TFR-007)
 *
 * ตัดรายการสินค้าจากท้ายลงก่อนเสมอ ห้ามตัดบล็อกลูกค้าทิ้ง (TD-006): บล็อกลูกค้าเล็กและตายตัว
 * (ไม่เกิน 5 บรรทัด) แต่ตอบคำถามยอดฮิต "ของถึงไหนแล้ว" ได้ ขณะที่สินค้าท้าย ๆ เกี่ยวข้องน้อยกว่า
 * อยู่แล้วเพราะเรียงตามความเกี่ยวข้องมาก่อน
 */
export function composeContextBlock(productBlock: string, customerBlock: string): string {
  const parts = [productBlock, customerBlock].filter((p) => p.length > 0)
  const joined = parts.join('\n\n')
  if (joined.length <= CONTEXT_MAX_CHARS) return joined

  const budget = CONTEXT_MAX_CHARS - customerBlock.length - 2 // 2 = '\n\n'
  if (budget <= 0) {
    // เคสสุดขั้ว: บล็อกลูกค้าอย่างเดียวก็เกินแล้ว (ไม่ควรเกิดเพราะจำกัด 5 ออเดอร์) — ตัดตรง ๆ
    console.warn('[ai-context] customer block เกินเพดานเอง — ตัดแบบตรง ๆ')
    return customerBlock.slice(0, CONTEXT_MAX_CHARS)
  }

  const lines = productBlock.split('\n')
  const kept: string[] = []
  let used = 0
  for (const line of lines) {
    if (used + line.length + 1 > budget) break
    kept.push(line)
    used += line.length + 1
  }
  console.warn(
    `[ai-context] บริบทเกิน ${CONTEXT_MAX_CHARS} ตัวอักษร — ตัดรายการสินค้าจาก ${lines.length} เหลือ ${kept.length} บรรทัด`,
  )
  return [kept.join('\n'), customerBlock].filter((p) => p.length > 0).join('\n\n')
}
