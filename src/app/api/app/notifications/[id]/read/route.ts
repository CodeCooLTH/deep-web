import { NextRequest, NextResponse } from 'next/server'
import { requireAppUser } from '@/lib/app-auth'
import { prisma } from '@/lib/prisma'

// POST /api/app/notifications/[id]/read — ทำเครื่องหมายอ่านแล้ว (เจ้าของเท่านั้น)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response
  const { id } = await params
  // updateMany + เงื่อนไข userId → กันแก้ของคนอื่น (คืน count=0 ถ้าไม่ใช่ของตัวเอง)
  const res = await prisma.notification.updateMany({
    where: { id, userId: auth.user.id },
    data: { read: true },
  })
  if (res.count === 0) return NextResponse.json({ error: 'ไม่พบการแจ้งเตือน' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
