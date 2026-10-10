import { NextResponse } from 'next/server'
import { rejectInAppPurchase } from '@/lib/app-purchase-guard'
import * as v from 'valibot'
import { SubscribeInspectionSchema } from '@/lib/validations'
import { subscribeInspectionPlan } from '@/services/inspection-plan.service'
import { errorResponse, mapInspectionError, requireInspectionShop } from '../_shared'

/**
 * POST /api/seller/inspection/subscribe — OWNER สมัครแผนครั้งแรก (API §4.2)
 *
 * 🛑 ลำดับด่านทั้งหมดอยู่ใน service ในทรานแซกชันเดียว: ประเภทร้าน → เจ้าของ → มีแผนอยู่แล้วไหม
 *    → **โควตาก่อนเงินเสมอ** → ความยินยอม → หักเครดิต → สร้างแผน → เปิดรอบตรวจ
 *    เหตุผลที่โควตาต้องมาก่อนเงิน: หักเงินแล้วเจอว่าเต็มคือทางตันที่ต้องแก้ด้วยมือทีละราย
 *    เพราะกฎ "ไม่คืนเงิน" เป็นของเราเอง
 */
export async function POST(request: Request) {
  // ในแอป (iOS/Android) ห้ามจ่ายเงินให้ Deep นอกสโตร์ — ด่านจริง ไม่ใช่แค่ซ่อนปุ่ม (app-purchase-guard.ts)
  const inAppBlocked = await rejectInAppPurchase()
  if (inAppBlocked) return inAppBlocked
  const auth = await requireInspectionShop('T4')
  if ('response' in auth) return auth.response

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(SubscribeInspectionSchema, body)
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', { message: parsed.issues[0]?.message })
  }

  const now = new Date()
  try {
    const result = await subscribeInspectionPlan({
      shopId: auth.shopId,
      userId: auth.userId,
      step: parsed.output.step,
      termsAccepted: parsed.output.termsAccepted,
      now,
    })
    return NextResponse.json(
      {
        plan: { step: result.step, status: 'ACTIVE', termsAcceptedAt: result.termsAcceptedAt },
        acceptance: result.acceptance,
        roundsCreated: result.roundsCreated,
      },
      { status: 201 },
    )
  } catch (e) {
    return mapInspectionError(e, {
      tag: 'seller/inspection/subscribe',
      shopId: auth.shopId,
      step: parsed.output.step,
      now,
    })
  }
}
