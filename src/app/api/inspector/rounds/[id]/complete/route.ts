import { NextResponse } from 'next/server'
import * as v from 'valibot'
import { CompleteInspectionRoundSchema } from '@/lib/validations'
import { assertRoundAssignedTo, completeRound } from '@/services/inspection-round.service'
import { inspectorError, mapInspectorError, requireInspector } from '../../../_shared'

/**
 * POST /api/inspector/rounds/[id]/complete — ปิดรอบ (API §4.9)
 *
 * 🛑 เกณฑ์ "บันทึกผลครบ" คือ `lastConfirmedAt >= round.assignedAt` **ไม่ใช่** "มีแถวที่ roundId
 *    = รอบนี้" — การบันทึกที่ได้ผลเดิมไม่ผลิตแถวที่ผูกกับรอบนี้เลย (ซึ่งเป็นกรณีที่พบบ่อยที่สุด
 *    ของขั้น 1 และ 4) ⇒ ใช้เกณฑ์เดิมแล้วรอบจะปิดไม่ได้ตลอดกาล โดยหน้าจอบอกว่า
 *    "ยังบันทึกผลไม่ครบ" ทั้งที่ผู้ตรวจเพิ่งกดครบทุกข้อไปเมื่อกี้ — ทางตันที่เขาแก้เองไม่ได้
 *
 * 🛑 ด่านความเป็นเจ้าของรอบต้องมาก่อนเสมอ (`assertRoundAssignedTo`) — `completeRound()`
 *    เป็นตัวปิดรอบระดับระบบที่แอดมิน/cron ก็เรียกได้ ตัวมันเองไม่รู้จักผู้ตรวจ
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireInspector()
  if ('response' in auth) return auth.response
  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const parsed = v.safeParse(CompleteInspectionRoundSchema, body ?? {})
  if (!parsed.success) return inspectorError('VALIDATION_ERROR', { message: parsed.issues[0]?.message })

  try {
    await assertRoundAssignedTo(id, auth.userId)
    const result = await completeRound({
      roundId: id,
      now: new Date(),
      summary: parsed.output.summary,
      suspectedFraudNote: parsed.output.suspectedFraudNote,
    })
    if (result.alreadyCompleted && !result.completed) {
      return inspectorError('ROUND_ALREADY_COMPLETED')
    }
    return NextResponse.json({
      roundId: id,
      completedAt: new Date(),
      checksConfirmed: result.checksConfirmed,
      checksChanged: result.checksChanged,
      // คืนกลับให้ผู้ตรวจเห็นว่าบันทึกความสงสัยของเขาถูกเก็บแล้วจริง ไม่ใช่หายไปเงียบ ๆ
      hasFraudSignal: result.hasFraudSignal,
    })
  } catch (e) {
    return mapInspectorError(e, { tag: 'inspector/rounds/complete', roundId: id })
  }
}
