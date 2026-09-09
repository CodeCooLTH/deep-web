/**
 * /api/chat/preferences — ค่าตั้งกล่องแชทของ "ผู้ใช้คนนี้ ในร้านนี้" (00018 ext 2026-09-09)
 *
 * GET   คืนค่าปัจจุบัน (ไม่มีแถว = ค่าตั้งต้น ไม่ใช่ 404)
 * PATCH เขียนค่าใหม่ แล้วคืนค่าที่บันทึกจริง (ไม่ใช่ค่าที่ client ส่งมา — ถ้าถูกบีบเป็นค่าตั้งต้น
 *       เพราะอ่านไม่ออก client ต้องเห็นค่าจริงเพื่อไม่ให้จอโชว์คนละอย่างกับฐาน)
 *
 * 🛑 ร้านมาจาก session เท่านั้น (scope.activeShopId) ไม่รับ shopId จาก client — ไม่งั้นยิงรหัส
 *    ร้านอื่นเข้ามาแล้วเขียนค่าตั้งของร้านที่ตัวเองไม่มีสิทธิ์ได้ (แถวใหม่ถูกสร้างโดย upsert
 *    ซึ่งไม่มีอะไรกันนอกจาก FK ที่ยืนยันแค่ว่า "ร้านนี้มีจริง")
 */
import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sessionUserId } from '@/lib/session-user'
import { resolveChatScope } from '@/lib/chat-scope'
import { INBOX_SORT_MODES, parseInboxSortMode } from '@/lib/inbox-sort'
import { parseInboxFilterPreference } from '@/lib/inbox-filter-pref'
import {
  getInboxPreference,
  getInboxSortMode,
  setInboxPreference,
  setInboxSortMode,
} from '@/services/chat-preference.service'

/**
 * body มี 2 รูปแบบ (00018 ext รอบสอง 2026-09-09):
 *   { inboxSort }                       — เปลี่ยนเฉพาะการเรียง (ของเดิมจากรอบแรก)
 *   { inboxSort, filter, channelTab, pageFilter } — ปุ่ม "บันทึกเป็นค่าเริ่มต้น" (ทั้งชุด)
 *
 * ตัวกรองรับมาแบบหลวม (`v.unknown()`) โดยตั้งใจ แล้วให้ `parseInboxFilterPreference` เป็นด่านจริง
 * — ชุดตัวกรองงอกได้เรื่อย ๆ ถ้าเขียน schema ซ้ำที่นี่ด้วยจะกลายเป็นนิยามที่สอง แล้ววันหนึ่ง
 * มันจะไม่ตรงกับตัว parse (คนละไฟล์ คนละคนแก้) — Hard Rule 16
 */
const UpdateChatPreferenceSchema = v.object({
  inboxSort: v.picklist(INBOX_SORT_MODES),
  filter: v.optional(v.unknown()),
  channelTab: v.optional(v.unknown()),
  pageFilter: v.optional(v.unknown()),
})

/** ทั้ง GET และ PATCH ต้องการคำตอบเดียวกัน: "คนไหน ร้านไหน" — resolve ที่เดียว */
async function resolveActor() {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!userId) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const
  const scope = await resolveChatScope({
    user: { id: userId, activeShopId: (session?.user as { activeShopId?: string | null } | undefined)?.activeShopId ?? null },
  })
  // ห้าม fallback เงียบ ๆ ไปร้านอื่น (กติกาเดียวกับ /api/chat/conversations)
  if (!scope) return { error: NextResponse.json({ error: 'ไม่พบร้านที่กำลังใช้งาน' }, { status: 404 }) } as const
  return { userId, shopId: scope.activeShopId } as const
}

export async function GET() {
  const actor = await resolveActor()
  if ('error' in actor) return actor.error
  const pref = await getInboxPreference(actor.userId, actor.shopId)
  // ค่าตั้งส่วนตัว ห้ามให้ CDN/เบราว์เซอร์แคชข้ามผู้ใช้ (docs: feedback_auth_api_cache_control)
  // คืน `inboxSort` ไว้ด้วยเพื่อไม่ให้ client รุ่นก่อนหน้า (ที่อ่านคีย์นี้) พังระหว่าง deploy
  return NextResponse.json(
    { inboxSort: pref.sort, preference: pref },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function PATCH(request: NextRequest) {
  const actor = await resolveActor()
  if ('error' in actor) return actor.error

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(UpdateChatPreferenceSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const body_ = parsed.output
  // ไม่ส่ง filter มา = เปลี่ยนเฉพาะการเรียง (ห้ามเผลอล้างค่าตัวกรองที่ผู้ใช้บันทึกไว้ทิ้ง
  // ด้วยการเขียนทั้งก้อนทุกครั้ง — นั่นคือการลบข้อมูลของผู้ใช้โดยไม่มีใครสั่ง)
  if (body_.filter === undefined && body_.channelTab === undefined && body_.pageFilter === undefined) {
    const inboxSort = await setInboxSortMode(actor.userId, actor.shopId, parseInboxSortMode(body_.inboxSort))
    return NextResponse.json({ inboxSort }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const pref = await setInboxPreference(
    actor.userId,
    actor.shopId,
    parseInboxFilterPreference(
      { filter: body_.filter, channelTab: body_.channelTab, pageFilter: body_.pageFilter },
      body_.inboxSort,
    ),
  )
  return NextResponse.json(
    { inboxSort: pref.sort, preference: pref },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
