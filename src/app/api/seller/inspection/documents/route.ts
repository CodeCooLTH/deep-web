import { NextResponse } from 'next/server'
import * as v from 'valibot'
import { SubmitInspectionDocumentSchema } from '@/lib/validations'
import { attachSellerDocument } from '@/services/inspection-result.service'
import { InspectionPlanError, getInspectionPlan } from '@/services/inspection-plan.service'
import { errorResponse, mapInspectionError, requireInspectionShop } from '../_shared'

/**
 * POST /api/seller/inspection/documents — ผูกไฟล์ที่อัปโหลดแล้วเข้ากับข้อตรวจ (API §4.5)
 *
 * 🛑 **ไม่รับไฟล์ผ่าน body** — client ต้องเดิน ticket → PUT → commit ของ `@/lib/upload-client`
 *    ก่อน แล้วส่งมาแค่ `fileId` (body ของ function ตันที่ 4.5MB และตอบ 413 ด้วย payload ที่ไม่ใช่
 *    JSON ⇒ client อ่านเหตุผลไม่ได้ — docs/conventions/upload-body-size-limit.md)
 *
 * 🛑 `visibility` ไม่มีในสัญญาและถูกบังคับเป็น `PRIVATE` ที่ service เสมอ
 */
export async function POST(request: Request) {
  const auth = await requireInspectionShop()
  if ('response' in auth) return auth.response

  if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    return errorResponse('VALIDATION_ERROR', {
      message: 'ต้องอัปโหลดไฟล์ผ่านขั้นตอนแนบไฟล์ก่อน แล้วส่งเฉพาะรหัสไฟล์',
    })
  }

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(SubmitInspectionDocumentSchema, body)
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', { message: parsed.issues[0]?.message })
  }

  try {
    // ต้องมีแผนอยู่ก่อน — ร้านที่ยังไม่สมัครส่งเอกสารเข้ามาไม่มีใครตรวจให้
    const plan = await getInspectionPlan(auth.shopId)
    if (plan === null) throw new InspectionPlanError('PLAN_NOT_FOUND')

    const result = await attachSellerDocument({
      shopId: auth.shopId,
      checkKey: parsed.output.checkKey,
      roomId: parsed.output.roomId ?? null,
      fileId: parsed.output.fileId,
      kind: parsed.output.kind,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    return mapInspectionError(e, { tag: 'seller/inspection/documents', shopId: auth.shopId })
  }
}
