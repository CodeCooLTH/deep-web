import type { NextRequest } from 'next/server'
import { decryptToken } from '@/lib/token-crypto'

/**
 * pending-connect — พก user access token จาก OAuth callback ไปจนถึงตอน user กดยืนยันเลือกเพจ
 * (feature 00018 — หน้า /settings/channels/select)
 *
 * เดิม callback เชื่อมทุกเพจทันที จึงไม่ต้องพา token ไปไหน. พอมีหน้าเลือกเพจคั่น การเชื่อมจริง
 * เกิดคนละ request กับตอนแลก code → ต้องมีที่พัก token ชั่วคราว
 *
 * ทำไม cookie ไม่ใช่ตาราง/หน่วยความจำ:
 *   - ตาราง: ต้อง migration + งาน cleanup แถวขยะ เพื่อข้อมูลอายุ 10 นาทีที่ทิ้งได้ — ไม่คุ้ม
 *   - in-memory: prod รันบน Vercel serverless หลาย instance — request ถัดไปคนละ instance ก็หาไม่เจอ
 *
 * มาตรการกันหลุด: เข้ารหัส AES-256-GCM (token-crypto ตัวเดียวกับที่ใช้เก็บ page token ใน DB) +
 * httpOnly (JS อ่านไม่ได้) + secure บน prod + sameSite lax + path แคบเฉพาะ 2 route ที่ใช้ +
 * อายุ 10 นาที + ลบทิ้งทันทีเมื่อยืนยันเสร็จ. plaintext token ไม่เคยถูกส่งกลับไปฝั่ง client
 */
export const OAUTH_USER_TOKEN_COOKIE = 'fb_channel_user_token'

export const PENDING_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const, // ต้อง lax — cookie ถูกตั้งบน response ที่เป็น redirect ข้ามโดเมนกลับมาจาก Facebook
  path: '/api/channels/facebook',
  maxAge: 600,
}

/**
 * อ่าน user token ที่พักไว้ — คืน null เมื่อไม่มี/หมดอายุ/ถอดรหัสไม่ผ่าน (cookie ถูกแก้ หรือ
 * CHANNEL_TOKEN_KEY เปลี่ยน) ทุกกรณีจบเหมือนกันสำหรับผู้ใช้: ต้องเริ่มเชื่อมใหม่
 */
export function readPendingUserToken(request: NextRequest): string | null {
  const raw = request.cookies.get(OAUTH_USER_TOKEN_COOKIE)?.value
  if (!raw) return null
  try {
    return decryptToken(raw)
  } catch {
    return null
  }
}
