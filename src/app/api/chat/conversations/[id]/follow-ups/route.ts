import { NextRequest, type NextResponse } from 'next/server'
import * as v from 'valibot'
import { resolveConversationShopId } from '@/lib/chat-scope'
import { forbiddenRoleResponse } from '@/lib/forbidden-role'
import { CreateFollowUpSchema } from '@/lib/validations'
import { createFollowUp, listForConversation } from '@/services/customer-follow-up.service'
import { badId, fail, json, mapFollowUpError, parseId, readJson, requireUser, validationError } from '@/app/api/follow-ups/_shared'

// 00066 แผงห้อง — ร้านของห้อง resolve จากห้อง (ไม่ใช่ร้าน active — กล่องแชทรวมหลายร้าน)
export const dynamic = 'force-dynamic'

async function requireShopContext(
  rawId: string,
  cap: 'X2',
): Promise<{ res: NextResponse } | { id: string; userId: string; shopId: string }> {
  const id = parseId(rawId)
  if (!id) return { res: badId() }
  const u = await requireUser()
  if ('res' in u) return u
  const r = await resolveConversationShopId({ user: { id: u.userId, activeShopId: u.activeShopId } }, id, cap)
  // ไม่มีห้อง/ไม่มีสิทธิ์ = 404 เหมือนกัน (ไม่รั่วว่าห้องมีอยู่)
  if (!r) return { res: fail(404, 'NOT_FOUND', 'ไม่พบบทสนทนานี้') }
  // 00071 S-13: เป็นสมาชิกแต่บทบาทไม่ถือ X2 → 403 FORBIDDEN_ROLE
  if ('denied' in r) return { res: forbiddenRoleResponse() }
  return { id, userId: u.userId, shopId: r.shopId }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await requireShopContext((await params).id, 'X2')
  if ('res' in c) return c.res
  try {
    return json(await listForConversation(c.id, c.shopId))
  } catch (e) {
    return mapFollowUpError(e, 'GET conversation follow-ups')
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await requireShopContext((await params).id, 'X2')
  if ('res' in c) return c.res
  const body = await readJson(request)
  if (body === null) return fail(400, 'VALIDATION', 'Invalid input')
  const parsed = v.safeParse(CreateFollowUpSchema, body)
  if (!parsed.success) return validationError(parsed.issues)
  try {
    return json({ item: await createFollowUp(c.userId, c.shopId, c.id, parsed.output) }, 201)
  } catch (e) {
    return mapFollowUpError(e, 'POST conversation follow-ups')
  }
}
