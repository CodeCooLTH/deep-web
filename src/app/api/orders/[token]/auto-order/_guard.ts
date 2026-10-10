import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessShopWith } from '@/lib/shop-capability'
import type { Capability } from '@/lib/shop-permissions'
import { sessionUserId } from '@/lib/session-user'
import { forbiddenRoleResponse } from '@/lib/forbidden-role'

/**
 * ด่านของปุ่มบนการ์ดร่าง (00061)
 *
 * 🛑 **ฝั่งร้านเท่านั้น** ต่างจาก `/cancel` ที่ผู้ซื้อก็กดได้ — ร่างเป็นของภายในที่ลูกค้า
 * ไม่เคยเห็น (BR-ACO-21) ⇒ ไม่มีกรณีที่ผู้ซื้อควรมีสิทธิ์แตะมันเลย
 *
 * ใช้ `canAccessShopWith` (membership + capability ที่ caller ระบุ) ไม่ใช่ `shop.userId` ตรง ๆ — พนักงานที่ถูกเชิญเปิดหน้า
 * ออเดอร์ได้ ก็ต้องกดปุ่มบนการ์ดได้ด้วย (บั๊กคลาสเดิมที่ `/cancel` เคยเจอและแก้ไปแล้ว)
 */
export async function requireDraftOwner(token: string, cap: Capability): Promise<
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
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 }) }
  }
  if (!(await canAccessShopWith(order.shopId, userId, cap))) {
    // สมาชิกร้านที่ไม่มี capability = 403 FORBIDDEN_ROLE (บอกตรง ๆ ว่าบทบาทนี้ทำไม่ได้) ·
    // คนนอกร้าน = 404 — ต้องแยกไม่ออกว่า token นี้มีอยู่จริงไหม; "เป็นสมาชิก" วัดด้วย O1 (ทุกบทบาทที่ใช้งานได้มี O1)
    if (await canAccessShopWith(order.shopId, userId, 'O1')) {
      return { ok: false, response: forbiddenRoleResponse() }
    }
    return { ok: false, response: NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 }) }
  }

  return { ok: true, shopId: order.shopId, userId }
}
