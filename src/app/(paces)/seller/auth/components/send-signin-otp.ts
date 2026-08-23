/**
 * send-signin-otp — ยิง OTP เพื่อ "เข้าสู่ระบบด้วยเบอร์โทร" ฝั่งผู้ขาย
 *
 * ทำไมต้องแยกเป็นไฟล์: มีผู้เรียก 2 ที่ที่ต้องพูดเหมือนกันเป๊ะ — ฟอร์ม OTP ในหน้า sign-in
 * และปุ่ม "เข้าสู่ระบบด้วยเบอร์นี้" ในโนติสเบอร์ซ้ำของหน้า sign-up. ถ้าเขียนแยกกันสองชุด
 * ข้อความ error จะ drift กันเองภายหลังโดยไม่มี gate ไหนฟ้อง (Hard Rule 16)
 *
 * 🛑 ต้องเช็ค `check-phone` ก่อนส่ง SMS เสมอ ไม่ใช่ส่งไปก่อนแล้วค่อยรู้ทีหลัง — provider
 * `phone-otp` **สร้างบัญชีใหม่ให้เองเมื่อเบอร์นั้นยังไม่มีใครใช้** (ตั้งชื่อว่า `User_xxxx` /
 * `user_<timestamp>`) ⇒ คนที่พิมพ์เบอร์ผิดไปหนึ่งหลักจะได้บัญชีเปล่าใบใหม่เงียบ ๆ แทนที่จะ
 * ได้ยินว่า "เบอร์นี้ยังไม่มีบัญชี" และ SMS หนึ่งใบก็เสียไปฟรี ๆ ด้วย
 *
 * check-phone ล้มเหลวเอง (network/5xx) → เดินต่อ (fail-open) ท่าเดียวกับ `SignUpForm.tsx`
 * ที่ทำมาก่อน — ไม่ปิดประตูใส่คนที่ทำถูกเพราะด่านเสริมล่ม
 */

export type SendSigninOtpResult =
  | { ok: true }
  /** เบอร์นี้ยังไม่มีบัญชี — ต้องไปสมัคร ไม่ใช่เข้าสู่ระบบ */
  | { ok: false; reason: 'NO_ACCOUNT' }
  /** ขอ OTP บ่อยเกินไป (429 จาก /api/otp/send) */
  | { ok: false; reason: 'RATE_LIMITED' }
  /** ส่ง SMS ไม่ผ่าน / network error */
  | { ok: false; reason: 'FAILED' }

export type SigninOtpFailReason = Exclude<SendSigninOtpResult, { ok: true }>['reason']

/**
 * ข้อความไทยของแต่ละผลลัพธ์ — ใช้โดย `SignUpForm.tsx` ซึ่งยังเป็นไทยดิบทั้งไฟล์
 *
 * `SignInForm.tsx` ผ่าน i18n (feature 00047) แล้วจึงอ่านคำจาก dictionary แทน (`auth.signIn.otp*`)
 * ⇒ **สัญญาระหว่างสอง surface คือ "รหัสเหตุผล" ไม่ใช่ตัวข้อความ** เพิ่ม reason ใหม่เมื่อไร
 * ต้องเติมทั้งที่นี่และใน `th.ts`/`en.ts` (TypeScript บังคับที่นี่ให้ครบเองผ่าน Record)
 */
export const SIGNIN_OTP_MESSAGE: Record<SigninOtpFailReason, string> = {
  NO_ACCOUNT: 'เบอร์นี้ยังไม่มีบัญชี Deep กรุณาสมัครสมาชิกก่อน',
  RATE_LIMITED: 'คุณส่งคำขอบ่อยเกินไป กรุณารอสักครู่',
  FAILED: 'ส่งรหัส OTP ไม่สำเร็จ กรุณาลองใหม่',
}

export async function sendSigninOtp(phone: string): Promise<SendSigninOtpResult> {
  try {
    const checkRes = await fetch(`/api/users/check-phone?phone=${encodeURIComponent(phone)}`)
    if (checkRes.ok) {
      const data: { available: boolean } = await checkRes.json()
      // available = ยังไม่มีใครใช้เบอร์นี้ ⇒ ไม่มีบัญชีให้เข้า
      if (data.available) return { ok: false, reason: 'NO_ACCOUNT' }
    }

    const res = await fetch('/api/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact: phone, type: 'PHONE' }),
    })
    if (res.ok) return { ok: true }
    return { ok: false, reason: res.status === 429 ? 'RATE_LIMITED' : 'FAILED' }
  } catch {
    return { ok: false, reason: 'FAILED' }
  }
}

/**
 * ปลายทางหลังส่ง OTP สำเร็จ — `mode=signin` บอก `VerifyOtpForm` ว่าให้ล็อกอินเข้าบัญชีเดิม
 * (ไม่ใช่สมัครใหม่) และพา `callbackUrl` ต่อไปด้วยเพื่อไม่ให้บริบทคำเชิญ `/i/<slug>` หายไป
 * เฉพาะทาง OTP ทั้งที่ทางรหัสผ่านเก็บไว้ให้แล้ว
 */
export function signinOtpVerifyUrl(phone: string, callbackUrl?: string | null): string {
  const params = new URLSearchParams({ mode: 'signin', phone })
  if (callbackUrl) params.set('callbackUrl', callbackUrl)
  return `/auth/verify-otp?${params.toString()}`
}
