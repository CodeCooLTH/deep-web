/**
 * POST /api/orders/[token]/receipt/buyer — ลูกค้ากด "ดูใบเสร็จ" ของงานตัวเอง (feature 00073 FR-013)
 *
 * ใบเดียวกับฝั่งร้าน (เลขเดียวกัน) · ร้านยังไม่เคยออก = ออกเลขให้ตอนนี้ · idempotent เหมือนฝั่งร้าน
 * ด่าน: session + เป็นเจ้าของงาน (buyerUserId ใน WHERE) + ปิดงานแล้ว/ไม่ใช่ไม่มาตามนัด/ค้าง 0
 * — ทั้งหมดอยู่ที่ `issueOrReadReceiptForBuyer` · route แค่แปล error
 *
 * Base (โครง guard + error mapping): src/app/api/orders/[token]/receipt/route.ts
 */
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'

import { authOptions } from '@/lib/auth'
import { sessionUserId } from '@/lib/session-user'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { ReceiptError, issueOrReadReceiptForBuyer } from '@/services/receipt.service'

export const dynamic = 'force-dynamic'

const STATUS: Record<ReceiptError['code'], number> = {
  ORDER_NOT_FOUND: 404,
  NOT_SERVICE_SHOP: 404,
  ORDER_NOT_ISSUABLE: 409,
}

const MESSAGE: Record<ReceiptError['code'], string> = {
  ORDER_NOT_FOUND: 'ไม่พบงานนี้',
  NOT_SERVICE_SHOP: 'ไม่พบงานนี้',
  ORDER_NOT_ISSUABLE: 'ใบเสร็จจะเปิดได้เมื่อร้านปิดงานและชำระครบแล้ว',
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const buyerUserId = sessionUserId(await getServerSession(authOptions))
  if (!buyerUserId) return jsonNoStore({ error: 'ต้องเข้าสู่ระบบ' }, { status: 401 })

  try {
    const r = await issueOrReadReceiptForBuyer({ orderToken: token, buyerUserId })
    return jsonNoStore({ receiptNo: r.receiptNo, issuedAt: r.issuedAt.toISOString() })
  } catch (e) {
    if (e instanceof ReceiptError) return jsonNoStore({ error: MESSAGE[e.code], code: e.code }, { status: STATUS[e.code] })
    console.error('[orders/receipt/buyer] unexpected error', e)
    return jsonNoStore({ error: 'เปิดใบเสร็จไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }, { status: 500 })
  }
}
