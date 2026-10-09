// notification-sound — เสียงแจ้งเตือน "แชทใหม่" ในแอปผู้ขาย ของผู้ใช้คนปัจจุบัน (2026-10-09)
//
// วางใต้ /api/account/* ด้วยเหตุผลเดียวกับ /api/account/notifications: auth ด้วย cookie
// ⇒ มี CSRF surface ⇒ ต้องผ่านด่าน Origin ของ proxy (ห้ามย้ายไป /api/app/* ที่ยกเว้นด่านนั้น)
// ผูกกับ session.user.id ล้วน — ห้ามอ่าน activeShopId (เสียงเป็นของ "ตัวคน" ไม่ใช่ร้าน)
import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { sessionUserId } from '@/lib/session-user'
import { CHAT_PUSH_SOUNDS, getChatPushSound, setChatPushSound } from '@/services/notification-pref.service'

const PatchBody = v.object({ chatPushSound: v.picklist(CHAT_PUSH_SOUNDS) })

export async function GET() {
  const userId = sessionUserId(await getServerSession(authOptions))
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ chatPushSound: await getChatPushSound(userId) })
}

export async function PATCH(req: NextRequest) {
  const userId = sessionUserId(await getServerSession(authOptions))
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = v.safeParse(PatchBody, await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })

  await setChatPushSound(userId, parsed.output.chatPushSound)
  return NextResponse.json({ ok: true, chatPushSound: parsed.output.chatPushSound })
}
