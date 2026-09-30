import { NextRequest } from 'next/server'
import { intersectScopedShopIds } from '@/lib/chat-scope'
import { thaiDayKey } from '@/lib/format-date'
import { listBoard, listCalendarMonth, type BoardParams } from '@/services/customer-follow-up.service'
import { fail, json, mapFollowUpError, requireScope, requireUser } from '../_shared'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

// ค่า filter ที่ parse ไม่ได้ = ไม่กรอง (AC-ACT-25) — มี 400 เฉพาะ `view` ผิด
export async function GET(request: NextRequest) {
  const u = await requireUser()
  if ('res' in u) return u.res
  const s = await requireScope(u)
  if ('res' in s) return s.res

  const sp = request.nextUrl.searchParams
  const view = sp.get('view') ?? 'board'
  if (view !== 'board' && view !== 'calendar') return fail(400, 'VALIDATION', 'view ไม่ถูกต้อง')

  const assigneeRaw = sp.get('assignee')
  const q = sp.get('q')?.trim().slice(0, 100)
  const tags = sp.get('tags')?.split(',').map((t) => t.trim()).filter(Boolean)
  const params: BoardParams = {
    shopIds: intersectScopedShopIds(s.scope.shopIds, sp.get('shopId')),
    userId: u.userId,
    mine: sp.get('mine') === '1' ? true : undefined,
    assignee: assigneeRaw === 'unassigned' || (assigneeRaw && UUID_RE.test(assigneeRaw)) ? assigneeRaw : undefined,
    tags: tags && tags.length > 0 ? tags : undefined,
    q: q || undefined,
  }
  try {
    if (view === 'board') return json(await listBoard(params))
    const m = sp.get('month')
    // month ไม่มี/ผิดรูป = เดือนปัจจุบันเวลาไทย (ไม่ 400)
    const month = m && MONTH_RE.test(m) ? m : thaiDayKey(new Date()).slice(0, 7)
    return json(await listCalendarMonth({ ...params, month }))
  } catch (e) {
    return mapFollowUpError(e, 'GET follow-ups/board')
  }
}
