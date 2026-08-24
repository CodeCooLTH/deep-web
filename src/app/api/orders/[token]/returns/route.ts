// feature 00056 — ใบคืนของ: อ่านสิทธิ์/รายการที่คืนได้ + เปิดใบคืน
//
// คีย์ด้วย order token เหมือน route อื่นของออเดอร์ — สิทธิ์ผูกกับของที่ร้านเป็นเจ้าของอยู่แล้ว

import { NextResponse, type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import * as v from 'valibot'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessShop } from '@/lib/shop-context'
import { sessionUserId } from '@/lib/session-user'
import {
  OrderReturnError,
  createOrderReturn,
  getReturnEligibility,
} from '@/services/order-return.service'

export const dynamic = 'force-dynamic'

/** ตรวจสิทธิ์ + คืน { shopId, orderId, userId } — ทุก handler ในไฟล์นี้เริ่มจากตัวนี้ */
async function guard(token: string) {
  const userId = sessionUserId(await getServerSession(authOptions))
  if (!userId) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { id: true, shopId: true },
  })
  if (!order) return { error: NextResponse.json({ error: 'Order not found' }, { status: 404 }) }
  if (!(await canAccessShop(order.shopId, userId))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { shopId: order.shopId, orderId: order.id, userId }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const g = await guard(token)
  if ('error' in g) return g.error
  return NextResponse.json(await getReturnEligibility(g.shopId, g.orderId))
}

/**
 * Valibot ที่ชั้น API — กติกาเชิงธุรกิจ (คืนได้ไหม/เกินจำนวนไหม) อยู่ที่ service
 * ตรงนี้ตรวจแค่ **รูปร่างของข้อมูล** เท่านั้น ห้ามเขียนกฎซ้ำสองที่ (HR16)
 */
const CreateReturnSchema = v.object({
  items: v.pipe(
    v.array(
      v.object({
        orderItemId: v.pipe(v.string(), v.minLength(1)),
        qty: v.pipe(v.number(), v.integer(), v.minValue(1)),
      }),
    ),
    v.minLength(1, 'เลือกรายการที่จะคืนอย่างน้อย 1 รายการ'),
  ),
  reason: v.optional(v.nullable(v.string())),
  payer: v.picklist(['SHOP', 'BUYER']),
  trackingSource: v.picklist(['ISHIP', 'MANUAL', 'NONE']),
  manualTrackingNo: v.optional(v.nullable(v.string())),
  manualCourier: v.optional(v.nullable(v.string())),
  countAsCost: v.optional(v.boolean()),
  shippingCost: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0)))),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const g = await guard(token)
  if ('error' in g) return g.error

  const parsed = v.safeParse(CreateReturnSchema, await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  try {
    return NextResponse.json(await createOrderReturn(g.shopId, g.userId, g.orderId, parsed.output))
  } catch (err) {
    // ข้อความจาก service อ่านรู้เรื่องอยู่แล้ว (บอกว่าคืนได้อีกกี่ชิ้น/ทำไมคืนไม่ได้)
    // ส่งต่อตรง ๆ ดีกว่าแปลงเป็น "เกิดข้อผิดพลาด" ซึ่งไม่บอกทางแก้
    if (err instanceof OrderReturnError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 })
    }
    throw err
  }
}
