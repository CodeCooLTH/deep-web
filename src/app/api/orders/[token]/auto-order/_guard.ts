import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessShop } from '@/lib/shop-context'
import { sessionUserId } from '@/lib/session-user'

/**
 * ด่านของปุ่มบนการ์ดร่าง (00061)
 *
 * 🛑 **ฝั่งร้านเท่านั้น** ต่างจาก `/cancel` ที่ผู้ซื้อก็กดได้ — ร่างเป็นของภายในที่ลูกค้า
 * ไม่เคยเห็น (BR-ACO-21) ⇒ ไม่มีกรณีที่ผู้ซื้อควรมีสิทธิ์แตะมันเลย
 *
 * ใช้ `canAccessShop` (membership) ไม่ใช่ `shop.userId` ตรง ๆ — พนักงานที่ถูกเชิญเปิดหน้า
 * ออเดอร์ได้ ก็ต้องกดปุ่มบนการ์ดได้ด้วย (บั๊กคลาสเดิมที่ `/cancel` เคยเจอและแก้ไปแล้ว)
 */
export async function requireDraftOwner(token: string): Promise<
  { ok: true; shopId: string; userId: string } | { ok: false; response: NextResponse }
> {
  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { shopId: true, status: true },
  })
  if (!order) {
    return { ok: false, response: NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 }) }
  }

  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!userId || !(await canAccessShop(order.shopId, userId))) {
    // ตอบ 404 ไม่ใช่ 403 — คนที่ไม่ใช่เจ้าของร้านต้องแยกไม่ออกว่า token นี้มีอยู่จริงไหม
    return { ok: false, response: NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 }) }
  }

  return { ok: true, shopId: order.shopId, userId }
}
