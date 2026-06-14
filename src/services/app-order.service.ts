/**
 * App order service — map SafePay Order → shape ที่แอปคาดหวัง
 * (Order / OrderDetail / Invoice ใน Deep-App src/api/types.ts).
 *
 * domain mismatch: order ของ SafePay มาจาก seller สร้าง (ไม่ผูก auction).
 * จน Phase 2 (ผูก auction-win → order) `auctionId` จะว่าง. status map:
 *   PENDING/SHIPPED → awaiting_payment · CONFIRMED → completed · CANCELLED → cancelled
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { settleEndedAuctions } from '@/services/auction.service'

type OrderRow = Prisma.OrderGetPayload<{
  include: { items: true; shop: true; review: true }
}>

export type AppOrderStatus = 'awaiting_payment' | 'completed' | 'cancelled'

function mapStatus(s: string): AppOrderStatus {
  if (s === 'CONFIRMED') return 'completed'
  if (s === 'CANCELLED') return 'cancelled'
  return 'awaiting_payment' // PENDING | SHIPPED
}

export type AppOrder = {
  id: string
  auctionId: string
  title: string
  imageUrl: string
  amount: number
  status: AppOrderStatus
  shopId: string
  createdAtMs: number
  reviewed: boolean
}

function toOrder(o: OrderRow): AppOrder {
  const first = o.items[0]
  return {
    id: o.id,
    auctionId: o.auctionId ?? '', // Phase 2: order ที่มาจากชนะประมูลจะมี auctionId
    title: first?.name ?? 'คำสั่งซื้อ',
    imageUrl: '',
    amount: Number(o.totalAmount),
    status: mapStatus(o.status),
    shopId: o.shopId,
    createdAtMs: o.createdAt.getTime(),
    reviewed: o.review !== null,
  }
}

const INCLUDE = { items: true, shop: true, review: true } as const

export async function listBuyerOrders(userId: string): Promise<AppOrder[]> {
  await settleEndedAuctions() // ปิดประมูลที่จบ + ออก order ให้ผู้ชนะ ก่อน list
  const rows = await prisma.order.findMany({
    where: { buyerUserId: userId },
    include: INCLUDE,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toOrder)
}

/** ออเดอร์ที่ "ชนะ/สำเร็จ" (สำหรับหน้า me/won) — CONFIRMED */
export async function listWonOrders(userId: string): Promise<AppOrder[]> {
  await settleEndedAuctions()
  const rows = await prisma.order.findMany({
    where: { buyerUserId: userId, status: 'CONFIRMED' },
    include: INCLUDE,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toOrder)
}

export type AppInvoice = {
  orderId: string
  amount: number
  fee: number
  total: number
  payToName: string
  payToBank: string
  dueMs: number
}

/** OrderDetail = Order + invoice (invoice เฉพาะตอนยังไม่จ่าย) */
export async function getBuyerOrderDetail(
  userId: string,
  orderId: string,
): Promise<(AppOrder & { invoice: AppInvoice | null }) | null> {
  const o = await prisma.order.findFirst({
    where: { id: orderId, buyerUserId: userId },
    include: { ...INCLUDE, shop: { include: { user: { select: { displayName: true } } } } },
  })
  if (!o) return null
  const base = toOrder(o as OrderRow)

  const invoice: AppInvoice | null =
    base.status === 'awaiting_payment'
      ? {
          orderId: o.id,
          amount: Number(o.totalAmount),
          fee: 0,
          total: Number(o.totalAmount),
          payToName: o.shop.shopName,
          payToBank: '', // SafePay ยังไม่เก็บบัญชีรับเงินต่อ order (escrow ภายนอก)
          dueMs: o.createdAt.getTime() + 72 * 3600 * 1000,
        }
      : null

  return { ...base, invoice }
}

/** ยืนยัน order เป็นของ buyer คนนี้ แล้วคืน publicToken (ไว้เรียก createReview ของเว็บ) */
export async function getOrderTokenForBuyer(
  userId: string,
  orderId: string,
): Promise<string | null> {
  const o = await prisma.order.findFirst({
    where: { id: orderId, buyerUserId: userId },
    select: { publicToken: true },
  })
  return o?.publicToken ?? null
}
