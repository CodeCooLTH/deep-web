/**
 * กติการหัสผ่านใหม่ฝั่งหน้าจอ (SSOT · 2026-10-10)
 *
 * ใช้ร่วมกัน 3 ที่ — ห้ามเขียนกติกาเองที่จุดใช้งาน:
 *   - หน้า "ตั้งรหัสผ่านใหม่" หลังลืมรหัส (`seller/auth/new-pass` · Yup schema ใช้ข้อความชุดนี้)
 *   - ป๊อปอัป "ตั้งรหัสผ่านใหม่" ในหน้าบัญชี (`account/components/set-password-dialog.ts`)
 *   - แถบความแข็งแรง `PasswordInputWithStrength`
 *
 * ต้องสอดคล้องกับ `isStrongPassword` ฝั่ง server (`src/lib/password.ts`) — ไฟล์นั้น import bcrypt
 * จึงใช้ในหน้าจอไม่ได้ (ฝั่งนี้มีไว้บอกผู้ใช้เร็ว ตัวกันจริงคือ server)
 */

export const NEW_PASSWORD_HINT = '≥8 ตัว มีตัวอักษร ตัวเลข และอักขระพิเศษ'

export const NEW_PASSWORD_MESSAGES = {
  required: 'กรุณากรอกรหัสผ่านใหม่',
  min: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร',
  letter: 'ต้องมีตัวอักษร',
  number: 'ต้องมีตัวเลข',
  special: 'ต้องมีอักขระพิเศษ',
  confirmRequired: 'กรุณายืนยันรหัสผ่าน',
  mismatch: 'รหัสผ่านไม่ตรงกัน',
} as const

export const NEW_PASSWORD_PATTERNS = {
  letter: /[a-zA-Z]/,
  number: /\d/,
  special: /[\W_]/,
} as const

/** ข้อความผิดข้อแรก (ลำดับเดียวกับ Yup schema ของหน้า new-pass) · ผ่านหมด = null */
export function newPasswordError(password: string, confirm: string): string | null {
  if (!password) return NEW_PASSWORD_MESSAGES.required
  if (password.length < 8) return NEW_PASSWORD_MESSAGES.min
  if (!NEW_PASSWORD_PATTERNS.letter.test(password)) return NEW_PASSWORD_MESSAGES.letter
  if (!NEW_PASSWORD_PATTERNS.number.test(password)) return NEW_PASSWORD_MESSAGES.number
  if (!NEW_PASSWORD_PATTERNS.special.test(password)) return NEW_PASSWORD_MESSAGES.special
  if (!confirm) return NEW_PASSWORD_MESSAGES.confirmRequired
  if (confirm !== password) return NEW_PASSWORD_MESSAGES.mismatch
  return null
}

/** คะแนน 0–4 ของแถบความแข็งแรง (สูตรเดิมของ PasswordInputWithStrength) */
export function passwordStrength(password: string): number {
  let strength = 0
  if (password.length >= 8) strength++
  if (/[A-Z]/.test(password)) strength++
  if (/\d/.test(password)) strength++
  if (/[\W_]/.test(password)) strength++
  return strength
}
