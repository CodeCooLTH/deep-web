/**
 * DELETE /api/orders/[token]/payments/[paymentId] — ยกเลิกรายการรับเงินที่กรอกผิด
 *
 * 🛑 "ยกเลิก" ไม่ใช่ "ลบ" — แถวยังอยู่ พร้อมเวลา คนที่ยกเลิก และเหตุผล
 * ประวัติเงินที่ลบทิ้งได้ไม่ใช่ประวัติ (หัวหน้า: "จ่ายมาแล้ว แก้ไม่ได้" ⇒ กลับรายการแทนการแก้)
 *
 * ใช้ DELETE ตาม REST ที่ผู้เรียกคาดหวัง แม้ปลายทางจะเป็น soft-void — ให้ตรงกับ
 * `/api/account/link/remove` และ endpoint อื่นในโปรเจกต์ที่ทำแบบเดียวกัน
 */
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextRequest } from 'next/server'
import * as v from 'valibot'

import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { OrderPaymentError, voidPayment } from '@/services/order-payment.service'

export const dynamic = 'force-dynamic'

const VoidSchema = v.object({
  reason: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
})

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; paymentId: string }> },
) {
  const { token, paymentId } = await params
  // O6 (เจ้าของ+ผู้จัดการ) — ยกเลิกรายการเงินที่บันทึกแล้วหนักกว่าการบันทึก (O5) · มติ Controller 00071 P3
  // ?shopId= จากกล่องแชท — เหตุผลเดียวกับ route แม่ (เธรดของอีกร้านเปิดได้ขณะ active คนละร้าน)
  const gate = await requireShopCapability(await getServerSession(authOptions), 'O6', { shopId: request.nextUrl.searchParams.get('shopId') })
  if (!gate.ok) return gate.response
  const ctx = gate

  const parsed = v.safeParse(VoidSchema, await request.json().catch(() => null))
  if (!parsed.success) return jsonNoStore({ error: 'VALIDATION_ERROR' }, { status: 400 })

  try {
    const result = await voidPayment({
      shopId: ctx.shopId,
      // ผูกกับออเดอร์ใน URL ด้วย — ไม่งั้น URL โกหก: ยกเลิกรายการของออเดอร์ A ผ่าน token
      // ของออเดอร์ B ได้สำเร็จเงียบ ๆ (เกิดจริงได้เมื่อ client ถือ token ค้างจากจอก่อนหน้า)
      orderToken: token,
      paymentId,
      voidedByUserId: ctx.userId,
      reason: parsed.output.reason,
    })
    return jsonNoStore(result)
  } catch (e) {
    if (e instanceof OrderPaymentError) {
      const status = e.code === 'PAYMENT_NOT_FOUND' ? 404 : 409
      return jsonNoStore({ error: e.code }, { status })
    }
    console.error('[DELETE /api/orders/[token]/payments/[id]] shopId:', ctx.shopId, e)
    return jsonNoStore({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
