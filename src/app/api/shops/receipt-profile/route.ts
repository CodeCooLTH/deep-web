/**
 * PATCH /api/shops/receipt-profile — ข้อมูลออกใบเสร็จของร้านที่ active (feature 00065)
 *
 * สิทธิ์: สมาชิกร้าน (OWNER/ADMIN — สองค่าเดียวของ `ShopMember.role`) ผ่าน `requireShopMember`
 * ด่าน vertical อยู่ที่ `updateReceiptProfile` (BR-RCP-17)
 *
 * Base: src/app/api/shops/payout/route.ts (PATCH การ์ดเสริมของหน้า /shop)
 */
import { NextRequest } from 'next/server'
import * as v from 'valibot'

import { requireShopMember, jsonNoStore } from '@/lib/shop-api-guard'
import { UpdateReceiptProfileSchema } from '@/lib/receipt'
import { ReceiptError, updateReceiptProfile } from '@/services/receipt.service'

export async function PATCH(req: NextRequest) {
  const ctx = await requireShopMember()
  if ('error' in ctx) return ctx.error

  const parsed = v.safeParse(UpdateReceiptProfileSchema, await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonNoStore(
      { error: 'VALIDATION_ERROR', message: parsed.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' },
      { status: 400 },
    )
  }

  try {
    return jsonNoStore(await updateReceiptProfile(ctx.shopId, parsed.output))
  } catch (e) {
    if (e instanceof ReceiptError) return jsonNoStore({ error: e.code }, { status: 403 })
    console.error('[shops/receipt-profile] unexpected error', e)
    return jsonNoStore({ error: 'INTERNAL' }, { status: 500 })
  }
}
