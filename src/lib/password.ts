// รหัสผ่าน seller: ≥8, มีตัวอักษร+ตัวเลข+อักขระพิเศษ. hash ด้วย bcryptjs.
// max 1000 char = กัน bcryptjs CPU DoS (pure-JS process ทั้ง string ก่อน truncate 72 bytes)
// — pattern เดียวกับ admin-credentials ใน auth.ts
import bcrypt from 'bcryptjs'

const MAX_PASSWORD_LEN = 1000

export function isStrongPassword(pw: string): boolean {
  if (pw.length < 8 || pw.length > MAX_PASSWORD_LEN) return false
  const hasLetter = /[A-Za-z]/.test(pw)
  const hasNumber = /[0-9]/.test(pw)
  const hasSpecial = /[^A-Za-z0-9]/.test(pw)
  return hasLetter && hasNumber && hasSpecial
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10)
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  if (pw.length > MAX_PASSWORD_LEN) return false
  try {
    return await bcrypt.compare(pw, hash)
  } catch {
    return false
  }
}
