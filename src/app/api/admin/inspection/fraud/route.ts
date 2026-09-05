import { NextResponse } from 'next/server'
import * as v from 'valibot'
import { ReportInspectionFraudSchema } from '@/lib/validations'
import { reportInspectionFraud } from '@/services/inspection-admin.service'
import { adminError, mapAdminError, requireAdminActor } from '../_shared'

/**
 * POST /api/admin/inspection/fraud — เส้นทางแยกเมื่อพบหลักฐานฉ้อโกง (API §4.13)
 *
 * 🛑 **แอดมินเป็นคนเดียวที่ยิง endpoint นี้ได้** — ผู้ตรวจบันทึกความสงสัยไว้ที่รอบของตน
 *    (`suspectedFraudNote`) แล้วแอดมินอ่านที่ §4.14 · การใส่ชื่อคนเข้าฐานมิจฉาชีพเป็นการกระทำ
 *    ที่ย้อนกลับยากและกระทบคนจริง ไม่ควรเป็นการตัดสินหน้างานของบุคคลภายนอกที่จ้างรายครั้ง
 *
 * 🛑 รายงานเข้าคิวเป็น `PENDING` เสมอ — ห้าม approve เองแม้ผู้เรียกเป็นแอดมิน
 */
export async function POST(request: Request) {
  const auth = await requireAdminActor()
  if ('response' in auth) return auth.response

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(ReportInspectionFraudSchema, body)
  if (!parsed.success) return adminError('VALIDATION_ERROR', { message: parsed.issues[0]?.message })

  try {
    const result = await reportInspectionFraud({
      actorUserId: auth.actorUserId,
      shopId: parsed.output.shopId,
      roundId: parsed.output.roundId ?? null,
      checkKey: parsed.output.checkKey ?? null,
      roomId: parsed.output.roomId ?? null,
      scamType: parsed.output.scamType,
      description: parsed.output.description,
      evidenceFileIds: parsed.output.evidenceFileIds,
      identifiers: parsed.output.identifiers ?? [],
      now: new Date(),
    })
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    return mapAdminError(e, { tag: 'admin/inspection/fraud' })
  }
}
