/**
 * otp-paste — กระจายรหัสที่ผู้ใช้ "วาง" ลงช่อง OTP แบบช่องละหลัก
 *
 * ทำไมต้องแยกออกมาเป็นฟังก์ชันบริสุทธิ์: ตรรกะนี้ตัดสินว่าผู้ใช้จะกรอกรหัสได้หรือไม่ได้
 * แต่ถ้าอยู่ใน handler กลาง component มันจะไม่มีที่ให้เทสจับเลย (รีโปนี้ไม่มี jsdom) —
 * และความผิดของมันจะเงียบสนิท: ช่องที่ไม่ถูกเติมไม่ throw ไม่ทำให้ tsc/build แดง
 * ผู้ใช้แค่เห็นเลขไม่ครบแล้วสรุปว่าระบบพัง (docs/conventions/ui-boolean-needs-a-testable-home.md)
 */

/** จำนวนช่อง OTP ของทั้งระบบ */
export const OTP_LENGTH = 6

/**
 * คืนชุดตัวเลขใหม่หลังวาง `pasted` โดยเริ่มเติมที่ช่อง `startIndex`
 *
 * - ตัดอักขระที่ไม่ใช่ตัวเลขทิ้งก่อนเสมอ (ผู้ใช้มักก็อปมาทั้งประโยคจากแบนเนอร์ SMS)
 * - ล้นเกินช่องสุดท้าย = ทิ้งส่วนเกิน ไม่ใช่วนกลับช่องแรก
 * - วางค่าว่าง/ไม่มีตัวเลขเลย = คืนของเดิมทั้งชุด (ผู้เรียกใช้เป็นสัญญาณว่าไม่ต้อง preventDefault)
 */
export function distributeOtpPaste(
  current: readonly string[],
  startIndex: number,
  pasted: string,
): string[] {
  const digits = pasted.replace(/\D/g, '')
  if (!digits) return [...current]

  const next = [...current]
  for (let k = 0; k < digits.length && startIndex + k < OTP_LENGTH; k++) {
    next[startIndex + k] = digits[k]
  }
  return next
}

/**
 * ช่องที่ควรได้โฟกัสหลังวาง = ช่องสุดท้ายที่เพิ่งถูกเติม
 *
 * ไม่ใช่ "ช่องถัดจากนั้น" เพราะเมื่อวางครบ 6 หลักจะไม่มีช่องถัดไปให้โฟกัส แล้วโฟกัสจะหลุด
 * ออกจากกลุ่ม input ทั้งก้อน (ผู้ใช้ที่กด Backspace ต่อจะไม่ได้แก้ตัวเลขที่เพิ่งวาง)
 */
export function otpFocusIndexAfterPaste(startIndex: number, pasted: string): number {
  const digits = pasted.replace(/\D/g, '')
  if (!digits) return startIndex
  return Math.min(startIndex + digits.length, OTP_LENGTH) - 1
}
