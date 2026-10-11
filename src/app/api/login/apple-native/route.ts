/**
 * POST /api/login/apple-native — แลก identity token จากแผ่นของระบบ เป็นตั๋วเข้าสู่ระบบ
 * (feature 00040 · ภาคผนวก 7)
 *
 * ## ทำไมมี endpoint นี้ แทนที่จะเพิ่ม provider ใน `lib/auth.ts`
 *
 * 1. **ต้องแยก "โทเคนใช้ไม่ได้" ออกจาก "ยังไม่มีบัญชี" ให้ผู้ใช้เห็น** — `CredentialsProvider`
 *    ของ next-auth v4 ยุบทุกความล้มเหลวเป็น `CredentialsSignin` ก้อนเดียว ⇒ ทีมรีวิวของ
 *    Apple ที่ล็อกอินด้วย Apple ID ซึ่งไม่มีบัญชี Deep จะเห็นแค่ "เข้าสู่ระบบไม่สำเร็จ"
 *    ซึ่งอ่านเหมือนระบบพัง แล้วตีกลับซ้ำ · เขาต้องเห็นข้อความเดียวกับที่ด่าน 3.1.1 แสดงอยู่แล้ว
 * 2. `lib/auth.ts` ยาว 1,100 บรรทัดและถือทางเข้าระบบทุกทาง — เพิ่มของใหม่เข้าไปคือการเอา
 *    ความเสี่ยงไปวางไว้กลางทางเดินของทุกคน ทั้งที่กลไก "ตั๋วใช้ครั้งเดียว → session"
 *    (`mobile-ticket`) มีอยู่แล้วและถูกใช้งานจริง
 *
 * ## 🛑 สร้างบัญชีใหม่ **เฉพาะแอป iOS ที่เปิดการสมัครแล้ว** (≥ 1.0.3 · 2026-10-11)
 *
 * เกณฑ์เดียวกับทุกจุด: `isSignUpRestricted(shell, appVersion)` — แอปรุ่นที่ยังห้ามสมัคร (≤ 1.0.2
 * ที่อยู่บนสโตร์) ได้ `NO_ACCOUNT` เหมือนเดิมทุกประการ · รุ่นที่เปิดแล้วได้บัญชีใหม่ผ่าน
 * `upsertAppleNativeUser` (ตัวสร้างเดียวกับทางเว็บ) พร้อมชื่อจากแผ่นของระบบ แล้ว proxy พาไป
 * `/register` เหมือนสมัครด้วย Facebook/LINE
 *
 * เหตุผลเดิมที่ **รุ่นเก่ายังห้ามสร้าง** (ยังใช้อยู่):
 *
 * เหตุผล 2 ชั้น:
 *   - **Guideline 3.1.1** ห้ามให้สมัครบัญชีในแอปอยู่แล้ว (`shouldBlockAppRegistration`)
 *     ⇒ บัญชีที่สร้างตรงนี้จะถูกขังที่ `/register` ทันที = "บัญชีค้าง" ที่เจ้าตัวแก้เองไม่ได้
 *     ซึ่งเป็นทางตันที่ภาคผนวก 6 ใช้เวลาทั้งวันแก้
 *   - **กันความเสียหายถ้า `sub` ไม่ตรงกับที่ผูกไว้ทางเว็บ** (กรณีที่ identifier ยังไม่ถูก
 *     จัดกลุ่มในพอร์ทัล Apple) — ถ้าสร้างบัญชีให้ ผู้ขายที่เคยเชื่อม Apple จะได้บัญชีเปล่า
 *     ใบใหม่แบบเงียบ ๆ และแก้กลับไม่ได้ · ไม่สร้าง = เขาเห็น "ยังไม่มีบัญชีผู้ขาย"
 *     ซึ่ง **ดังและย้อนกลับได้**
 *
 * Base (โครง route + valibot + รูปแบบคำตอบ): src/app/api/account/link/reclaim/route.ts
 */
import { NextResponse } from 'next/server'
import * as v from 'valibot'

import { verifyAppleIdentityToken } from '@/lib/apple/identity-token'
import { SHELL_COOKIE_NAME, isSignUpRestricted, parseAppVersion, resolveAppShell } from '@/lib/app-shell'
import { upsertAppleNativeUser } from '@/lib/auth'
import { isDeletedUser } from '@/lib/account-deletion'
import { createMobileTicket } from '@/lib/mobile-ticket'
import { prisma } from '@/lib/prisma'
import { APPLE_NONCE_COOKIE, replyClearingAppleNonce } from '@/lib/apple/native-nonce'

const NamePart = v.optional(v.pipe(v.string(), v.trim(), v.maxLength(60)))

const BodySchema = v.object({
  /* JWT ของ Apple — 4096 พอสำหรับโทเคนจริง (ราว 900 ตัวอักษร) และกันของยาวผิดปกติ */
  identityToken: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)),
  /**
   * ชื่อจากแผ่นของระบบ — Apple ส่งให้ **ครั้งแรกครั้งเดียว** ⇒ ต้องเก็บตอนสร้างบัญชี
   * ไม่งั้นระบบต้องไปถามชื่อเอง = ข้อที่ Apple ตีกลับมาแล้ว 2 รอบ (Guideline 4)
   * ใช้เป็น displayName เท่านั้น ไม่ใช่ตัวตน ⇒ รับจากหน้าเว็บได้ (ทางเว็บก็รับจาก form field)
   */
  fullName: v.optional(v.object({ givenName: NamePart, familyName: NamePart })),
})

