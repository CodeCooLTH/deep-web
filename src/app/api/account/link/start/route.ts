/**
 * POST /api/account/link/start — เริ่ม Account Linking flow (FR-LO-16)
 *
 * flow: Settings กด Connect → fetch /link/start (auth) → ได้ ok + cookie →
 *       client ทำ signIn(provider, { callbackUrl: '/settings' }) →
 *       signIn callback ใน auth.ts อ่าน cookie → ผูก AuthAccount กับ userId ใน intent
 *
 * cookie deep_link_intent = HMAC(NEXTAUTH_SECRET) of {userId, provider, exp}
 * httpOnly + sameSite=lax → CSRF-safe; maxAge 300s = 5 นาที ให้พอทำ OAuth flow
 */
import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { signLinkIntent, LINK_INTENT_COOKIE } from '@/lib/link-intent'

// provider ที่รองรับ linking — ตรงกับ oauthMap ใน auth.ts
const LINKABLE_PROVIDERS = ['line', 'facebook', 'instagram'] as const
type LinkableProvider = (typeof LINKABLE_PROVIDERS)[number]

const Body = v.object({
  provider: v.pipe(
    v.string(),
    v.custom<LinkableProvider>(
      (val) => LINKABLE_PROVIDERS.includes(val as LinkableProvider),
      'provider ต้องเป็น line, facebook หรือ instagram',
    ),
  ),
})

export async function POST(req: NextRequest) {
  // AC-05: auth required
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const parsed = v.safeParse(Body, await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'provider ไม่ถูกต้อง' }, { status: 400 })
  }
  const { provider } = parsed.output

  const token = signLinkIntent({ userId, provider })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(LINK_INTENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300, // 5 นาที — ให้พอทำ OAuth redirect แล้วกลับมา
    path: '/',
  })
  return res
}
