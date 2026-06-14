import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { AppVerifyOtpSchema } from '@/lib/app-validations'
import { verifyOtp } from '@/lib/otp'
import { upsertBuyerByPhone } from '@/services/app-account.service'
import { signAppToken } from '@/lib/app-token'

// POST /api/app/auth/verify-otp  { phone, otp, displayName? }
// ตรวจ OTP → upsert user (เบอร์เดียว = user เดียวกับเว็บ) → ออก Bearer token ให้แอป.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (body === null) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = v.safeParse(AppVerifyOtpSchema, body)
  if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })

  const { phone, code, displayName } = parsed.output

  if (!verifyOtp(phone, code)) {
    return NextResponse.json({ error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' }, { status: 401 })
  }

  let user
  try {
    user = await upsertBuyerByPhone(phone, displayName)
  } catch (e) {
    console.error('[POST /api/app/auth/verify-otp] upsertBuyerByPhone failed', e)
    return NextResponse.json({ error: 'เข้าสู่ระบบไม่สำเร็จ' }, { status: 500 })
  }

  const token = signAppToken(user.id)
  // คืน `phone` ระดับบนสุดด้วย — แอป (Session = { token, phone }) อ่านตรงนั้น
  return NextResponse.json({ token, phone: user.phone, user })
}
