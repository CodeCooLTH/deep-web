import { NextRequest, NextResponse } from 'next/server'
import { requireAppUser } from '@/lib/app-auth'
import { prisma } from '@/lib/prisma'

// GET /api/app/me — โปรไฟล์ buyer ปัจจุบัน (ตัวเอง) + trustScore + badges ที่ได้
export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response
  const { user } = auth

  // badges ที่ผู้ใช้ได้รับ — ดึงจากระบบ badge เดิมของเว็บ
  const earned = await prisma.userBadge.findMany({
    where: { userId: user.id },
    orderBy: { earnedAt: 'desc' },
    select: {
      earnedAt: true,
      badge: { select: { name: true, nameEN: true, icon: true, imageUrl: true } },
    },
  })

  return NextResponse.json({
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    avatar: user.avatar,
    phone: user.phone,
    trustScore: user.trustScore,
    isShop: user.isShop,
    badges: earned.map((b) => ({
      name: b.badge.name,
      nameEN: b.badge.nameEN,
      icon: b.badge.icon,
      imageUrl: b.badge.imageUrl,
      earnedAtMs: b.earnedAt.getTime(),
    })),
  })
}
