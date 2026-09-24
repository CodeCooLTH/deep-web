/**
 * ใบเสร็จรับเงินของร้านบริการ (feature 00065) — ออกเลข / อ่านข้อมูลหน้าพิมพ์ / ข้อมูลออกใบเสร็จของร้าน
 *
 * ด่านสิทธิ์ทั้งหมดอยู่ที่นี่ (BR-RCP-17) — route แค่ resolve ร้านที่ผู้ใช้เป็นสมาชิก + แปล error
 */
import { cache } from 'react'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { receiptPeriodTH } from '@/lib/format-date'
import { canIssueReceipt, formatReceiptNo, type UpdateReceiptProfileInput } from '@/lib/receipt'

export type ReceiptErrorCode = 'ORDER_NOT_FOUND' | 'NOT_SERVICE_SHOP' | 'ORDER_NOT_ISSUABLE'

export class ReceiptError extends Error {
  constructor(public code: ReceiptErrorCode) {
    super(code)
  }
}

export type IssuedReceipt = { receiptNo: string; issuedAt: Date }

/**
 * ออกเลขครั้งแรก หรือคืนใบเดิม (BR-RCP-01/04/05)
 *
 * ออกเลขกับสร้าง OrderReceipt อยู่ในทรานแซกชันเดียว: ถ้าอีกเครื่องออกให้ออเดอร์นี้ไปก่อน
 * `OrderReceipt_orderId_key` ชน → ทั้งทรานแซกชัน rollback (ตัวนับย้อนด้วย = ไม่ข้ามเลข)
 * แล้วอ่านใบที่อีกเครื่องออกคืน ⇒ ทั้งสองเครื่องได้เลขเดียวกัน (AC-RCP-14)
 */
export async function issueOrReadReceipt(input: {
  shopId: string
  orderToken: string
  userId: string
}): Promise<IssuedReceipt> {
  const order = await prisma.order.findFirst({
    where: { publicToken: input.orderToken, shopId: input.shopId },
    select: {
      id: true,
      status: true,
      shop: { select: { vertical: true } },
      receipt: { select: { receiptNo: true, issuedAt: true } },
    },
  })
  if (!order) throw new ReceiptError('ORDER_NOT_FOUND')
  // ใบที่ออกแล้วเปิดได้เสมอ แม้ภายหลังยกเลิก (BR-RCP-09)
  if (order.receipt) return order.receipt
  if (order.shop.vertical !== 'SERVICE_QUEUE') throw new ReceiptError('NOT_SERVICE_SHOP')
  if (!canIssueReceipt({ vertical: order.shop.vertical, status: order.status })) {
    throw new ReceiptError('ORDER_NOT_ISSUABLE')
  }

  const period = receiptPeriodTH(new Date())
  try {
    return await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ lastSeq: number }[]>`
        INSERT INTO "ShopReceiptCounter" ("shopId", "period", "lastSeq")
        VALUES (${input.shopId}, ${period}, 1)
        ON CONFLICT ("shopId", "period")
        DO UPDATE SET "lastSeq" = "ShopReceiptCounter"."lastSeq" + 1
        RETURNING "lastSeq"`
      const created = await tx.orderReceipt.create({
        data: {
          orderId: order.id,
          shopId: input.shopId,
          receiptNo: formatReceiptNo(period, rows[0].lastSeq),
          issuedByUserId: input.userId,
        },
        select: { receiptNo: true, issuedAt: true },
      })
      return created
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await prisma.orderReceipt.findUnique({
        where: { orderId: order.id },
        select: { receiptNo: true, issuedAt: true },
      })
      if (existing) return existing
    }
    throw err
  }
}

/** เลขใบเสร็จของออเดอร์ (null = ยังไม่เคยออก) — หน้ารายละเอียดออเดอร์ใช้ตัดสินคำบนเมนู */
export async function getReceiptNoForOrder(orderId: string): Promise<string | null> {
  const r = await prisma.orderReceipt.findUnique({ where: { orderId }, select: { receiptNo: true } })
  return r?.receiptNo ?? null
}

/**
 * ข้อมูลหน้าพิมพ์ — scope ด้วย shopId ใน WHERE · null = ไม่เจอ/ยังไม่เคยออกใบ
 * `cache` — generateMetadata กับตัวหน้าเรียกคู่กันใน request เดียว (ชื่อไฟล์ PDF) ไม่ต้อง query ซ้ำ
 * (หน้าพิมพ์ไม่ออกเลขเอง — ออกได้ทางเดียวคือ POST เพื่อให้การเปิดลิงก์ซ้ำ/prefetch ไม่เผลอจองเลข)
 */
export const getReceiptView = cache(async (input: { shopId: string; orderToken: string }) => {
  const order = await prisma.order.findFirst({
    where: { publicToken: input.orderToken, shopId: input.shopId },
    select: {
      status: true,
      buyerName: true,
      buyerContact: true,
      paymentMethod: true,
      discount: true,
      vatRate: true,
      vatAmount: true,
      totalAmount: true,
      items: { select: { name: true, description: true, qty: true, price: true } }, // ลำดับเดียวกับ getOrderForShop (ไม่ orderBy)
      payments: { select: { method: true, amount: true, voidedAt: true } },
      createdBy: { select: { displayName: true } },
      receipt: { select: { receiptNo: true, issuedAt: true } },
      shop: {
        select: {
          shopName: true,
          address: true,
          logo: true,
          receiptProfile: { select: { legalName: true, address: true, taxId: true, phone: true, stamp: true } },
        },
      },
    },
  })
  if (!order?.receipt) return null
  // spread เพื่อให้ชนิดของ receipt เป็น non-null ตาม narrowing ข้างบน (ไม่ต้อง `!` ที่ผู้เรียก)
  return { ...order, receipt: order.receipt }
})

export type ReceiptView = NonNullable<Awaited<ReturnType<typeof getReceiptView>>>

export async function getReceiptProfile(shopId: string) {
  return prisma.shopReceiptProfile.findUnique({
    where: { shopId },
    select: { legalName: true, address: true, taxId: true, phone: true, stamp: true },
  })
}

/** สิทธิ์ OWNER/ADMIN มาจาก `requireShopMember` ที่ route (ทั้งสองค่าที่ `ShopMember.role` มี) */
export async function updateReceiptProfile(shopId: string, input: UpdateReceiptProfileInput) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { vertical: true } })
  if (shop?.vertical !== 'SERVICE_QUEUE') throw new ReceiptError('NOT_SERVICE_SHOP')
  return prisma.shopReceiptProfile.upsert({
    where: { shopId },
    create: { shopId, ...input },
    update: input,
    select: { legalName: true, address: true, taxId: true, phone: true, stamp: true },
  })
}
