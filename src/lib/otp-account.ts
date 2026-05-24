/**
 * Helpers สำหรับ OTP-account flow ฝั่ง client (pure, testable)
 */

/**
 * parseIsNewUser — อ่าน isNewUser จาก response ของ POST /api/otp/send
 *
 * default = true (defensive): ถ้า API ไม่คืน field นี้ (เช่น DB lookup ล้มเหลว → omit)
 * ให้ถือว่าเป็น user ใหม่ → แสดงช่อง "ชื่อ" ไว้ก่อน (กรอกชื่อเกินจำเป็นดีกว่าไม่ได้กรอกแล้วสร้าง account ไม่มีชื่อ)
 */
export function parseIsNewUser(data: unknown): boolean {
  if (
    data !== null &&
    typeof data === 'object' &&
    typeof (data as { isNewUser?: unknown }).isNewUser === 'boolean'
  ) {
    return (data as { isNewUser: boolean }).isNewUser
  }
  return true
}
