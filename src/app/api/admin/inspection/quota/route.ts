import { NextResponse, type NextRequest } from 'next/server'
import * as v from 'valibot'
import { UpdateInspectionQuotaSchema } from '@/lib/validations'
import { thaiDayKey } from '@/lib/format-date'
import { getIntakeQuotaOverview, setIntakeQuota } from '@/services/inspection-admin.service'
import { adminError, mapAdminError, requireAdminActor } from '../_shared'

/**
 * GET/PATCH /api/admin/inspection/quota — เพดานรับสมัครรายเดือนต่อขั้น (API §4.10-4.11)
 *
 * 🛑 `year`/`month` ตั้งต้นจาก **เวลาไทย** ไม่ใช่ UTC — ไม่งั้นโควตาของเดือนจะเปิด/ปิดเหลื่อมไป
 *    7 ชั่วโมง (บั๊กชนิดเดียวกับที่เคยมีจริงในหน้ายอดขาย แก้ไปแล้วใน 00033)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminActor()
  if ('response' in auth) return auth.response

  const [defaultYear, defaultMonth] = thaiDayKey(new Date()).split('-').map(Number)
  const year = Number(request.nextUrl.searchParams.get('year') ?? defaultYear)
  const month = Number(request.nextUrl.searchParams.get('month') ?? defaultMonth)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return adminError('VALIDATION_ERROR', { message: 'ปี/เดือนที่ระบุไม่ถูกต้อง' })
  }

  try {
    return NextResponse.json({ year, month, quotas: await getIntakeQuotaOverview(year, month) })
  } catch (e) {
    return mapAdminError(e, { tag: 'admin/inspection/quota' })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdminActor()
  if ('response' in auth) return auth.response

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(UpdateInspectionQuotaSchema, body)
  if (!parsed.success) return adminError('VALIDATION_ERROR', { message: parsed.issues[0]?.message })

  try {
    const result = await setIntakeQuota({ ...parsed.output, now: new Date() })
    return NextResponse.json({ year: parsed.output.year, month: parsed.output.month, step: parsed.output.step, ...result })
  } catch (e) {
    return mapAdminError(e, { tag: 'admin/inspection/quota' })
  }
}
