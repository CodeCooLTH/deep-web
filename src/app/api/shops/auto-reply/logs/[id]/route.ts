import { NextRequest, NextResponse } from 'next/server'
import { requireShopContext, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { getLogDetail } from '@/services/auto-reply-log.service'

/**
 * GET บันทึกรายตัวพร้อม matchTrace เต็ม (AC-011-04 / GAP-01)
 *
 * นี่คือจุดเดียวที่ข้อความลูกค้าเต็ม ๆ ออกจาก server ได้ — ownership อยู่ใน WHERE ของ service
 * (findFirst ที่มี shopId) ไม่ใช่ findUnique แล้วเช็คทีหลัง (AC-024-06)
 */
export const dynamic = 'force-dynamic'

export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const { id } = await params
  const log = await getLogDetail(ctx.shopId, id)
  if (!log) return NextResponse.json({ error: 'ไม่พบบันทึกนี้' }, { status: 404 })
  return NextResponse.json(log, { headers: AUTO_REPLY_NO_STORE })
}
