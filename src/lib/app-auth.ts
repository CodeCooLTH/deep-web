/**
 * Auth helper สำหรับ route `/api/app/*` (Buyer App / mobile)
 *
 * อ่าน Bearer token จาก `Authorization` header → verify (HMAC) → โหลด User.
 * route handler เรียก `requireAppUser(request)`:
 *   - คืน { user } ถ้า auth ผ่าน
 *   - คืน { response: 401 } ถ้าไม่ผ่าน → handler `return res.response`
 *
 * หมายเหตุ: `/api/app/*` ถูก exempt จาก CSRF Origin-check ใน proxy.ts
 * (มือถือไม่มี Origin header) — auth ที่นี่อาศัย Bearer token แทน.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAppToken } from '@/lib/app-token'

export type AppUser = {
  id: string
  displayName: string
  username: string
  avatar: string | null
  phone: string | null
  trustScore: number
  isShop: boolean
  createdAt: Date
}

const APP_USER_SELECT = {
  id: true,
  displayName: true,
  username: true,
  avatar: true,
  phone: true,
  trustScore: true,
  isShop: true,
  createdAt: true,
} as const

function bearerFromHeader(request: NextRequest): string | null {
  const h = request.headers.get('authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

/** คืน AppUser ถ้า token ถูกต้องและ user ยังอยู่, ไม่งั้น null. */
export async function getAppUser(request: NextRequest): Promise<AppUser | null> {
  const uid = verifyAppToken(bearerFromHeader(request))
  if (!uid) return null
  const user = await prisma.user.findUnique({ where: { id: uid }, select: APP_USER_SELECT })
  return user
}

/** JSON error ทรงเดียวกับ route เดิม (`{ error }`) — client app เช็ก err.message/status. */
export function appError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

/**
 * Gate ของ protected route. ใช้:
 *   const auth = await requireAppUser(request)
 *   if ('response' in auth) return auth.response
 *   const user = auth.user
 */
export async function requireAppUser(
  request: NextRequest,
): Promise<{ user: AppUser } | { response: NextResponse }> {
  const user = await getAppUser(request)
  if (!user) return { response: appError('ไม่ได้เข้าสู่ระบบ', 401) }
  return { user }
}
