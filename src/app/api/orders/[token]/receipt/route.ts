/**
 * POST /api/orders/[token]/receipt — ออกเลขใบเสร็จครั้งแรก หรือคืนใบเดิม (feature 00065)
 *
 * idempotent: กดซ้ำ/กดพร้อมกันสองเครื่อง ได้เลขเดิมเสมอ (AC-RCP-13/14)
 * ด่าน vertical/สถานะอยู่ที่ `issueOrReadReceipt` (BR-RCP-17)
 *
 * Base (โครง guard + error mapping): src/app/api/orders/[token]/payments/route.ts
 */
import { NextRequest } from 'next/server'

import { requireShopMember, jsonNoStore } from '@/lib/shop-api-guard'
import { ReceiptError, issueOrReadReceipt } from '@/services/receipt.service'

export const dynamic = 'force-dynamic'

const STATUS: Record<ReceiptError['code'], number> = {
  ORDER_NOT_FOUND: 404,
  NOT_SERVICE_SHOP: 403,
  ORDER_NOT_ISSUABLE: 409,
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const ctx = await requireShopMember({ shopId: request.nextUrl.searchParams.get('shopId') })
  if ('error' in ctx) return ctx.error

  try {
    const r = await issueOrReadReceipt({ shopId: ctx.shopId, orderToken: token, userId: ctx.userId })
    return jsonNoStore({ receiptNo: r.receiptNo, issuedAt: r.issuedAt.toISOString() })
  } catch (e) {
    if (e instanceof ReceiptError) return jsonNoStore({ error: e.code }, { status: STATUS[e.code] })
    console.error('[orders/receipt] unexpected error', e)
    return jsonNoStore({ error: 'INTERNAL' }, { status: 500 })
  }
}
