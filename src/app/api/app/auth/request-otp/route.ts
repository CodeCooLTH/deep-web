import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { AppRequestOtpSchema } from '@/lib/app-validations'
import { consumeOtpRequestQuota, isTestAccount, sendOtpViaSms, storeOtp } from '@/lib/otp'

// POST /api/app/auth/request-otp  { phone }
// ส่ง OTP ไปเบอร์ — ใช้ระบบ OTP เดียวกับเว็บ (storeOtp/sendOtpViaSms/rate-limit).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (body === null) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = v.safeParse(AppRequestOtpSchema, body)
  if (!parsed.success) return NextResponse.json({ error: 'เบอร์โทรไม่ถูกต้อง' }, { status: 400 })

  const { phone } = parsed.output

  // rate-limit เดียวกับเว็บ (3 ครั้ง / 10 นาที ต่อเบอร์)
  if (!consumeOtpRequestQuota(phone)) {
    return NextResponse.json(
      { error: 'ขอ OTP บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
      { status: 429 },
    )
  }

  // TEST_ACCOUNTS → ข้ามส่ง SMS จริง (verifyOtp ตรวจ fixed-code เอง)
  if (isTestAccount(phone)) {
    return NextResponse.json({ ok: true, message: 'OTP sent' })
  }

  const otp = storeOtp(phone)
  try {
    await sendOtpViaSms(phone, otp)
  } catch {
    return NextResponse.json(
      { error: 'ไม่สามารถส่ง SMS ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง' },
      { status: 503 },
    )
  }

  return NextResponse.json({ ok: true, message: 'OTP sent' })
}