export async function POST(request: Request) {
  const parsed = v.safeParse(BodySchema, await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: 'BAD_REQUEST' }, { status: 400 })
  }

  /**
   * 🛑 nonce ต้องมาจาก **คุกกี้ที่เซิร์ฟเวอร์ตั้งเอง** ห้ามรับจาก body
   *
   * รับจาก body = ผู้โจมตีคุมทั้งสองฝั่งของการเทียบ (ส่งโทเคนที่ขโมยมา พร้อม `nonce`
   * ที่อ่านออกมาจากโทเคนใบนั้นเอง) แล้วด่านผ่านทุกครั้ง — เป็นด่านที่ดูเหมือนมีแต่ไม่กันอะไร
   * เหตุผลเต็มอยู่ที่ `./start/route.ts`
   */
  const { cookies } = await import('next/headers')
  const jar = await cookies()
  const expectedNonce = jar.get(APPLE_NONCE_COOKIE)?.value ?? null
  if (!expectedNonce) {
    /* ไม่มีคุกกี้ = ไม่ได้เริ่มรอบนี้กับเรา (หรือเริ่มไว้นานเกิน 10 นาทีจนหมดอายุ)
       ให้เริ่มใหม่ ดีกว่าปล่อยผ่านโดยไม่ตรวจอะไรเลย */
    return NextResponse.json({ ok: false, reason: 'INVALID_TOKEN' }, { status: 401 })
  }

  const verified = await verifyAppleIdentityToken(parsed.output.identityToken, {
    expectedNonce,
  })
  if (!verified.ok) {
    /**
     * 🛑 บันทึก **เหตุผล** ไว้ใน log แต่ **ห้ามส่งกลับไปให้ client** — เหตุผลละเอียด
     * (`WRONG_AUDIENCE` vs `BAD_SIGNATURE`) บอกผู้โจมตีว่าเขาเข้าใกล้แค่ไหนแล้ว
     * ส่วนเราต้องอ่านมันให้ออกตอนตั้งค่าผิด ซึ่งเป็นสาเหตุที่เป็นไปได้มากที่สุดในวันแรก
     */
    console.error('[apple-native] โทเคนไม่ผ่าน:', verified.reason)
    return replyClearingAppleNonce({ ok: false, reason: 'INVALID_TOKEN' }, 401)
  }

  const account = await prisma.authAccount.findUnique({
    where: {
      provider_providerAccountId: { provider: 'APPLE', providerAccountId: verified.claims.sub },
    },
    select: { userId: true, user: { select: { deletedAt: true } } },
  })

  /**
   * ไม่เจอ หรือเจอแต่บัญชีถูกลบไปแล้ว → คำตอบเดียวกันทุกประการ
   *
   * 🛑 ห้ามแยกข้อความ: บัญชีที่ผู้ใช้สั่งลบต้องกลับเข้ามาไม่ได้ (Guideline 5.1.1(v)) และ
   * การแยกคำตอบจะกลายเป็นช่องให้เดาว่า Apple ID ไหนเคยมีบัญชีอยู่
   * (กติกาเดียวกับที่ `seller-credentials` ใน `lib/auth.ts` เขียนเตือนไว้แล้ว)
   *
   * ตอบ **200 ไม่ใช่ 404** เพราะนี่คือสถานะปกติที่หน้าจอต้องอธิบายให้ผู้ใช้เข้าใจ
   * ไม่ใช่ความผิดพลาดที่ต้องขึ้น "ลองใหม่อีกครั้ง"
   */
  if (account && isDeletedUser(account.user)) {
    return replyClearingAppleNonce({ ok: false, reason: 'NO_ACCOUNT' })
  }

  let userId = account?.userId ?? null
  if (!userId) {
    /**
     * ยังไม่เคยผูก Apple ID นี้ — สมัครได้ไหมขึ้นกับแอปรุ่นนี้ (เกณฑ์เดียวกับปุ่ม Facebook/LINE)
     *
     * 🛑 ห้ามสร้างให้แอปรุ่นที่ยังห้ามสมัคร — บัญชีจะถูก proxy ตัดทิ้งที่ด่าน 3.1.1 ทันที
     * กลายเป็นบัญชีกำพร้าที่ Apple ID นั้นใช้กับ Deep ไม่ได้อีกเลย (ภาคผนวก 6)
     */
    const userAgent = request.headers.get('user-agent') ?? ''
    const shell = resolveAppShell(jar.get(SHELL_COOKIE_NAME)?.value, userAgent)
    if (isSignUpRestricted(shell, parseAppVersion(userAgent))) {
      return replyClearingAppleNonce({ ok: false, reason: 'NO_ACCOUNT' })
    }
    const fn = parsed.output.fullName
    const name = [fn?.givenName, fn?.familyName].filter(Boolean).join(' ').trim() || null
    userId = await upsertAppleNativeUser({
      sub: verified.claims.sub,
      verifiedEmail: verified.claims.email ?? null,
      name,
    })
  }

  /**
   * ตั๋วใช้ครั้งเดียว อายุ 60 วินาที — หน้าเว็บเอาไปเรียก `signIn('mobile-ticket')` ต่อ
   * แล้ว `jwt` callback จะเติม `activeShopId` / `needsRegistration` / `needsOnboarding`
   * ให้ครบเหมือนทางเข้าอื่นทุกทาง (ห้าม mint JWT เองเพื่อกันธงหลุด — เหตุผลเดิมของ
   * provider `mobile-ticket` ที่เขียนไว้ใน `lib/auth.ts`)
   */
  const ticket = await createMobileTicket(userId, 'enter')
  return replyClearingAppleNonce({ ok: true, ticket })
}
