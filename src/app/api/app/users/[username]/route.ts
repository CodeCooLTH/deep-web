import { NextRequest, NextResponse } from 'next/server'
import { findByUsername } from '@/services/user.service'
import { getTierDisplay } from '@/services/trust-score.service'

// GET /api/app/users/[username] — Public Profile (trust ของผู้ใช้คนอื่น) — public
export async function GET(_request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const user = await findByUsername(username)
  if (!user) return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 })

  const t = getTierDisplay(user.trustScore)
  return NextResponse.json({
    displayName: user.displayName,
    username: user.username,
    avatar: user.avatar,
    isShop: user.isShop,
    shopId: user.shop?.id ?? null,
    trust: { score: user.trustScore, letter: t.letter, tier: t.tier, dots: t.dots },
    badges: user.userBadges.map((ub) => ({
      name: ub.badge.name,
      nameEN: ub.badge.nameEN,
      icon: ub.badge.icon,
      imageUrl: ub.badge.imageUrl,
    })),
    memberSinceMs: user.createdAt.getTime(),
  })
}
