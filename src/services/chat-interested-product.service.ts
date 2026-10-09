import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  INTERESTED_PRODUCT_MAX,
  type InterestedProductDto,
  type InterestedProductState,
  type OptionSelection,
} from '@/lib/chat-memory-types'
import { buildOptionLabel, normalizeAttributes } from '@/lib/product-attributes'
import { expandClusters } from '@/services/follow-up-scope'
import type { PromptProduct } from '@/lib/chat-memory-types'

// สินค้าที่สนใจต่อห้อง (FR-MEM-13..17) — เขียนต่อห้อง อ่านเป็น union ของ cluster (ลูกค้าคนเดียวกัน)

export type AddInterestedResult =
  | { ok: true; item: InterestedProductDto }
  | { ok: false; code: 'NOT_FOUND' | 'PRODUCT_NOT_FOUND' | 'DUPLICATE' | 'LIMIT_REACHED' | 'INVALID_OPTION' }

type ProductLite = { id: string; name: string; price: Prisma.Decimal; isActive: boolean; stockQty: number | null; images: unknown }
type Row = { id: string; productId: string | null; productName: string; optionLabel: string }

const productSelect = { id: true, name: true, price: true, isActive: true, stockQty: true, images: true } as const

const stateOf = (p: ProductLite | undefined): InterestedProductState =>
  !p ? 'DELETED' : p.isActive ? 'ACTIVE' : 'INACTIVE'

// images[0] คือ fileId ของ storage (pattern เดียวกับหน้าอื่น)
const firstImage = (p: ProductLite | undefined): string | null =>
  p && Array.isArray(p.images) && typeof p.images[0] === 'string' ? (p.images[0] as string) : null

function toDto(r: Row, p: ProductLite | undefined): InterestedProductDto {
  return {
    id: r.id,
    productId: r.productId,
    name: r.productName,
    optionLabel: r.optionLabel,
    state: stateOf(p),
    imageFileId: firstImage(p),
  }
}

export async function addInterestedProduct(p: {
  shopId: string
  conversationId: string
  userId: string
  productId: string
  selections?: OptionSelection[]
}): Promise<AddInterestedResult> {
  const owned = (await expandClusters([p.conversationId], p.shopId)).get(p.conversationId)
  if (!owned) return { ok: false, code: 'NOT_FOUND' }

  const product = await prisma.product.findFirst({
    where: { id: p.productId, shopId: p.shopId },
    select: { ...productSelect, attributes: true },
  })
  if (!product) return { ok: false, code: 'PRODUCT_NOT_FOUND' }

  const built = buildOptionLabel(normalizeAttributes(product.attributes), p.selections ?? [])
  if (!built.ok) return { ok: false, code: 'INVALID_OPTION' }

  // ponytail: นับแล้วค่อย insert ไม่ atomic — สองคำขอพร้อมกันอาจเกิน 10 เล็กน้อย (อ่านตัดที่ 10 อยู่แล้ว, P-6)
  const count = await prisma.chatInterestedProduct.count({
    where: { shopId: p.shopId, conversationId: p.conversationId },
  })
  if (count >= INTERESTED_PRODUCT_MAX) return { ok: false, code: 'LIMIT_REACHED' }

  const id = crypto.randomUUID()
  try {
    const res = await prisma.chatInterestedProduct.createMany({
      data: [{
        id,
        shopId: p.shopId,
        conversationId: p.conversationId,
        productId: product.id,
        productName: product.name,
        optionLabel: built.label,
        createdByUserId: p.userId,
      }],
      skipDuplicates: true,
    })
    if (res.count === 0) return { ok: false, code: 'DUPLICATE' }
  } catch (e) {
    // สินค้าถูกลบระหว่างทาง → FK ล้ม
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      return { ok: false, code: 'PRODUCT_NOT_FOUND' }
    }
    throw e
  }
  return {
    ok: true,
    item: toDto({ id, productId: product.id, productName: product.name, optionLabel: built.label }, product),
  }
}

// ลบเฉพาะแถวที่ผู้ใช้สั่งเท่านั้น — ห้ามมีตัวลบอื่น (AI/ระบบไม่ลบ)
export async function removeInterestedProduct(p: {
  shopId: string
  conversationId: string
  rowId: string
}): Promise<{ ok: boolean }> {
  const ids = (await expandClusters([p.conversationId], p.shopId)).get(p.conversationId)
  if (!ids) return { ok: false }
  const res = await prisma.chatInterestedProduct.deleteMany({
    where: { id: p.rowId, shopId: p.shopId, conversationId: { in: ids } },
  })
  return { ok: res.count > 0 }
}

async function loadUnion(shopId: string, conversationId: string) {
  const ids = (await expandClusters([conversationId], shopId)).get(conversationId)
  if (!ids) return null
  const rows = await prisma.chatInterestedProduct.findMany({
    where: { shopId, conversationId: { in: ids } },
    orderBy: { createdAt: 'desc' },
  })
  // ตัดซ้ำด้วย productId+optionLabel (ใหม่สุดชนะ เพราะเรียงใหม่→เก่า) แล้วตัดเหลือ 10 (P-6)
  const seen = new Set<string>()
  const kept: typeof rows = []
  for (const r of rows) {
    const key = r.productId ? `${r.productId}|${r.optionLabel}` : `row:${r.id}`
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(r)
    if (kept.length >= INTERESTED_PRODUCT_MAX) break
  }
  const pids = [...new Set(kept.map((r) => r.productId).filter((x): x is string => !!x))]
  const products = pids.length
    ? await prisma.product.findMany({ where: { id: { in: pids }, shopId }, select: productSelect })
    : []
  return { kept, byId: new Map(products.map((x) => [x.id, x as ProductLite])) }
}

export async function listInterestedProducts(shopId: string, conversationId: string): Promise<InterestedProductDto[] | null> {
  const u = await loadUnion(shopId, conversationId)
  if (!u) return null
  return u.kept.map((r) => toDto(r, r.productId ? u.byId.get(r.productId) : undefined))
}

export async function listInterestedForPrompt(shopId: string, conversationId: string): Promise<PromptProduct[]> {
  const u = await loadUnion(shopId, conversationId)
  if (!u) return []
  return u.kept.map((r) => {
    const pr = r.productId ? u.byId.get(r.productId) : undefined
    const state = stateOf(pr)
    return {
      name: r.productName,
      optionLabel: r.optionLabel,
      state,
      // ราคาเฉพาะสินค้าเปิดขาย — กฎเดียวกับ buildProductBlock (ไม่ให้ AI อ้างราคาของที่ขายไม่ได้)
      price: state === 'ACTIVE' ? pr!.price.toFixed(2) : null,
      stockQty: state === 'ACTIVE' ? pr!.stockQty : null,
    }
  })
}
