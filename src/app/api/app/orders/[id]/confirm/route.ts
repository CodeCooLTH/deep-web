import { NextRequest, NextResponse } from 'next/server'
import { requireAppUser } from '@/lib/app-auth'
import { getOrderTokenForBuyer } from '@/services/app-order.service'
import { confirmOrder } from '@/services/order.service'
import { ServiceJobNoShowConfirmError, SERVICE_JOB_ERROR_MESSAGE } from '@/lib/service-job'

// POST /api/app/orders/[id]/confirm — buyer กดยืนยันรับของ → CONFIRMED (escrow)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response

  const { id } = await params
  const token = await getOrderTokenForBuyer(auth.user.id, id)
  if (!token) return NextResponse.json({ error: 'ไม่พบออเดอร์' }, { status: 404 })

  try {
    await confirmOrder(token, auth.user.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    // feature 00073 — งานบริการที่ร้านปิดแบบไม่มาตามนัด ยืนยันรับบริการไม่ได้
    if (e instanceof ServiceJobNoShowConfirmError) {
      return NextResponse.json({ error: SERVICE_JOB_ERROR_MESSAGE.SERVICE_JOB_NO_SHOW_CONFIRM }, { status: 409 })
    }
    const msg = e instanceof Error ? e.message : 'ยืนยันไม่สำเร็จ'
    // assertTransition ผิดสถานะ → 409
    if (/transition|status|already/i.test(msg)) {
      return NextResponse.json({ error: 'ยืนยันรับของไม่ได้ในสถานะนี้' }, { status: 409 })
    }
    console.error('[POST /api/app/orders/[id]/confirm] failed', e)
    return NextResponse.json({ error: 'ยืนยันไม่สำเร็จ' }, { status: 500 })
  }
}
