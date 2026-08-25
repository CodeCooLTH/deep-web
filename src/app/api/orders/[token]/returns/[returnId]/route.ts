// feature 00056 — จัดการใบคืนที่เปิดไว้แล้ว: ออกเลขพัสดุขากลับ / ยืนยันรับคืน / ยกเลิก

import { NextResponse, type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import * as v from 'valibot'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessShop } from '@/lib/shop-context'
import { sessionUserId } from '@/lib/session-user'
import { mapIShipError } from '@/lib/iship/route-helpers'
import { createReturnShipment } from '@/services/iship.service'
import {
  OrderReturnError,
  cancelOrderReturn,
  receiveOrderReturn,
} from '@/services/order-return.service'
import { RETURN_STATUS, RETURN_TRACKING_SOURCE, parseReturnParcel } from '@/lib/order-return'
import { recordOrderEvent } from '@/services/order-event.service'

export const dynamic = 'force-dynamic'
// ออกเลขพัสดุยิง iShip 1–2 คำขอ
export const maxDuration = 60

const ActionSchema = v.object({ action: v.picklist(['ship', 'receive', 'cancel']) })

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; returnId: string }> },
) {
  const { token, returnId } = await params

  const userId = sessionUserId(await getServerSession(authOptions))
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { id: true, shopId: true },
  })
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (!(await canAccessShop(order.shopId, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = v.safeParse(ActionSchema, await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })

  try {
    if (parsed.output.action === 'receive') {
      return NextResponse.json(await receiveOrderReturn(order.shopId, userId, returnId))
    }
    if (parsed.output.action === 'cancel') {
      return NextResponse.json(await cancelOrderReturn(order.shopId, userId, returnId))
    }

    // ── ขยับใบคืนเป็น "ของกำลังเดินทางกลับ" ──────────────────────────────────
    const ret = await prisma.orderReturn.findFirst({
      where: { id: returnId, shopId: order.shopId, orderId: order.id },
      select: {
        id: true,
        status: true,
        trackingSource: true,
        manualTrackingNo: true,
        returnCourierCode: true,
        returnParcel: true,
      },
    })
    if (!ret) return NextResponse.json({ error: 'ไม่พบใบคืนของนี้' }, { status: 404 })
    if (ret.status !== RETURN_STATUS.REQUESTED) {
      return NextResponse.json({ error: 'ใบคืนนี้ดำเนินการไปแล้ว' }, { status: 400 })
    }

    /**
     * 3 เส้นทางตามรูปแบบที่ร้านเลือกไว้ตอนเปิดใบ (หัวหน้าระบุ 4 รูปแบบ 2026-08-24)
     *   ISHIP  → ระบบเปิดพัสดุให้ (ตัดเครดิตร้าน)
     *   MANUAL → มีเลขอยู่แล้วตั้งแต่ตอนเปิดใบ แค่ขยับสถานะ
     *   NONE   → ไม่มีเลขเลย ก็ยังขยับได้ (ลูกค้าส่งมาเองโดยไม่แจ้ง — ไม่ใช่ข้อผิดพลาด)
     *
     * 🛑 ห้ามให้ใบที่เลือก MANUAL/NONE ไปเรียก `createReturnShipment` — ร้านจะจ่ายค่าส่ง
     * โดยไม่ได้ตั้งใจ และต้นทุนจะไม่ตรงกับที่ตกลงกับลูกค้า
     */
    let shipment: Awaited<ReturnType<typeof createReturnShipment>> | null = null
    if (ret.trackingSource === RETURN_TRACKING_SOURCE.ISHIP) {
      /**
       * 🛑 ขากลับเป็นพัสดุ **คนละใบ** มีขนส่งของตัวเอง (D-3) — ทางส่ง override มีอยู่ใน
       * `createReturnShipment()` ตั้งแต่วันแรกแต่ไม่เคยมีใครส่งเข้ามา ⇒ ร้านที่เลือก
       * "ไปรษณีย์ไทย" ตอนเปิดใบ จะได้พัสดุขากลับกับเจ้าเดียวกับขาไปเสมอ โดยไม่มีอะไรฟ้อง
       *
       * ค่า `undefined` (ไม่ใช่ `null`) เมื่อร้านไม่ได้เลือก — `createReturnShipment` ใช้
       * `??` ไล่ลงไปหาเจ้าของขาไปแล้วค่าตั้งต้นของบัญชี ซึ่ง `null` จะไปหยุดโซ่นั้น
       */
      const box = parseReturnParcel(ret.returnParcel)
      shipment = await createReturnShipment(order.shopId, userId, order.id, {
        courierCode: ret.returnCourierCode ?? undefined,
        ...(box ?? {}),
      })
    }

    /**
     * ผูกพัสดุ + ขยับสถานะ **หลัง** ยิงสำเร็จเท่านั้น — ถ้าเขียนก่อนแล้ว iShip ล้ม ใบคืนจะค้าง
     * สถานะ SHIPPING โดยไม่มีเลขพัสดุจริง แล้วปุ่มออกเลขจะหายไปตลอดกาล
     */
    await prisma.$transaction(async (tx) => {
      await tx.orderReturn.update({
        where: { id: ret.id },
        data: {
          ...(shipment ? { shipmentId: shipment.id } : {}),
          status: RETURN_STATUS.SHIPPING,
        },
      })
      await recordOrderEvent(tx, {
        orderId: order.id,
        type: 'RETURN_SHIPPED',
        actorUserId: userId,
        meta: {
          returnId: ret.id,
          trackingSource: ret.trackingSource,
          trackingNo: shipment?.trackingNo ?? ret.manualTrackingNo ?? null,
        } as never,
      })
    })

    return NextResponse.json({ id: ret.id, shipment })
  } catch (err) {
    if (err instanceof OrderReturnError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 })
    }
    return mapIShipError(err)
  }
}
