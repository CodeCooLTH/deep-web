import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireAppUser } from '@/lib/app-auth'
import { AppPushTokenSchema } from '@/lib/app-validations'
import { prisma } from '@/lib/prisma'

// POST /api/app/push-token  { token } — ลงทะเบียน Expo push token (upsert ตาม token)
export async function POST(request: NextRequest) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response

  const body = await request.json().catch(() => null)
  if (body === null) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  const parsed = v.safeParse(AppPushTokenSchema, body)
  if (!parsed.success) return NextResponse.json({ error: 'token ไม่ถูกต้อง' }, { status: 400 })

  // upsert ตาม token (unique) — token เดิมเปลี่ยนเจ้าของได้ (เครื่องเดียวหลายบัญชี)
  await prisma.pushToken.upsert({
    where: { token: parsed.output.token },
    update: { userId: auth.user.id },
    create: { userId: auth.user.id, token: parsed.output.token },
  })
  return NextResponse.json({ ok: true })
}
