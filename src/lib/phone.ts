/**
 * normalize เบอร์ไทย → '0xxxxxxxxx' (digits only, strip space/dash/ฯลฯ)
 * ไม่ตรงรูปแบบ (^0[0-9]{9}$) → null. ใช้เป็น SSOT ก่อนเขียน Customer.phone (feat 00014).
 */
export function normalizePhone(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  return /^0[0-9]{9}$/.test(digits) ? digits : null
}
