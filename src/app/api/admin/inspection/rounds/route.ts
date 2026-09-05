import { NextResponse, type NextRequest } from 'next/server'
import * as v from 'valibot'
import { CreateInspectionRoundSchema } from '@/lib/validations'
import type { InspectionMethod, InspectionStep } from '@/lib/inspection/checks'
import { createAdHocRound, listRoundsForAdmin } from '@/services/inspection-admin.service'
import { adminError, mapAdminError, requireAdminActor } from '../_shared'

/**
 * GET  /api/admin/inspection/rounds — คิวงานทั้งระบบ + ตัวชี้วัดงานค้าง (API §4.14)
 * POST /api/admin/inspection/rounds — สร้างรอบนอกกำหนด (API §4.12)
 *
 * 🛑 เส้นทางหลักของรอบตรวจคือ **cron สร้างล่วงหน้าตาม `dueAt`** แล้วแอดมินมอบหมายที่ 4.15
 *    POST นี้เหลือไว้สำหรับรอบที่ไม่ได้เกิดจากกำหนดเวลา (ร้านแก้ของที่เคยไม่ผ่านแล้วขอตรวจใหม่ ·
 *    ที่พักหลังใหม่ · รอบชดเชยที่ cron พลาด)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminActor()
  if ('response' in auth) return auth.response

  const q = request.nextUrl.searchParams
  const assignment = q.get('assignment') ?? 'ALL'
  if (assignment !== 'ALL' && assignment !== 'ASSIGNED' && assignment !== 'UNASSIGNED') {
    return adminError('VALIDATION_ERROR', { message: 'ตัวกรองการมอบหมายไม่ถูกต้อง' })
  }
  const stepRaw = q.get('step')
  const step = stepRaw === null ? undefined : (Number(stepRaw) as InspectionStep)
  if (step !== undefined && ![1, 2, 3, 4].includes(step)) {
    return adminError('VALIDATION_ERROR', { message: 'ขั้นการตรวจสอบไม่ถูกต้อง' })
  }

  try {
    return NextResponse.json(
      await listRoundsForAdmin({
        assignment,
        overdueOnly: q.get('overdueOnly') === 'true',
        step,
        method: (q.get('method') as InspectionMethod | null) ?? undefined,
        shopId: q.get('shopId') ?? undefined,
        hasFraudSignal: q.get('hasFraudSignal') === 'true',
        limit: q.get('limit') === null ? undefined : Number(q.get('limit')),
        cursor: q.get('cursor'),
        now: new Date(),
      }),
    )
  } catch (e) {
    return mapAdminError(e, { tag: 'admin/inspection/rounds' })
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminActor()
  if ('response' in auth) return auth.response

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(CreateInspectionRoundSchema, body)
  if (!parsed.success) return adminError('VALIDATION_ERROR', { message: parsed.issues[0]?.message })

  try {
    const round = await createAdHocRound({
      shopId: parsed.output.shopId,
      roomId: parsed.output.roomId ?? null,
      step: parsed.output.step,
      method: parsed.output.method,
      inspectorUserId: parsed.output.inspectorUserId ?? null,
      checkKeys: parsed.output.checkKeys,
      dueAt: parsed.output.dueAt ? new Date(parsed.output.dueAt) : null,
      now: new Date(),
    })
    return NextResponse.json(round, { status: 201 })
  } catch (e) {
    return mapAdminError(e, { tag: 'admin/inspection/rounds' })
  }
}
