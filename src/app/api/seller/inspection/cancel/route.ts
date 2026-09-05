import { NextResponse } from 'next/server'
import * as v from 'valibot'
import { CancelInspectionSchema } from '@/lib/validations'
import { cancelInspectionPlan } from '@/services/inspection-plan.service'
import { cancelInspectionNoticeTh } from '@/lib/inspection/copy'
import { errorResponse, mapInspectionError, requireInspectionShop } from '../_shared'

/**
 * POST /api/seller/inspection/cancel — แจ้งยกเลิก **มีผลสิ้นรอบบิล ไม่ใช่ทันที** (API §4.4)
 *
 * สามข้อที่ endpoint นี้ต้อง *ไม่* ทำ และเป็นกฎที่แตะไม่ได้:
 *   1. ห้ามลบ `InspectionRound`/`InspectionResult`/`InspectionEvidence` สักแถว (FR-INS-027)
 *   2. ห้ามคืนเงิน — ไม่แตะกระเป๋าเครดิตเลย (AC-INS-13)
 *   3. ห้ามแตะ Trust Score / Tier / อันดับผลค้นหา (FR-INS-020 — สองแกนแยกขาด)
 *
 * 🛑 ข้อความแจ้งผลมาจาก `cancelInspectionNoticeTh()` ที่เดียวกับกล่องยืนยันก่อนกด (HR16) —
 *    สองที่เขียนเองจะกลายเป็นคำสัญญาสองแบบเรื่อง "คืนเงินไหม" ในจอเดียว
 */
export async function POST(request: Request) {
  const auth = await requireInspectionShop()
  if ('response' in auth) return auth.response

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(CancelInspectionSchema, body)
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', { message: parsed.issues[0]?.message })
  }

  try {
    const result = await cancelInspectionPlan({ shopId: auth.shopId, userId: auth.userId, now: new Date() })
    return NextResponse.json({
      // status ยังเป็น ACTIVE จนสิ้นรอบบิล — client ต้องอ่าน effectiveAt ไม่ใช่เดาจาก status
      plan: { status: 'ACTIVE', effectiveAt: result.effectiveAt, lapsedReason: result.lapsedReason },
      notice: cancelInspectionNoticeTh(result.effectiveAt),
    })
  } catch (e) {
    return mapInspectionError(e, { tag: 'seller/inspection/cancel', shopId: auth.shopId })
  }
}
