/**
 * feature 00056 — ค่าส่ง **ขากลับ** โดยประมาณ ต่อขนส่งแต่ละเจ้า (D-2/D-5)
 *
 * 🛑 **ทำไมไม่ให้จอยิง `/api/seller/iship/price/compare` ตรง ๆ**: endpoint นั้นรับที่อยู่ปลายทาง
 * มาจาก body ⇒ จอต้องถือที่อยู่ผู้ซื้อไว้ก่อน ซึ่งแปลว่าเราต้อง serialize ที่อยู่/ชื่อ/เบอร์เข้า
 * flight payload ของหน้าที่อยู่ใต้ client layout ทุกใบ ทั้งที่ตัวเลขที่ต้องการคือ "฿เท่าไร"
 * ตัวเดียว · ตัวนี้อ่านที่อยู่ฝั่ง server แล้วคืนเฉพาะราคา
 *
 * 🛑 **สูตรไม่ได้เขียนใหม่** — เรียก `compareShippingPrices()` ตัวเดียวกับปุ่ม "เทียบราคา"
 * ของฟอร์มสร้างพัสดุ (HR16) ต่างกันแค่ที่มาของ input
 *
 * ⚠️ ทิศทางที่ประเมิน: `compareShippingPrices` ตรึงผู้ส่ง = ที่อยู่ร้านเสมอ ⇒ ราคาที่ได้คือ
 * "ร้าน → ลูกค้า" ส่วนของจริงขากลับคือ "ลูกค้า → ร้าน" · ขนส่งไทยในประเทศคิดราคาจาก
 * (น้ำหนัก/ขนาด × คู่โซน) ซึ่งสมมาตร ตัวเลขจึงตรงกันในทางปฏิบัติ — และจอเรียกมันว่า
 * "ค่าส่งโดยประมาณ" ไม่ใช่ยอดที่จะถูกตัดจริง (ยอดจริงมาตอนขนส่งชั่งน้ำหนัก)
 *
 * path เป็น `return-quote` ไม่ใช่ `returns/quote` โดยตั้งใจ — `returns/[returnId]` เป็น dynamic
 * segment ที่ static child จะบังทับ ทำให้ใบคืนที่ id ดันไปตรงกับคำนั้นเรียกไม่ได้ตลอดกาล
 */

import { NextResponse, type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import * as v from 'valibot'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessShop } from '@/lib/shop-context'
import { sessionUserId } from '@/lib/session-user'
import { mapIShipError } from '@/lib/iship/route-helpers'
import { FORWARD_SHIPMENT } from '@/lib/shipment-direction'
import { parseReturnParcel } from '@/lib/order-return'
import { compareShippingPrices } from '@/services/iship.service'

export const dynamic = 'force-dynamic'
// fan-out ไปทุกขนส่งของร้าน (ชุดละ 4) — เท่ากับ endpoint เทียบราคาของฟอร์มสร้างพัสดุ
export const maxDuration = 60

const BodySchema = v.object({
  /** กล่องที่ร้านแก้เอง (D-5) — ไม่ส่ง/ไม่ครบ = ใช้กล่องของพัสดุขาไป */
  parcel: v.optional(
    v.nullable(
      v.object({
        weight: v.pipe(v.number(), v.minValue(0)),
        width: v.pipe(v.number(), v.minValue(0)),
        length: v.pipe(v.number(), v.minValue(0)),
        height: v.pipe(v.number(), v.minValue(0)),
      }),
    ),
  ),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const userId = sessionUserId(await getServerSession(authOptions))
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // scope ownership ใน where ไม่ได้ทำได้ (คีย์คือ publicToken) จึงเช็คสิทธิ์ก่อนอ่านที่อยู่
  const head = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { id: true, shopId: true },
  })
  if (!head) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (!(await canAccessShop(head.shopId, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = v.safeParse(BodySchema, await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: head.id },
    select: {
      shippingAddress: true,
      shipments: {
        where: { status: 'CREATED', isDryRun: false, direction: FORWARD_SHIPMENT },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { weight: true, width: true, length: true, height: true },
      },
    },
  })

  const fwd = order.shipments[0]
  // กล่องที่ร้านแก้เองชนะเสมอ · ไม่ครบ = กล่องของขาไป · ไม่มีทั้งคู่ = ประเมินไม่ได้ ต้องบอกตรง ๆ
  const box =
    parseReturnParcel(parsed.output.parcel) ??
    parseReturnParcel({
      weight: fwd?.weight == null ? null : Number(fwd.weight),
      width: fwd?.width,
      length: fwd?.length,
      height: fwd?.height,
    })
  if (!box) {
    return NextResponse.json(
      { error: 'ยังไม่รู้ขนาดกล่อง จึงประเมินค่าส่งขากลับไม่ได้', code: 'NO_PARCEL' },
      { status: 400 },
    )
  }

  const addr = (order.shippingAddress ?? {}) as Record<string, string | null | undefined>

  try {
    const result = await compareShippingPrices(head.shopId, {
      receiver: {
        subdistrict: addr.subdistrict ?? null,
        district: addr.district ?? null,
        province: addr.province ?? null,
        postcode: addr.postcode ?? null,
      },
      ...box,
    })
    // คืนเฉพาะราคา — ไม่มีที่อยู่/ชื่อ/เบอร์ผู้ซื้อไหลออกไปเลย
    return NextResponse.json({ rows: result.rows, failed: result.failed, box })
  } catch (err) {
    return mapIShipError(err)
  }
}
