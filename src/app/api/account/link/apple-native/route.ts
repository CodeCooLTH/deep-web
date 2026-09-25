/**
 * POST /api/account/link/apple-native — เชื่อม Apple เข้าบัญชีที่ล็อกอินอยู่ ด้วยโทเคนจาก
 * แผ่นของระบบ (feature 00040 · ภาคผนวก 7)
 *
 * ## ทำไมต้องมีทางนี้ ทั้งที่ทางเว็บใช้ได้อยู่แล้ว
 *
 * Apple ตีกลับ 2026-09-24 (**Guideline 4**) เพราะปุ่ม Sign in with Apple ในแอป iOS
 * พาไปหน้าเว็บ `appleid.apple.com` — และ **ปุ่ม "เชื่อมบัญชี Apple" ที่ `/account`
 * ก็พาไปที่เดียวกัน** ⇒ แก้เฉพาะหน้าล็อกอินแล้วยังโดนข้อเดิมได้
 *
 * ทีมรีวิวเดินเข้าหน้านี้แน่นอน เพราะปุ่ม "ลบบัญชี" อยู่ที่นี่ ซึ่ง Guideline 5.1.1(v)
 * บังคับให้เขาไปตรวจ
 *
 * ## ต่างจากทางเว็บตรงไหน
 *
 * ทางเว็บใช้คุกกี้ `deep_link_intent` บอกว่า "การล็อกอินรอบนี้คือการเชื่อมบัญชีของ userId นี้"
 * เพราะ `signIn` callback ไม่มี session ของผู้ใช้ให้อ่าน · ทางนี้เป็นคำขอธรรมดาที่
 * **มี session อยู่แล้ว** ⇒ อ่าน `userId` จาก session ตรง ๆ ไม่ต้องมีคุกกี้ intent เลย
 *
 * 🛑 ตรรกะ "ใครถือ id นี้อยู่ / ยึดคืนได้ไหม" ใช้ `linkOAuthAccount()` **ตัวเดียวกับทางเว็บ**
 * ห้ามเขียนซ้ำ (Hard Rule 16) — เกณฑ์นี้ตัดสินผิดแล้วลบร้านที่มีออเดอร์จริงของคนอื่นได้
 */
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import * as v from 'valibot'

import { verifyAppleIdentityToken } from '@/lib/apple/identity-token'
import { authOptions } from '@/lib/auth'
import { sessionUserId } from '@/lib/session-user'
import { linkOAuthAccount, linkOutcomeRedirect } from '@/services/oauth-link.service'
import { APPLE_NONCE_COOKIE } from '@/app/api/login/apple-native/start/route'

const BodySchema = v.object({
  identityToken: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)),
})

export async function POST(request: Request) {
  const userId = sessionUserId(await getServerSession(authOptions))
  if (!userId) return NextResponse.json({ ok: false, reason: 'UNAUTHORIZED' }, { status: 401 })

  const parsed = v.safeParse(BodySchema, await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false, reason: 'BAD_REQUEST' }, { status: 400 })

  const { cookies } = await import('next/headers')
  const expectedNonce = (await cookies()).get(APPLE_NONCE_COOKIE)?.value ?? null
  /* nonce มาจากคุกกี้ httpOnly ที่เซิร์ฟเวอร์ตั้งเอง ไม่ใช่จาก body — เหตุผลเต็มอยู่ที่
     `/api/login/apple-native/start/route.ts` */
  if (!expectedNonce) {
    return NextResponse.json({ ok: false, reason: 'INVALID_TOKEN' }, { status: 401 })
  }

  const verified = await verifyAppleIdentityToken(parsed.output.identityToken, { expectedNonce })

  /** ลบคุกกี้ทุกทางออก — ใช้ได้ครั้งเดียวจริง (เหตุผลเดียวกับฝั่งล็อกอิน) */
  const reply = (body: unknown, status = 200) => {
    const res = NextResponse.json(body, { status })
    res.cookies.set(APPLE_NONCE_COOKIE, '', { path: '/', maxAge: 0 })
    return res
  }

  if (!verified.ok) {
    console.error('[apple-native-link] โทเคนไม่ผ่าน:', verified.reason)
    return reply({ ok: false, reason: 'INVALID_TOKEN' }, 401)
  }

  const outcome = await linkOAuthAccount({
    userId,
    provider: 'APPLE',
    providerAccountId: verified.claims.sub,
    /* แผ่นของระบบไม่ให้ access token มา (ต่างจาก OAuth ทางเว็บ) — เก็บ null ถูกแล้ว
       ไม่มีใครใช้ค่านี้กับ Apple อยู่แล้ว */
    accessToken: null,
  })

  /**
   * คืน **ปลายทาง** ให้หน้าจอไปเอง แทนที่จะ redirect จาก server
   *
   * หน้าจอเรียกตัวนี้ด้วย `fetch` จากในหน้า `/account` ที่เปิดอยู่ ⇒ redirect ที่ระดับ HTTP
   * จะถูก `fetch` ตามไปเงียบ ๆ แล้วผู้ใช้ไม่เห็นอะไรเปลี่ยนเลย · ส่ง URL กลับไปให้
   * `router.replace()` ทำให้แถบผลลัพธ์ (`?linked=` / `?link_error=`) ถูกอ่านตามปกติ
   *
   * ใช้ `linkOutcomeRedirect` ตัวเดียวกับทางเว็บ — ปลายทางจึงไม่มีทาง drift กัน
   */
  return reply({ ok: true, kind: outcome.kind, redirect: linkOutcomeRedirect('apple', outcome) })
}
