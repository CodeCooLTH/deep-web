/**
 * GET /api/o/sms/[code] — SMS short-code consume endpoint
 *
 * ที่เดียวที่ consume SmsCode + set signed cookie + redirect ไป UUID order URL
 * แยกออกจาก RSC page เพราะ RSC set cookie ไม่ได้ใน Next.js 16 (read-only)
 *
 * Security design:
 * - RC-1: rate-limit per-IP (globalThis singleton เดิมจาก sms-consume-rl.ts)
 * - RC-2: ทุก failure mode → redirect /o/link-invalid เดียว (ไม่มี reason ใน URL)
 * - RC-8: ห้าม log code/hash/phone/orderId ที่ไหนเลย
 * - Reload-safe: cookie ยังอยู่หลัง redirect → /o/{uuid} อ่าน cookie ได้ ไม่ consume ซ้ำ
 */
import { NextRequest, NextResponse } from 'next/server'

import { checkSmsConsumeRateLimit } from '@/lib/sms-consume-rl'
import { consumeSmsCode } from '@/services/sms-code.service'
import {
  SMS_UNLOCK_COOKIE,
  signSmsUnlock,
  smsUnlockCookieOpts,
} from '@/lib/sms-unlock-cookie'

// charset เป๊ะจาก sms-code.service.ts line 7 (ห้าม drift)
const SMS_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params

  // RC-1: rate-limit per-IP ก่อนทำอะไร
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  if (!checkSmsConsumeRateLimit(ip)) {
    // RC-2: rate-limited → uniform redirect (ไม่บอกว่า rate-limit)
    return NextResponse.redirect(new URL('/o/link-invalid', request.url))
  }

  // ตรวจ format ก่อน consume (กัน invalid query ไปถึง DB)
  if (!SMS_CODE_RE.test(code)) {
    return NextResponse.redirect(new URL('/o/link-invalid', request.url))
  }

  // RC-8: ห้าม log code/hash/phone/orderId — consumeSmsCode รับ rawCode ภายใน
  const result = await consumeSmsCode(code)

  if (!result || !result.order) {
    // RC-2: not-found / expired / used / phone-mismatch / order-mismatch → uniform
    return NextResponse.redirect(new URL('/o/link-invalid', request.url))
  }

  // สำเร็จ: set signed cookie + redirect ไป UUID order URL (302)
  // URL ปลายสะอาด — ไม่มี query param ใด ๆ (reload-safe: cookie persist)
  const res = NextResponse.redirect(
    new URL('/o/' + result.order.publicToken, request.url),
  )
  res.cookies.set(
    SMS_UNLOCK_COOKIE,
    signSmsUnlock(result.order.id),
    smsUnlockCookieOpts,
  )
  return res
}
