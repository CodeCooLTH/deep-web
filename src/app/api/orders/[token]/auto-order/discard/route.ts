import { NextRequest, NextResponse } from 'next/server'

import { discardAutoOrderDraft } from '@/services/auto-order-detect.service'
import { OrderNotFoundError } from '@/services/order.service'
import { requireDraftOwner } from '../_guard'

export const dynamic = 'force-dynamic'

/**
 * POST /api/orders/[token]/auto-order/discard — ปุ่ม "ทิ้งร่างนี้"
 *
 * 🛑 ไม่เรียก `cancelOrder()` — ร่างไม่เคยตัดสต๊อกและไม่เคยมีพัสดุ เรียกไปก็ไม่มีอะไรให้คืน
 * มีแต่จะพาผลข้างเคียงของออเดอร์จริงมาติดกับสิ่งที่ไม่เคยเป็นออเดอร์
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const guard = await requireDraftOwner(token)
  if (!guard.ok) return guard.response

  try {
    const result = await discardAutoOrderDraft(guard.shopId, token)
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof OrderNotFoundError) {
      // ร่างที่ถูกทิ้ง/หมดอายุไปแล้วก็ตกมาที่นี่ (query กรอง status='DRAFTED') — ข้อความต้อง
      // สื่อว่า "ไม่มีอะไรให้ทิ้งแล้ว" ไม่ใช่ "หาไม่เจอ" ซึ่งชวนให้คิดว่าระบบพัง
      return NextResponse.json(
        { error: 'ร่างนี้ถูกจัดการไปแล้ว', code: 'DRAFT_NOT_FOUND' },
        { status: 409 },
      )
    }
    throw e
  }
}
