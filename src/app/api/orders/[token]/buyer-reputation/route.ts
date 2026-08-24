// feature 00055 — สถิติผู้ซื้อระดับแพลตฟอร์มของออเดอร์ใบนี้ (BR-BR-01/02)
//
// 🛑 คีย์ด้วย **order token ไม่ใช่ customerId** โดยตั้งใจ 2 เหตุผล:
//   1. สิทธิ์ผูกกับของที่ร้านเป็นเจ้าของอยู่แล้ว — ไล่ enumerate ลูกค้าทั้งระบบไม่ได้
//      (ถ้ารับ customerId ตรง ๆ ร้านไหนก็ยิงดูประวัติใครก็ได้ ซึ่งไม่ใช่สิ่งที่ D-1 อนุญาต)
//   2. ทั้ง 2 ทางเข้าที่เปิดพัสดุได้ (หน้าคำสั่งซื้อ + แผงร่างในห้องแชท) ใช้
//      `ShipmentCreateForm` ตัวเดียวกันซึ่งมี `orderToken` อยู่ในมือแล้ว ⇒ ไม่ต้องร้อย prop
//      ผ่าน parent คนละสายสองสาย แล้วเสี่ยงต่อการต่อครบแค่ทางเดียว

import { NextResponse, type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'

import { prisma } from '@/lib/prisma'
import { canAccessShop } from '@/lib/shop-context'
import { sessionUserId } from '@/lib/session-user'
import { getBuyerReputation } from '@/services/buyer-reputation.service'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  // 🛑 sessionUserId() ไม่ใช่ `(session.user as any).id` — "มี session" ≠ "รู้ว่าเป็นใคร"
  // (docs/conventions/session-exists-is-not-identity.md)
  const userId = sessionUserId(await getServerSession(authOptions))
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { shopId: true, customerId: true },
  })
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (!(await canAccessShop(order.shopId, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ออเดอร์ที่ไม่มีเบอร์ = ไม่มี Customer = ไม่มีประวัติให้เล่า → `null` ไม่ใช่ก้อนศูนย์
  // (BR-BR-12 — หน้าจอต้องไม่แสดงแถบว่าง ต้องไม่แสดงเลย)
  if (!order.customerId) return NextResponse.json({ reputation: null })

  const reputation = await getBuyerReputation(order.customerId)
  return NextResponse.json({ reputation })
}
