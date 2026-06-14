import { NextRequest, NextResponse } from 'next/server'
import { requireAppUser } from '@/lib/app-auth'
import { prisma } from '@/lib/prisma'
import { getTierDisplay } from '@/services/trust-score.service'
import { getMaxVerificationLevel } from '@/services/verification.service'

// GET /api/app/me — โปรไฟล์ buyer ปัจจุบัน + Trust (score/tier) + ระดับ verify + badges
export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response
  const { user } = auth

  // ดึงพร้อมกัน: badges + ระดับ verify (createdAt มากับ getAppUser แล้ว — ไม่ query ซ้ำ)
  const [earned, verifyLevel] = await Promise.all([
    prisma.userBadge.findMany({
      where: { userId: user.id },
      orderBy: { earnedAt: 'desc' },
      select: {
        earnedAt: true,
        badge: { select: { name: true, nameEN: true, icon: true, imageUrl: true } },
      },
    }),
    getMaxVerificationLevel(user.id),
  ])

  const trust = getTierDisplay(user.trustScore)

  return NextResponse.json({
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    avatar: user.avatar,
    phone: user.phone,
    trustScore: user.trustScore,
    isShop: user.isShop,
    // ชั้น Trust (กันโกง) — ตาม SSOT Tier Lists
    trust: { score: user.trustScore, letter: trust.letter, tier: trust.tier, dots: trust.dots },
    verifyLevel: verifyLevel > 0 ? verifyLevel : 0, // 0=ยังไม่ verify, 1=phone, 2=เอกสาร, 3=ธุรกิจ (กัน -Infinity)
    memberSinceMs: user.createdAt.getTime(),
    badges: earned.map((b) => ({
      name: b.badge.name,
      nameEN: b.badge.nameEN,
      icon: b.badge.icon,
      imageUrl: b.badge.imageUrl,
      earnedAtMs: b.earnedAt.getTime(),
    })),
  })
}
