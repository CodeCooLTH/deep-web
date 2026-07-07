/**
 * GET /api/o/sms/[code] — SMS short-code consume endpoint
 *
 * ที่เดียวที่ consume SmsCode แล้ว redirect ไปหน้า sign-in พร้อม prefill เบอร์
 * (feature 00015 Order Claim & Forced Login — TFR-003: เลิก set cookie/auto-unlock,
 *  ให้ buyer login ผ่าน force-login gate ปกติแทน — ดู SDS.md §4.3, API.md §4.2)
 *
 * Security design:
 * - RC-1: rate-limit per-IP (globalThis singleton เดิมจาก sms-consume-rl.ts)
 * - RC-2: rate-limit/format ผิด → redirect /o/link-invalid เดียว (ไม่มี reason ใน URL, ไม่เปลี่ยน)
 * - RC-6: consume สำเร็จ → result.order.buyerContact การันตีไม่ null
 * - RC-8: ห้าม log code/hash/phone/orderId ที่ไหนเลย
 * - ไม่มี Set-Cookie อีกต่อไปในทุก branch (TFR-003)
 */
import { NextRequest, NextResponse } from 'next/server'

import { checkSmsConsumeRateLimit } from '@/lib/sms-consume-rl'
import { consumeSmsCode } from '@/services/sms-code.service'

// charset เป๊ะจาก sms-code.service.ts line 7 (ห้าม drift)
const SMS_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/

// QA bug2 fix: redirect base ต้องเป็น buyer host จริง ไม่ใช่ request.url
// (Next.js 16 Turbopack: request.url resolve เป็น http://localhost:PORT →
//  browser ตาม redirect ไป localhost แทน buyer host จริง). ใช้ pattern เดียวกับ
//  send-sms/route.ts (canonical). base=env คงที่ + path static/DB UUID/query =
//  ไม่มี open-redirect.
const BUYER_BASE =
  process.env.NEXT_PUBLIC_BUYER_URL ||
  process.env.NEXTAUTH_URL ||
  'https://deepthailand.app'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params

  // RC-1: rate-limit per-IP ก่อนทำอะไร
  // F1 security fix: fallback chain สำหรับ IP extraction
  // - prod (Vercel/reverse-proxy) จะมี x-forwarded-for เสมอ
  // - x-real-ip เป็น fallback สำหรับ proxy บางตัว (nginx, Cloudflare Workers) ที่ไม่ส่ง x-forwarded-for
  // - 'unknown' = fail-safe over-throttle (ไม่ใช่ under-throttle/bypass)
  //   หากไม่รู้ IP จริง ทุก request รวม bucket เดียวกัน → ยัง throttle อยู่ ไม่ใช่ข้ามไป
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip')?.trim() ??
    'unknown'

  if (!checkSmsConsumeRateLimit(ip)) {
    // RC-2: rate-limited → uniform redirect (ไม่บอกว่า rate-limit)
    return NextResponse.redirect(new URL('/o/link-invalid', BUYER_BASE))
  }

  // ตรวจ format ก่อน consume (กัน invalid query ไปถึง DB)
  if (!SMS_CODE_RE.test(code)) {
    return NextResponse.redirect(new URL('/o/link-invalid', BUYER_BASE))
  }

  // RC-8: ห้าม log code/hash/phone/orderId — consumeSmsCode รับ rawCode ภายใน
  const result = await consumeSmsCode(code)

  if (!result || !result.order) {
    // TFR-003: consume ล้มเหลว (not-found/expired/used/phone-mismatch) → sign-in เปล่า
    // แทน /o/link-invalid — fall back เข้า flow login ปกติ ไม่ hard-error (TD-003)
    const url = new URL('/auth/sign-in', BUYER_BASE)
    url.searchParams.set('smsExpired', '1')
    return NextResponse.redirect(url)
  }

  // สำเร็จ: redirect ไปหน้า sign-in พร้อม callbackUrl กลับมา order นี้ + prefill เบอร์
  // RC-6 การันตีว่า buyerContact ไม่ null เมื่อ consume สำเร็จ (service ปิด open-claim
  // ใน tx เดียวกัน) — non-null assertion ปลอดภัยตาม guarantee นี้ ไม่ใช่ TS type เอง
  const url = new URL('/auth/sign-in', BUYER_BASE)
  url.searchParams.set('callbackUrl', '/o/' + result.order.publicToken)
  url.searchParams.set('prefillPhone', result.order.buyerContact!)
  return NextResponse.redirect(url)
}
