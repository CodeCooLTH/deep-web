import { NextRequest, NextResponse } from 'next/server'
import { requireAppUser } from '@/lib/app-auth'
import { prisma } from '@/lib/prisma'

// GET /api/app/notifications — แจ้งเตือนของ buyer ปัจจุบัน
// (ตัวแจ้งเตือนถูกสร้างตอนมี event เช่น outbid/won — ซึ่งผูกกับ auction-close
//  ที่ยังไม่ทำ; โครงสร้างพร้อมแล้ว ตอนนี้จะว่างจนกว่าจะมี event generator)
export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response
  const rows = await prisma.notification.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json(
    rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      atMs: n.createdAt.getTime(),
      read: n.read,
      refId: n.refId,
    })),
  )
}
