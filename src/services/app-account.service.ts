/**
 * Buyer App account service — upsert ผู้ใช้จากเบอร์โทรหลัง verify OTP สำเร็จ.
 *
 * mirror logic ของ phone-otp provider ใน lib/auth.ts (เวอร์ชันย่อ):
 * - หา User จาก phone; ไม่มี → สร้างใหม่ + L1 PHONE_OTP verification (auto-approved)
 *   + ผูกประวัติ guest (linkBuyerHistory) เหมือนเว็บ
 * - คืน User เพื่อให้ route ออก app token
 *
 * ใช้ DB เดียวกับเว็บ → account แอปกับเว็บเป็นคนเดียวกัน (เบอร์เดียว = user เดียว).
 */
import { prisma } from '@/lib/prisma'

export type AppAccount = {
  id: string
  displayName: string
  username: string
  avatar: string | null
  phone: string | null
  trustScore: number
  isShop: boolean
}

const SELECT = {
  id: true,
  displayName: true,
  username: true,
  avatar: true,
  phone: true,
  trustScore: true,
  isShop: true,
} as const

export async function upsertBuyerByPhone(
  phone: string,
  displayName?: string,
): Promise<AppAccount> {
  const existing = await prisma.user.findUnique({ where: { phone }, select: SELECT })
  if (existing) return existing

  // สร้าง user ใหม่ + L1 verification (auto-approved) — ตรง FR-2.2 ของเว็บ
  const name = displayName?.trim() || `User_${phone.slice(-4)}`
  const username = `user_${Date.now()}`
  let created
  try {
    created = await prisma.user.create({
      data: {
        phone,
        displayName: name,
        username,
        authAccounts: { create: { provider: 'PHONE', providerAccountId: phone } },
        verifications: {
          create: { type: 'PHONE_OTP', level: 1, status: 'APPROVED', reviewedAt: new Date() },
        },
      },
      select: SELECT,
    })
  } catch (err: unknown) {
    // race: เบอร์เดียวกันสมัครพร้อมกัน → P2002 unique → อ่านซ้ำ
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      const again = await prisma.user.findUnique({ where: { phone }, select: SELECT })
      if (again) return again
    }
    throw err
  }

  // best-effort: ผูกประวัติ guest (order/review ที่เคยทำด้วยเบอร์นี้) — ไม่ให้ fail login
  try {
    const { linkBuyerHistory } = await import('@/services/user.service')
    await linkBuyerHistory(created.id, phone)
  } catch (e) {
    console.error('[app-account] linkBuyerHistory failed', e)
  }

  return created
}
