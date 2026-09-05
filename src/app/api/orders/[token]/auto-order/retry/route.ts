import { NextRequest, NextResponse } from 'next/server'

import {
  retryAutoOrderDraft,
} from '@/services/auto-order-detect.service'
import {
  DraftNotPromotableError,
  OrderNotFoundError,
  ProductNotInShopError,
  ShippingAddressRequiredError,
} from '@/services/order.service'
import { OutOfStockError } from '@/services/inventory-stock.service'
import { requireDraftOwner } from '../_guard'

export const dynamic = 'force-dynamic'

/**
 * POST /api/orders/[token]/auto-order/retry — ปุ่ม "อ่านใหม่" บนการ์ดร่าง
 *
 * 🛑 เดินเส้นทาง **อัตโนมัติ** — ห้าม Quick-Create (TFR-008) ต่างจากปุ่ม "เปิดฟอร์ม"
 * ที่เป็นเส้นทางมนุษย์. ปุ่มนี้ไม่มีใครกรอกอะไรเพิ่ม มันแค่ให้ระบบลองอ่านข้อความเดิมใหม่
 * ⇒ กติกาต้องเหมือนตอนอ่านครั้งแรกเป๊ะ ไม่งั้นผลลัพธ์ของปุ่มจะต่างจากผลลัพธ์อัตโนมัติ
 * ทั้งที่ input เดียวกันทุกตัวอักษร
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const guard = await requireDraftOwner(token)
  if (!guard.ok) return guard.response

  try {
    const result = await retryAutoOrderDraft(guard.shopId, token)
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof OrderNotFoundError) {
      return NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 })
    }
    if (e instanceof DraftNotPromotableError) {
      return NextResponse.json(
        { error: 'ร่างนี้ถูกจัดการไปแล้ว', code: 'DRAFT_NOT_PROMOTABLE' },
        { status: 409 },
      )
    }
    if (e instanceof ProductNotInShopError) {
      return NextResponse.json(
        { error: 'มีรายการที่ยังจับคู่กับสินค้าในร้านไม่ได้', code: 'ITEM_NOT_MATCHED' },
        { status: 409 },
      )
    }
    if (e instanceof ShippingAddressRequiredError) {
      return NextResponse.json(
        { error: 'ที่อยู่จัดส่งยังไม่ครบ', code: 'SHIPPING_ADDRESS_REQUIRED' },
        { status: 409 },
      )
    }
    if (e instanceof OutOfStockError) {
      return NextResponse.json({ error: 'สินค้าในสต๊อกไม่พอ', code: 'OUT_OF_STOCK' }, { status: 409 })
    }
    throw e
  }
}
