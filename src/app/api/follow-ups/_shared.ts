// 00066 — ของกลางของ route ติดตามลูกค้า: auth, ขอบเขตร้าน, mapper error, parse body
import { NextResponse } from 'next/server'
import * as v from 'valibot'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sessionUserId } from '@/lib/session-user'
import { resolveChatScope, type ChatScope } from '@/lib/chat-scope'
import {
  AssigneeNotMemberError,
  FollowUpNotFoundError,
  FollowUpStateError,
  FollowUpDueError,
} from '@/services/customer-follow-up.service'

// per-user data — ห้าม shared cache (แพตเทิร์นเดียวกับ crm/route.ts)
export const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' }

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}
export function fail(status: number, code: string, error: string) {
  return json({ error, code }, status)
}

/** ตัวตน = sessionUserId เท่านั้น (ไม่ cast) — ไม่มี id = 401 */
export async function requireUser(): Promise<
  { userId: string; activeShopId: string | null } | { res: NextResponse }
> {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!userId) return { res: fail(401, 'UNAUTHORIZED', 'unauthorized') }
  const activeShopId =
    ((session?.user as { activeShopId?: string | null } | undefined)?.activeShopId as string | null | undefined) ?? null
  return { userId, activeShopId }
}

/** ขอบเขตร้านที่ผู้ใช้เข้าถึงได้ (โหมดร้านเดียว/รวม) — resolve ไม่ได้ = 404 ไม่ fallback ไป PERSONAL */
export async function requireScope(
  u: { userId: string; activeShopId: string | null },
): Promise<{ scope: ChatScope } | { res: NextResponse }> {
  const scope = await resolveChatScope({ user: { id: u.userId, activeShopId: u.activeShopId } })
  if (!scope) return { res: fail(404, 'NOT_FOUND', 'ไม่พบร้านที่กำลังใช้งาน') }
  return { scope }
}

export async function readJson(request: Request): Promise<unknown | null> {
  return request.json().catch(() => null)
}

export function validationError(issues: [{ message: string }, ...{ message: string }[]]) {
  return fail(400, 'VALIDATION', issues[0]?.message ?? 'Invalid input')
}

const IdSchema = v.pipe(v.string(), v.uuid())
export function parseId(raw: string): string | null {
  const r = v.safeParse(IdSchema, raw)
  return r.success ? r.output : null
}
export const badId = () => fail(400, 'VALIDATION', 'รหัสไม่ถูกต้อง')

/**
 * แปลง error ของ service เป็น response (SRS §11) — ทุก *Error ที่ service export ต้องมี branch ที่นี่
 * (เทส [blocker] enumerate จากโมดูล) อื่น ๆ = 500 ข้อความกลาง ไม่รั่วรายละเอียด
 */
export function mapFollowUpError(e: unknown, tag = 'follow-ups') {
  if (e instanceof FollowUpNotFoundError) return fail(404, 'NOT_FOUND', 'ไม่พบรายการ')
  if (e instanceof AssigneeNotMemberError) return fail(400, 'ASSIGNEE_NOT_MEMBER', 'ผู้รับผิดชอบไม่ใช่ทีมงานของร้านนี้')
  if (e instanceof FollowUpDueError) return fail(400, 'INVALID_DUE', 'วันที่ไม่ถูกต้อง')
  if (e instanceof FollowUpStateError) return fail(409, 'INVALID_STATE', 'สถานะรายการไม่รองรับการทำรายการนี้')
  console.error(`[${tag}]`, e instanceof Error ? e.message : e)
  return fail(500, 'INTERNAL', 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
}
