import { NextResponse } from 'next/server'
import * as v from 'valibot'
import { UpgradeInspectionSchema } from '@/lib/validations'
import { changeInspectionPlanStep } from '@/services/inspection-plan.service'
import { errorResponse, mapInspectionError, requireInspectionShop } from '../_shared'

/**
 * POST /api/seller/inspection/upgrade — เลื่อนขึ้นขั้นที่สูงกว่า (API §4.3)
 *
 * 🛑 `upgradeOnly: true` ทำให้การ "ลดขั้น" ถูกปฏิเสธ **ในทรานแซกชัน** ไม่ใช่ที่ route —
 *    ถ้า route อ่านขั้นปัจจุบันมาเทียบเองก่อนเรียก จะเป็น TOCTOU ที่ผลลัพธ์คือเก็บเงินผิดจำนวน
 *    (การลดขั้นมีผลต่อสิ่งที่ผู้ซื้อเห็นทันที และยังไม่มีมติเรื่องส่วนต่าง ⇒ ห้ามทำเงียบ ๆ)
 *
 * 🛑 ต้องรับทราบเงื่อนไข **ซ้ำทุกครั้งที่จ่ายเงิน** (AC-INS-10-3) ไม่ใช่ครั้งเดียวตอนสมัคร
 */
export async function POST(request: Request) {
  const auth = await requireInspectionShop()
  if ('response' in auth) return auth.response

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(UpgradeInspectionSchema, body)
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', { message: parsed.issues[0]?.message })
  }

  const now = new Date()
  try {
    const result = await changeInspectionPlanStep({
      shopId: auth.shopId,
      userId: auth.userId,
      toStep: parsed.output.step,
      termsAccepted: parsed.output.termsAccepted,
      upgradeOnly: true,
      now,
    })
    return NextResponse.json({
      plan: { step: result.step, status: 'ACTIVE', termsAcceptedAt: result.termsAcceptedAt },
      acceptance: result.acceptance,
      previousStep: result.previousStep,
      roundsCreated: result.roundsCreated,
    })
  } catch (e) {
    return mapInspectionError(e, {
      tag: 'seller/inspection/upgrade',
      shopId: auth.shopId,
      step: parsed.output.step,
      now,
    })
  }
}
