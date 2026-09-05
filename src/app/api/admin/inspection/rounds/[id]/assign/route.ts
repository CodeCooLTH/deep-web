import { NextResponse } from 'next/server'
import * as v from 'valibot'
import { AssignInspectionRoundSchema } from '@/lib/validations'
import { assignRound } from '@/services/inspection-round.service'
import { adminError, mapAdminError, requireAdminActor } from '../../../_shared'

/**
 * POST /api/admin/inspection/rounds/[id]/assign — เส้นทางหลักของงานประจำวันฝั่งแอดมิน (API §4.15)
 *
 * 🛑 `inspectorDisplayName` ถูก snapshot **ตรงนี้** ไม่ใช่ตอนสร้างรอบ และไม่ใช่ join สด —
 *    ถ้าอ่านชื่อสดจาก `User` ทุกครั้ง ชื่อผู้ตรวจในไทม์ไลน์ทั้งประวัติจะเปลี่ยนตามการแก้โปรไฟล์
 *    ของคนเดียว (AC-INS-25-2)
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminActor()
  if ('response' in auth) return auth.response
  const { id } = await params

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AssignInspectionRoundSchema, body)
  if (!parsed.success) return adminError('VALIDATION_ERROR', { message: parsed.issues[0]?.message })

  try {
    const result = await assignRound({
      roundId: id,
      inspectorUserId: parsed.output.inspectorUserId,
      reassign: parsed.output.reassign === true,
      now: new Date(),
    })
    return NextResponse.json({
      roundId: id,
      inspectorUserId: parsed.output.inspectorUserId,
      inspectorDisplayName: result.inspectorDisplayName,
      assignedAt: result.assignedAt,
      dueAt: result.dueAt,
      reassignedFrom: result.reassignedFrom,
    })
  } catch (e) {
    return mapAdminError(e, { tag: 'admin/inspection/rounds/assign' })
  }
}
