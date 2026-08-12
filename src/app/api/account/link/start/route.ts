/**
 * POST /api/account/link/start — เริ่ม Account Linking flow (FR-LO-16)
 *
 * flow: หน้า /account (การ์ด "วิธีเข้าสู่ระบบ") กด Connect → fetch /link/start (auth) → ได้ ok + cookie →
 *       client ทำ signIn(provider, { callbackUrl: '/account' }) →
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
const LINKABLE_PROVIDERS = ['line', 'facebook', 'instagram', 'apple'] as const
type LinkableProvider = (typeof LINKABLE_PROVIDERS)[number]

const Body = v.object({
  provider: v.pipe(
    v.string(),
    v.custom<LinkableProvider>(
      (val) => LINKABLE_PROVIDERS.includes(val as LinkableProvider),
      'provider ต้องเป็น line, facebook, instagram หรือ apple',
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

  /**
   * 🛑 Apple ต้องใช้ sameSite='none' ไม่งั้น "เชื่อมบัญชี" พังทุกครั้งโดยไม่มีอะไรบอกสาเหตุ
   *
   * Apple ส่งผลกลับด้วย `response_mode=form_post` = ยิง POST จาก appleid.apple.com มาที่
   * callback ของเรา ซึ่งเป็น cross-site request — เบราว์เซอร์ **ไม่แนบคุกกี้ sameSite=lax**
   * คุกกี้ link-intent จึงหายไป แล้ว signIn callback จะตีความว่า "ไม่ใช่การเชื่อมบัญชี" แต่เป็น
   * การล็อกอินธรรมดา → **สร้างบัญชีใหม่ซ้อนขึ้นมาแทนที่จะผูกกับบัญชีเดิม** ซึ่งแย่กว่า error
   * เพราะดูเหมือนสำเร็จ (เหตุผลเดียวกับคุกกี้ pkce/state ที่ crossSiteOAuthCookies() ใน auth.ts จัดการ)
   *
   * ตั้งเฉพาะ apple — provider อื่นยังเป็น lax ตามเดิม ผิวการเปลี่ยนแปลงจึงแคบที่สุด
   * และ none บังคับต้องมี secure = ใช้ได้เฉพาะ https (dev บน http จึงคงเป็น lax ซึ่งไม่กระทบ
   * เพราะ Apple ไม่รับ http อยู่แล้ว เทสได้บน prod เท่านั้น)
   */
  const isProd = process.env.NODE_ENV === 'production'
  const crossSite = provider === 'apple' && isProd

  const res = NextResponse.json({ ok: true })
  res.cookies.set(LINK_INTENT_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: crossSite ? 'none' : 'lax',
    maxAge: 300, // 5 นาที — ให้พอทำ OAuth redirect แล้วกลับมา
    path: '/',
  })
  return res
}
